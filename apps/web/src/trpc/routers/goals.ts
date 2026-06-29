import { z } from "zod";
import { eq, and, isNull, inArray } from "drizzle-orm";
import { goals, aiEmployees, activityLog } from "@beast/db";
import { generateGoalBreakdown, recalculateGoalProgress } from "@beast/ai";
import { createTRPCRouter, protectedProcedure } from "../init";

export const goalsRouter = createTRPCRouter({
  /** All goals for this company. Includes both company-level and department sub-goals. */
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.goals.findMany({
      where: eq(goals.companyId, ctx.companyId),
      orderBy: (g, { desc }) => [desc(g.createdAt)],
    });
  }),

  /** Company-level goals only (no parent). */
  listTopLevel: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.goals.findMany({
      where: and(eq(goals.companyId, ctx.companyId), isNull(goals.parentGoalId)),
      orderBy: (g, { desc }) => [desc(g.createdAt)],
    });
  }),

  /** Sub-goals for a specific parent goal. */
  listSubGoals: protectedProcedure
    .input(z.object({ parentGoalId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.goals.findMany({
        where: and(
          eq(goals.companyId, ctx.companyId),
          eq(goals.parentGoalId, input.parentGoalId),
        ),
        orderBy: (g, { asc }) => [asc(g.createdAt)],
      });
    }),

  /** Goals assigned to a specific employee. */
  listByEmployee: protectedProcedure
    .input(z.object({ employeeId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.goals.findMany({
        where: and(
          eq(goals.companyId, ctx.companyId),
          eq(goals.aiEmployeeId, input.employeeId),
        ),
        orderBy: (g, { desc }) => [desc(g.createdAt)],
      });
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.goals.findFirst({
        where: and(eq(goals.id, input.id), eq(goals.companyId, ctx.companyId)),
      });
    }),

  /** Founder creates a company-level goal. */
  create: protectedProcedure
    .input(z.object({
      title: z.string().min(1),
      description: z.string().optional(),
      targetMetric: z.string().optional(),
      targetDate: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [goal] = await ctx.db.insert(goals).values({
        companyId: ctx.companyId,
        title: input.title,
        description: input.description,
        targetMetric: input.targetMetric,
        targetDate: input.targetDate,
      }).returning();
      if (!goal) throw new Error("Failed to create goal");
      return goal;
    }),

  /**
   * AI proposes a breakdown of a company goal into department sub-goals.
   * Returns proposed sub-goals with reasoning - founder must approve before creation.
   */
  proposeBreakdown: protectedProcedure
    .input(z.object({ goalId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const goal = await ctx.db.query.goals.findFirst({
        where: and(eq(goals.id, input.goalId), eq(goals.companyId, ctx.companyId)),
      });

      if (!goal) throw new Error("Goal not found");
      if (goal.parentGoalId) throw new Error("Can only break down top-level goals");

      const breakdown = await generateGoalBreakdown({
        goalId: goal.id,
        companyId: ctx.companyId,
        goalTitle: goal.title,
        goalDescription: goal.description ?? undefined,
        targetMetric: goal.targetMetric ?? undefined,
        targetDate: goal.targetDate ?? undefined,
      });

      return breakdown;
    }),

  /**
   * Founder approves or rejects a proposed goal breakdown.
   * If approved, creates sub-goal records linked to the parent.
   */
  approveBreakdown: protectedProcedure
    .input(z.object({
      goalId: z.string().uuid(),
      approved: z.boolean(),
      subGoals: z.array(z.object({
        title: z.string(),
        description: z.string(),
        targetMetric: z.string(),
        aiEmployeeId: z.string().uuid(),
      })).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!input.approved || !input.subGoals) {
        return { created: 0 };
      }

      // Verify parent goal exists and belongs to company
      const parent = await ctx.db.query.goals.findFirst({
        where: and(eq(goals.id, input.goalId), eq(goals.companyId, ctx.companyId)),
      });

      if (!parent) throw new Error("Goal not found");

      // Verify all employee IDs belong to this company
      const employeeIds = input.subGoals.map((sg) => sg.aiEmployeeId);
      const validEmployees = await ctx.db.query.aiEmployees.findMany({
        where: and(
          inArray(aiEmployees.id, employeeIds),
          eq(aiEmployees.companyId, ctx.companyId),
        ),
        columns: { id: true },
      });
      const validIds = new Set(validEmployees.map((e) => e.id));
      const invalidIds = employeeIds.filter((id) => !validIds.has(id));
      if (invalidIds.length > 0) {
        throw new Error(`Invalid employee IDs: ${invalidIds.join(", ")}`);
      }

      // Insert sub-goals
      const created = await ctx.db.insert(goals).values(
        input.subGoals.map((sg) => ({
          companyId: ctx.companyId,
          parentGoalId: input.goalId,
          aiEmployeeId: sg.aiEmployeeId,
          title: sg.title,
          description: sg.description,
          targetMetric: sg.targetMetric,
          targetDate: parent.targetDate,
          status: "active" as const,
        })),
      ).returning({ id: goals.id });

      return { created: created.length };
    }),

  updateProgress: protectedProcedure
    .input(z.object({
      goalId: z.string().uuid(),
      progressPct: z.number().min(0).max(100),
    }))
    .mutation(async ({ ctx, input }) => {
      const before = await ctx.db.query.goals.findFirst({
        where: and(eq(goals.id, input.goalId), eq(goals.companyId, ctx.companyId)),
        columns: { id: true, title: true, status: true, parentGoalId: true, aiEmployeeId: true },
      });
      if (!before) throw new Error("Goal not found");

      const shouldAutoComplete = input.progressPct === 100 && before.status === "active";
      const nextStatus = shouldAutoComplete ? "completed" : before.status;

      // Atomic so a goal can't flip to completed without its activity log row.
      await ctx.db.transaction(async (tx) => {
        await tx
          .update(goals)
          .set({ progressPct: input.progressPct, status: nextStatus, updatedAt: new Date() })
          .where(and(eq(goals.id, input.goalId), eq(goals.companyId, ctx.companyId)));

        if (shouldAutoComplete) {
          await tx.insert(activityLog).values({
            companyId: ctx.companyId,
            aiEmployeeId: before.aiEmployeeId,
            actionType: "goal_completed",
            actionDetail: {
              goalId: before.id,
              goalTitle: before.title,
              progressPct: input.progressPct,
            },
          });
        }
      });

      if (before.parentGoalId) {
        await recalculateGoalProgress(before.parentGoalId, ctx.companyId);
      }
    }),

  /** Update goal status (active/completed/paused/archived). */
  updateStatus: protectedProcedure
    .input(z.object({
      goalId: z.string().uuid(),
      status: z.enum(["active", "completed", "paused", "archived"]),
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(goals)
        .set({ status: input.status, updatedAt: new Date() })
        .where(and(eq(goals.id, input.goalId), eq(goals.companyId, ctx.companyId)));
    }),

  /**
   * Founder edits a goal's text, target metric, or target date.
   * Status changes go through updateStatus; this is for the body content
   * of the goal only.
   */
  update: protectedProcedure
    .input(z.object({
      goalId: z.string().uuid(),
      title: z.string().min(1).max(200),
      description: z.string().max(2000).nullable().optional(),
      targetMetric: z.string().max(200).nullable().optional(),
      targetDate: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(goals)
        .set({
          title: input.title,
          description: input.description ?? null,
          targetMetric: input.targetMetric ?? null,
          targetDate: input.targetDate ?? null,
          updatedAt: new Date(),
        })
        .where(and(eq(goals.id, input.goalId), eq(goals.companyId, ctx.companyId)));
    }),
});
