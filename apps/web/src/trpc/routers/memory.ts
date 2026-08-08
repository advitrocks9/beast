import { z } from "zod";
import { eq, and, gte, inArray, isNull, or } from "drizzle-orm";
import { aiEmployees, proceduralMemories, ruleCandidates, episodicMemories, semanticMemories } from "@beast/db";
import { seedFounderRule, candidateThreshold } from "@beast/ai";
import { createTRPCRouter, protectedProcedure } from "../init";
import { demoWhere } from "@/lib/demo-overlay";

const FOUNDER_SEED_WEIGHT = 2.0;
const RULE_TYPES = ["style_rule", "avoid_pattern", "approved_example"] as const;

export const memoryRouter = createTRPCRouter({
  /**
   * Episodic tier: per-event records, newest first. The browse surface for
   * "what happened", scoped to one employee when asked.
   */
  listEpisodic: protectedProcedure
    .input(z.object({
      employeeId: z.string().uuid().optional(),
      limit: z.number().int().min(1).max(100).default(50),
    }).default({}))
    .query(async ({ ctx, input }) => {
      const conditions = [
        eq(episodicMemories.tenantId, ctx.companyId),
        demoWhere(ctx.demo.sessionId).seedOrMine(episodicMemories.demoSessionId),
      ];
      if (input.employeeId) {
        conditions.push(eq(episodicMemories.agentId, input.employeeId));
      }
      return ctx.db.query.episodicMemories.findMany({
        where: and(...conditions),
        columns: {
          id: true,
          agentId: true,
          episodeType: true,
          summary: true,
          occurredAt: true,
          salienceScore: true,
          taskId: true,
          isConsolidated: true,
          demoSessionId: true,
        },
        orderBy: (m, { desc }) => [desc(m.occurredAt)],
        limit: input.limit,
      });
    }),

  /**
   * Semantic tier: current company facts, newest first. An employee filter
   * returns shared facts plus that employee's scoped ones.
   */
  listSemantic: protectedProcedure
    .input(z.object({
      employeeId: z.string().uuid().optional(),
      limit: z.number().int().min(1).max(100).default(50),
    }).default({}))
    .query(async ({ ctx, input }) => {
      const conditions = [
        eq(semanticMemories.tenantId, ctx.companyId),
        isNull(semanticMemories.supersededBy),
      ];
      if (input.employeeId) {
        // or() is undefined only when called with zero conditions
        conditions.push(
          or(isNull(semanticMemories.agentId), eq(semanticMemories.agentId, input.employeeId))!,
        );
      }
      return ctx.db.query.semanticMemories.findMany({
        where: and(...conditions),
        columns: {
          id: true,
          scope: true,
          agentId: true,
          fact: true,
          context: true,
          category: true,
          entityName: true,
          entityType: true,
          confidence: true,
          source: true,
          updatedAt: true,
        },
        orderBy: (m, { desc }) => [desc(m.updatedAt)],
        limit: input.limit,
      });
    }),

  /**
   * Procedural tier: every current promoted rule with its confidence,
   * corroboration count, and origin. No confidence floor; the founder needs
   * to see and edit every rule, not just the high-confidence subset.
   */
  listProcedural: protectedProcedure
    .input(z.object({ employeeId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.query.proceduralMemories.findMany({
        where: and(
          eq(proceduralMemories.agentId, input.employeeId),
          eq(proceduralMemories.tenantId, ctx.companyId),
          eq(proceduralMemories.isCurrent, true),
          demoWhere(ctx.demo.sessionId).seedOrMine(proceduralMemories.demoSessionId),
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
          confidence: true,
          tasksAppliedTo: true,
          approvalRateDelta: true,
          version: true,
          createdAt: true,
          sourceEpisodes: true,
          demoSessionId: true,
        },
        orderBy: (pm, { desc }) => [desc(pm.signalWeight), desc(pm.createdAt)],
      });

      const promotingCandidates = rows.length > 0
        ? await ctx.db.query.ruleCandidates.findMany({
            where: inArray(ruleCandidates.promotedToId, rows.map((r) => r.id)),
            columns: { promotedToId: true, distinctReviewCount: true },
          })
        : [];
      const candidateByRule = new Map(
        promotingCandidates.map((c) => [c.promotedToId, c]),
      );

      // A founder-authored rule promotes off one synthetic review; anything
      // corroborated across reviews (or seeded that way) reads as learned.
      return rows.map((r) => {
        const candidate = candidateByRule.get(r.id);
        return {
          ...r,
          corroborationCount: candidate?.distinctReviewCount ?? r.signalCount,
          origin: (candidate && candidate.distinctReviewCount <= 1 ? "founder" : "learned") as
            | "founder"
            | "learned",
        };
      });
    }),

  /**
   * Rule candidates still accumulating confidence, seed plus the demo
   * visitor's session overlay. A session clone shadows the seed candidate it
   * was copied from (same agent + title; candidates have no supersedes
   * column).
   */
  listCandidates: protectedProcedure
    .input(z.object({ employeeId: z.string().uuid().optional() }).default({}))
    .query(async ({ ctx, input }) => {
      const conditions = [
        eq(ruleCandidates.tenantId, ctx.companyId),
        demoWhere(ctx.demo.sessionId).seedOrMine(ruleCandidates.demoSessionId),
      ];
      if (input.employeeId) {
        conditions.push(eq(ruleCandidates.agentId, input.employeeId));
      }
      const rows = await ctx.db.query.ruleCandidates.findMany({
        where: and(...conditions),
        orderBy: (c, { desc }) => [desc(c.updatedAt)],
      });

      const sessionKeys = new Set(
        rows
          .filter((r) => r.demoSessionId !== null)
          .map((r) => `${r.agentId}:${r.title}`),
      );
      return rows
        .filter((r) => r.demoSessionId !== null || !sessionKeys.has(`${r.agentId}:${r.title}`))
        .map((r) => ({
          id: r.id,
          agentId: r.agentId,
          ruleType: r.ruleType,
          taskScope: r.taskScope,
          title: r.title,
          description: r.description,
          confidence: r.confidence,
          distinctReviewCount: r.distinctReviewCount,
          threshold: candidateThreshold(r.ruleType),
          promotedRuleId: r.promotedToId,
          lastSignalAt: r.updatedAt,
        }));
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

      const { ruleId } = await seedFounderRule({
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
        weight: FOUNDER_SEED_WEIGHT,
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
