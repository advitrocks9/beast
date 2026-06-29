import { z } from "zod";
import { eq, and, gte } from "drizzle-orm";
import { aiEmployees, proceduralMemories } from "@beast/db";
import { upsertProceduralRule } from "@beast/ai";
import { createTRPCRouter, protectedProcedure } from "../init";

const CONFIDENCE_FLOOR = 0.7;
const MAX_RULES = 8;
const FOUNDER_SEED_WEIGHT = 2.0;
const RULE_TYPES = ["style_rule", "avoid_pattern", "approved_example"] as const;

export interface AppliedRuleSummary {
  ruleId: string;
  summary: string;
  evidence: string;
  extractedFromDeliverableId: string;
  extractedFromTitle: string;
  extractedAt: string;
  confidence: number;
  tasksAppliedTo: number;
}

export const memoryRouter = createTRPCRouter({
  /**
   * Top high-confidence procedural rules for the dashboard memory pill.
   * Defaults to the company's first AI employee when no employeeId is passed.
   */
  listAppliedRules: protectedProcedure
    .input(
      z.object({ employeeId: z.string().uuid().optional() }).optional(),
    )
    .query(async ({ ctx, input }): Promise<AppliedRuleSummary[]> => {
      let employeeId = input?.employeeId;
      if (!employeeId) {
        const first = await ctx.db.query.aiEmployees.findFirst({
          where: eq(aiEmployees.companyId, ctx.companyId),
          orderBy: (e, { asc }) => [asc(e.createdAt)],
          columns: { id: true },
        });
        if (!first) return [];
        employeeId = first.id;
      }

      const rows = await ctx.db.query.proceduralMemories.findMany({
        where: and(
          eq(proceduralMemories.agentId, employeeId),
          eq(proceduralMemories.tenantId, ctx.companyId),
          eq(proceduralMemories.isCurrent, true),
        ),
        columns: {
          id: true,
          title: true,
          description: true,
          sourceEpisodes: true,
          signalWeight: true,
          createdAt: true,
          tasksAppliedTo: true,
        },
        orderBy: (pm, { desc }) => [desc(pm.signalWeight), desc(pm.tasksAppliedTo)],
      });

      return rows
        .filter((r) => (r.signalWeight ?? 0) >= CONFIDENCE_FLOOR)
        .slice(0, MAX_RULES)
        .map((r) => ({
          ruleId: r.id,
          summary: r.title,
          evidence: r.description,
          extractedFromDeliverableId: r.sourceEpisodes?.[0] ?? "",
          extractedFromTitle: "",
          extractedAt: r.createdAt.toISOString(),
          confidence: r.signalWeight ?? 1.0,
          tasksAppliedTo: r.tasksAppliedTo ?? 0,
        }));
    }),

  /**
   * All current rules for management. No confidence floor; founder needs to
   * see and edit every rule, not just the high-confidence subset.
   */
  listAllRules: protectedProcedure
    .input(z.object({ employeeId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.query.proceduralMemories.findMany({
        where: and(
          eq(proceduralMemories.agentId, input.employeeId),
          eq(proceduralMemories.tenantId, ctx.companyId),
          eq(proceduralMemories.isCurrent, true),
        ),
        columns: {
          id: true,
          ruleType: true,
          title: true,
          description: true,
          taskScope: true,
          examples: true,
          signalWeight: true,
          signalCount: true,
          tasksAppliedTo: true,
          approvalRateDelta: true,
          version: true,
          createdAt: true,
          sourceEpisodes: true,
        },
        orderBy: (pm, { desc }) => [desc(pm.signalWeight), desc(pm.createdAt)],
      });
      return rows;
    }),

  /**
   * Founder-authored rule. Lands directly in procedural memory with high
   * signal weight (no waiting for the threshold accumulation in
   * extractFromFeedback). The fastest path to good output for a new tenant.
   */
  createManualRule: protectedProcedure
    .input(z.object({
      employeeId: z.string().uuid(),
      ruleType: z.enum(RULE_TYPES),
      title: z.string().min(3).max(120),
      description: z.string().min(3).max(800),
      taskScope: z.array(z.string()).max(8).default([]),
      goodExamples: z.array(z.string().max(500)).max(3).default([]),
      badExamples: z.array(z.string().max(500)).max(3).default([]),
    }))
    .mutation(async ({ ctx, input }) => {
      const employee = await ctx.db.query.aiEmployees.findFirst({
        where: and(
          eq(aiEmployees.id, input.employeeId),
          eq(aiEmployees.companyId, ctx.companyId),
        ),
        columns: { id: true },
      });
      if (!employee) throw new Error("Employee not found");

      const ruleId = await upsertProceduralRule({
        agentId: input.employeeId,
        tenantId: ctx.companyId,
        ruleType: input.ruleType,
        title: input.title,
        description: input.description,
        taskScope: input.taskScope,
        examples: {
          good: input.goodExamples.length > 0 ? input.goodExamples : undefined,
          bad: input.badExamples.length > 0 ? input.badExamples : undefined,
        },
        sourceEpisodes: [],
        signalCount: 1,
        signalWeight: FOUNDER_SEED_WEIGHT,
      });

      return { ruleId };
    }),

  /**
   * Trailing-7d learning summary for the dashboard "this week" pill.
   * Aggregates current procedural rules created in the last 7 days across
   * all the company's employees (or scoped to one). The consolidation
   * worker promotes rules with createdAt=now(), so this is a clean
   * proxy for "what the brain learned recently".
   */
  consolidationStats: protectedProcedure
    .input(z.object({ employeeId: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const conditions = [
        eq(proceduralMemories.tenantId, ctx.companyId),
        eq(proceduralMemories.isCurrent, true),
        gte(proceduralMemories.createdAt, since),
      ];
      if (input?.employeeId) {
        conditions.push(eq(proceduralMemories.agentId, input.employeeId));
      }

      const rows = await ctx.db.query.proceduralMemories.findMany({
        where: and(...conditions),
        columns: {
          id: true,
          ruleType: true,
          title: true,
          description: true,
          agentId: true,
          createdAt: true,
          signalWeight: true,
        },
        orderBy: (pm, { desc }) => [desc(pm.createdAt)],
      });

      const byType: Record<string, number> = {
        style_rule: 0,
        avoid_pattern: 0,
        approved_example: 0,
      };
      for (const r of rows) {
        byType[r.ruleType] = (byType[r.ruleType] ?? 0) + 1;
      }

      const latest = rows[0]
        ? {
            id: rows[0].id,
            title: rows[0].title,
            ruleType: rows[0].ruleType,
            createdAt: rows[0].createdAt,
          }
        : null;

      return {
        total: rows.length,
        byType,
        latest,
      };
    }),

  /**
   * Founder-initiated deactivation. Marks the rule non-current and sets the
   * deprecation reason. Append-only history is preserved.
   */
  deactivateRule: protectedProcedure
    .input(z.object({ ruleId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(proceduralMemories)
        .set({
          isCurrent: false,
          deprecatedAt: new Date(),
          deprecatedReason: "founder_deactivated",
        })
        .where(
          and(
            eq(proceduralMemories.id, input.ruleId),
            eq(proceduralMemories.tenantId, ctx.companyId),
          ),
        );
    }),

  /**
   * Rules deprecated in the last 7 days. Surfaces both founder-deactivations
   * and auto-rollbacks from detectDrift so the founder can see why a rule
   * disappeared from the active list.
   */
  listDeprecatedRules: protectedProcedure
    .input(z.object({ employeeId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const rows = await ctx.db.query.proceduralMemories.findMany({
        where: and(
          eq(proceduralMemories.agentId, input.employeeId),
          eq(proceduralMemories.tenantId, ctx.companyId),
          eq(proceduralMemories.isCurrent, false),
          gte(proceduralMemories.deprecatedAt, sevenDaysAgo),
        ),
        columns: {
          id: true,
          ruleType: true,
          title: true,
          description: true,
          taskScope: true,
          deprecatedAt: true,
          deprecatedReason: true,
          version: true,
        },
        orderBy: (pm, { desc }) => [desc(pm.deprecatedAt)],
      });
      return rows;
    }),

  /**
   * Reactivate a recently-deprecated rule. Clears the deprecation fields
   * and resets approvalRateDelta so detectDrift starts fresh after the
   * tasksAppliedTo>=5 gate is met again.
   */
  restoreRule: protectedProcedure
    .input(z.object({ ruleId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(proceduralMemories)
        .set({
          isCurrent: true,
          deprecatedAt: null,
          deprecatedReason: null,
          approvalRateDelta: null,
        })
        .where(
          and(
            eq(proceduralMemories.id, input.ruleId),
            eq(proceduralMemories.tenantId, ctx.companyId),
          ),
        );
    }),
});
