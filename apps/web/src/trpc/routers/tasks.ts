import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, isNotNull, desc, inArray } from "drizzle-orm";
import { tasks, aiEmployees, companies, goals, chatMessages, activityLog } from "@beast/db";
import { TASK_STATUSES, ONBOARDING_STARTERS, starterById } from "@beast/shared";
import { classifyTask, getSkillsForRole, advanceChain, computeFirstOccurrence, extractRuleFromRationale } from "@beast/ai";
import type { SpawnPayload, RecurrenceConfig } from "@beast/ai";
import { auth as triggerAuth, tasks as triggerTasks } from "@trigger.dev/sdk";
import { createTRPCRouter, protectedProcedure, assertNotDemo } from "../init";
import { trackEvent } from "@/lib/events/track";

/** Wraps Trigger.dev task invocation for advanceChain. */
async function triggerExecuteTask(payload: SpawnPayload): Promise<{ id: string }> {
  const handle = await triggerTasks.trigger("execute-task", payload);
  return { id: handle.id };
}

export const tasksRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({
      employeeId: z.string().uuid().optional(),
      status: z.enum(TASK_STATUSES).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const conditions = [eq(tasks.companyId, ctx.companyId)];
      if (input.employeeId) {
        conditions.push(eq(tasks.aiEmployeeId, input.employeeId));
      }
      if (input.status) {
        conditions.push(eq(tasks.status, input.status));
      }
      return ctx.db.query.tasks.findMany({
        where: and(...conditions),
        orderBy: (t, { desc }) => [desc(t.createdAt)],
      });
    }),

  create: protectedProcedure
    .input(z.object({
      aiEmployeeId: z.string().uuid(),
      title: z.string(),
      brief: z.record(z.unknown()),
      taskType: z.string(),
      goalId: z.string().uuid().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      assertNotDemo("Running a live agent task");

      // Verify the target employee belongs to this company before writing a
      // task that references it (otherwise a caller could point a task at
      // another tenant's employee id).
      const employee = await ctx.db.query.aiEmployees.findFirst({
        where: and(eq(aiEmployees.id, input.aiEmployeeId), eq(aiEmployees.companyId, ctx.companyId)),
        columns: { name: true, roleType: true },
      });
      if (!employee) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
      }

      // Hydrate brief.pinnedGoal from goalId so the agent persona's
      // "Pinned founder goal" line lands in the task message. goalId is only
      // persisted when it resolves to a goal in this company.
      let briefForInsert = input.brief;
      let validGoalId: string | undefined = undefined;
      if (input.goalId) {
        const goal = await ctx.db.query.goals.findFirst({
          where: and(eq(goals.id, input.goalId), eq(goals.companyId, ctx.companyId)),
          columns: { id: true, title: true, description: true, targetDate: true },
        });
        if (goal) {
          validGoalId = goal.id;
          briefForInsert = {
            ...input.brief,
            pinnedGoal: {
              id: goal.id,
              title: goal.title,
              description: goal.description ?? undefined,
              targetDate: goal.targetDate ?? undefined,
            },
          };
        }
      }

      const [task] = await ctx.db.insert(tasks).values({
        companyId: ctx.companyId,
        origin: "user_created",
        ...input,
        goalId: validGoalId,
        brief: briefForInsert,
      }).returning();

      if (!task) throw new Error("Failed to create task");

      const company = await ctx.db.query.companies.findFirst({
        where: eq(companies.id, ctx.companyId),
        columns: { name: true },
      });

      if (!company) throw new Error("Company not found");

      // Auto-detect: is this a multi-step task?
      const objective = (input.brief as Record<string, string>).objective ?? input.title;
      const classification = await classifyTask({
        objective,
        taskType: input.taskType,
        brief: briefForInsert,
      });

      if (classification.isMultiStep) {
        // Multi-step path: generate a plan instead of executing directly
        const allEmployees = await ctx.db.query.aiEmployees.findMany({
          where: eq(aiEmployees.companyId, ctx.companyId),
          columns: { id: true, name: true, roleType: true },
        });

        // Build skills list from all employee roles
        const roleSet = new Set(allEmployees.map((e) => e.roleType));
        const availableSkills = [...roleSet].flatMap((role) =>
          getSkillsForRole(role as "marketing" | "sales" | "support").map((s) => ({
            id: s.id,
            name: s.name,
            employeeType: s.employeeType,
          })),
        );

        // Build role → default employee map
        const employeesByRole: Record<string, { id: string; name: string }> = {};
        for (const emp of allEmployees) {
          if (!employeesByRole[emp.roleType]) {
            employeesByRole[emp.roleType] = { id: emp.id, name: emp.name };
          }
        }

        await triggerTasks.trigger("generate-plan", {
          parentTaskId: task.id,
          objective,
          brief: briefForInsert,
          companyName: company.name,
          availableSkills,
          employeesByRole,
        });

        return { ...task, isMultiStep: true };
      }

      // Single-step path: execute directly (existing flow)
      const handle = await triggerTasks.trigger("execute-task", {
        agentId: input.aiEmployeeId,
        tenantId: ctx.companyId,
        agentName: employee.name,
        roleType: employee.roleType,
        companyName: company.name,
        task: {
          taskId: task.id,
          title: input.title,
          objective,
          taskType: input.taskType,
          brief: briefForInsert,
        },
      });

      await ctx.db
        .update(tasks)
        .set({ triggerRunId: handle.id, status: "working", startedAt: new Date() })
        .where(eq(tasks.id, task.id));

      return { ...task, triggerRunId: handle.id, isMultiStep: false };
    }),

  // Single-step starter task created from the dashboard empty state.
  // Skips classification + plan approval since the catalog is curated to
  // be single-step and ready to ship to /review/[id] in a few minutes.
  createFromStarter: protectedProcedure
    .input(z.object({
      starterId: z.enum(
        ONBOARDING_STARTERS.map((s) => s.id) as [string, ...string[]],
      ),
      aiEmployeeId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      assertNotDemo("Running a live agent task");
      const starter = starterById(input.starterId);
      if (!starter) {
        throw new Error(`Unknown starter: ${input.starterId}`);
      }

      const [employee, company] = await Promise.all([
        ctx.db.query.aiEmployees.findFirst({
          where: and(
            eq(aiEmployees.id, input.aiEmployeeId),
            eq(aiEmployees.companyId, ctx.companyId),
          ),
          columns: { id: true, name: true, roleType: true },
        }),
        ctx.db.query.companies.findFirst({
          where: eq(companies.id, ctx.companyId),
          columns: { name: true },
        }),
      ]);

      if (!employee || !company) {
        throw new Error("Employee or company not found");
      }
      if (employee.roleType !== starter.role) {
        throw new Error(
          `Starter is for ${starter.role} but employee ${employee.name} is ${employee.roleType}`,
        );
      }

      const brief = {
        objective: starter.title,
        instructions: starter.brief,
        starterId: starter.id,
      };

      const [task] = await ctx.db.insert(tasks).values({
        companyId: ctx.companyId,
        aiEmployeeId: input.aiEmployeeId,
        title: starter.title,
        brief,
        taskType: starter.taskType,
        origin: "dashboard_empty_state",
        planApproved: true,
      }).returning();

      if (!task) throw new Error("Failed to create task");

      const handle = await triggerTasks.trigger("execute-task", {
        agentId: input.aiEmployeeId,
        tenantId: ctx.companyId,
        agentName: employee.name,
        roleType: employee.roleType,
        companyName: company.name,
        task: {
          taskId: task.id,
          title: starter.title,
          objective: starter.title,
          taskType: starter.taskType,
          brief,
        },
      });

      await ctx.db
        .update(tasks)
        .set({ triggerRunId: handle.id, status: "working", startedAt: new Date() })
        .where(eq(tasks.id, task.id));

      await Promise.all([
        trackEvent({
          companyId: ctx.companyId,
          userId: ctx.userId,
          eventName: "dashboard_starter_picked",
          properties: { starterId: starter.id, role: starter.role },
        }),
        trackEvent({
          companyId: ctx.companyId,
          userId: ctx.userId,
          eventName: "first_task_started",
          properties: { taskId: task.id, source: "starter" },
        }),
      ]);

      return { taskId: task.id };
    }),

  /**
   * Spawn a sibling task seeded with the latest founder comment as
   * additional guidance. The original task stays intact; the new task
   * inherits aiEmployeeId, taskType, and brief, then layers the comment
   * onto brief.additionalGuidance. Single-step path only since the
   * intent is course-correct, not re-plan.
   */
  rerunFromComment: protectedProcedure
    .input(z.object({
      taskId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      assertNotDemo("Re-running a task");
      const original = await ctx.db.query.tasks.findFirst({
        where: and(eq(tasks.id, input.taskId), eq(tasks.companyId, ctx.companyId)),
      });
      if (!original) throw new Error("Task not found");

      const lastComment = await ctx.db.query.chatMessages.findFirst({
        where: and(
          eq(chatMessages.taskId, input.taskId),
          eq(chatMessages.companyId, ctx.companyId),
          eq(chatMessages.role, "user"),
        ),
        orderBy: [desc(chatMessages.createdAt)],
      });
      if (!lastComment) {
        throw new Error("No comment to re-run from. Post a comment first.");
      }

      const employee = await ctx.db.query.aiEmployees.findFirst({
        where: eq(aiEmployees.id, original.aiEmployeeId),
        columns: { id: true, name: true, roleType: true },
      });
      const company = await ctx.db.query.companies.findFirst({
        where: eq(companies.id, ctx.companyId),
        columns: { name: true },
      });
      if (!employee || !company) throw new Error("Employee or company not found");

      const originalBrief = (original.brief as Record<string, unknown> | null) ?? {};
      const newBrief = {
        ...originalBrief,
        additionalGuidance: lastComment.content,
        rerunOfTaskId: original.id,
      };

      const newTitle = original.title.startsWith("Re-run: ")
        ? original.title
        : `Re-run: ${original.title}`;

      const [task] = await ctx.db.insert(tasks).values({
        companyId: ctx.companyId,
        aiEmployeeId: original.aiEmployeeId,
        title: newTitle,
        brief: newBrief,
        taskType: original.taskType,
        origin: "rerun_from_comment",
        planApproved: true,
      }).returning();

      if (!task) throw new Error("Failed to create re-run task");

      const objective = typeof originalBrief.objective === "string"
        ? originalBrief.objective
        : original.title;

      const handle = await triggerTasks.trigger("execute-task", {
        agentId: original.aiEmployeeId,
        tenantId: ctx.companyId,
        agentName: employee.name,
        roleType: employee.roleType,
        companyName: company.name,
        task: {
          taskId: task.id,
          title: newTitle,
          objective,
          taskType: original.taskType,
          brief: newBrief,
        },
      });

      await ctx.db
        .update(tasks)
        .set({ triggerRunId: handle.id, status: "working", startedAt: new Date() })
        .where(eq(tasks.id, task.id));

      return { taskId: task.id };
    }),

  approvePlan: protectedProcedure
    .input(z.object({
      taskId: z.string().uuid(),
      approved: z.boolean(),
      feedback: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      assertNotDemo("Approving a plan");
      // Status guard: only flip if the parent task is still in the
      // pre-execution lifecycle. A founder cancellation, a chain
      // auto-advance, or a worker that already moved the task to
      // review/approved must not be regressed by a stale Approve Plan
      // click. Same shape as the generate-plan guard.
      await ctx.db
        .update(tasks)
        .set({
          planApproved: input.approved,
          status: input.approved ? "working" : "pending",
        })
        .where(and(
          eq(tasks.id, input.taskId),
          eq(tasks.companyId, ctx.companyId),
          inArray(tasks.status, ["pending", "planned"]),
        ));

      if (input.approved) {
        // Kick off the chain - spawn the first child task
        const result = await advanceChain(input.taskId, triggerExecuteTask);
        return { planApproved: true, chainResult: result };
      }

      return { planApproved: false, chainResult: null };
    }),

  getChildren: protectedProcedure
    .input(z.object({ parentTaskId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.tasks.findMany({
        where: and(
          eq(tasks.parentTaskId, input.parentTaskId),
          eq(tasks.companyId, ctx.companyId),
        ),
        orderBy: (t, { asc }) => [asc(t.createdAt)],
      });
    }),

  createRecurring: protectedProcedure
    .input(z.object({
      aiEmployeeId: z.string().uuid(),
      title: z.string(),
      brief: z.record(z.unknown()),
      taskType: z.string(),
      goalId: z.string().uuid().optional(),
      recurrence: z.object({
        frequency: z.enum(["daily", "weekly", "monthly"]),
        dayOfWeek: z.number().min(0).max(6).optional(),
        dayOfMonth: z.number().min(1).max(31).optional(),
        hour: z.number().min(0).max(23),
        minute: z.number().min(0).max(59),
      }).refine(
        (r) => r.frequency !== "weekly" || r.dayOfWeek !== undefined,
        { message: "dayOfWeek is required for weekly recurrence" },
      ).refine(
        (r) => r.frequency !== "monthly" || r.dayOfMonth !== undefined,
        { message: "dayOfMonth is required for monthly recurrence" },
      ),
    }))
    .mutation(async ({ ctx, input }) => {
      const employee = await ctx.db.query.aiEmployees.findFirst({
        where: and(eq(aiEmployees.id, input.aiEmployeeId), eq(aiEmployees.companyId, ctx.companyId)),
        columns: { id: true },
      });
      if (!employee) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
      }

      let validGoalId: string | undefined = undefined;
      if (input.goalId) {
        const goal = await ctx.db.query.goals.findFirst({
          where: and(eq(goals.id, input.goalId), eq(goals.companyId, ctx.companyId)),
          columns: { id: true },
        });
        validGoalId = goal?.id;
      }

      const company = await ctx.db.query.companies.findFirst({
        where: eq(companies.id, ctx.companyId),
        columns: { timezone: true },
      });

      const timezone = company?.timezone ?? "UTC";

      const config: RecurrenceConfig = {
        ...input.recurrence,
        timezone,
        nextOccurrenceAt: computeFirstOccurrence(
          { ...input.recurrence, timezone },
          new Date(),
        ),
      };

      const [task] = await ctx.db.insert(tasks).values({
        companyId: ctx.companyId,
        aiEmployeeId: input.aiEmployeeId,
        title: input.title,
        brief: input.brief,
        taskType: input.taskType,
        goalId: validGoalId,
        origin: "recurring",
        recurrence: config as unknown as Record<string, unknown>,
      }).returning();

      return task;
    }),

  listRecurring: protectedProcedure
    .query(async ({ ctx }) => {
      return ctx.db.query.tasks.findMany({
        where: and(
          eq(tasks.companyId, ctx.companyId),
          isNotNull(tasks.recurrence),
        ),
        orderBy: (t, { desc }) => [desc(t.createdAt)],
      });
    }),

  updateRecurring: protectedProcedure
    .input(z.object({
      taskId: z.string().uuid(),
      recurrence: z.object({
        frequency: z.enum(["daily", "weekly", "monthly"]),
        dayOfWeek: z.number().min(0).max(6).optional(),
        dayOfMonth: z.number().min(1).max(31).optional(),
        hour: z.number().min(0).max(23),
        minute: z.number().min(0).max(59),
      }).refine(
        (r) => r.frequency !== "weekly" || r.dayOfWeek !== undefined,
        { message: "dayOfWeek is required for weekly recurrence" },
      ).refine(
        (r) => r.frequency !== "monthly" || r.dayOfMonth !== undefined,
        { message: "dayOfMonth is required for monthly recurrence" },
      ),
    }))
    .mutation(async ({ ctx, input }) => {
      const company = await ctx.db.query.companies.findFirst({
        where: eq(companies.id, ctx.companyId),
        columns: { timezone: true },
      });

      const timezone = company?.timezone ?? "UTC";

      const config: RecurrenceConfig = {
        ...input.recurrence,
        timezone,
        nextOccurrenceAt: computeFirstOccurrence(
          { ...input.recurrence, timezone },
          new Date(),
        ),
      };

      await ctx.db.update(tasks).set({
        recurrence: config as unknown as Record<string, unknown>,
      }).where(and(eq(tasks.id, input.taskId), eq(tasks.companyId, ctx.companyId)));
    }),

  /**
   * Stop scheduling new occurrences from a recurring template by clearing
   * the recurrence JSONB column. The orchestrator filters templates by
   * isNotNull(tasks.recurrence) so a null value drops the row from the
   * sweep. Existing in-flight runs are not affected; use tasks.cancel to
   * kill those.
   */
  cancelRecurring: protectedProcedure
    .input(z.object({ taskId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(tasks)
        .set({ recurrence: null })
        .where(and(eq(tasks.id, input.taskId), eq(tasks.companyId, ctx.companyId)));
    }),

  cancel: protectedProcedure
    .input(z.object({
      taskId: z.string().uuid(),
      reason: z.string().trim().max(800).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const cancelled = await ctx.db.query.tasks.findFirst({
        where: and(eq(tasks.id, input.taskId), eq(tasks.companyId, ctx.companyId)),
        columns: { id: true, title: true, taskType: true, aiEmployeeId: true },
      });

      // Status guard: terminal states (approved/rejected/cancelled/
      // completed) must not be regressed to cancelled. The /dashboard/tasks
      // in-flight cancel button only renders for active states, but a
      // double-click + race with chain auto-advance could otherwise
      // overwrite an approval.
      await ctx.db
        .update(tasks)
        .set({ status: "cancelled" })
        .where(and(
          eq(tasks.id, input.taskId),
          eq(tasks.companyId, ctx.companyId),
          inArray(tasks.status, ["pending", "planned", "working", "in_progress", "review"]),
        ));

      // Cascade: cancel any working children
      const children = await ctx.db.query.tasks.findMany({
        where: and(
          eq(tasks.parentTaskId, input.taskId),
          eq(tasks.companyId, ctx.companyId),
        ),
        columns: { id: true, status: true, triggerRunId: true },
      });

      for (const child of children) {
        if (child.status === "working" || child.status === "pending") {
          await ctx.db
            .update(tasks)
            .set({ status: "cancelled" })
            .where(eq(tasks.id, child.id));
        }
      }

      const reason = input.reason?.trim();
      if (cancelled && reason && reason.length >= 10) {
        await ctx.db.insert(activityLog).values({
          companyId: ctx.companyId,
          aiEmployeeId: cancelled.aiEmployeeId,
          actionType: "task_cancelled",
          actionDetail: {
            taskId: cancelled.id,
            taskTitle: cancelled.title,
            taskType: cancelled.taskType,
            cancellationReason: reason,
          },
        });

        extractRuleFromRationale({
          agentId: cancelled.aiEmployeeId,
          tenantId: ctx.companyId,
          taskId: cancelled.id,
          taskType: cancelled.taskType,
          rationale: `CANCELLED: ${reason}`,
          outputText: cancelled.title,
        }).catch((err) => {
          console.error("Extraction failed on task cancel:", err);
        });
      }
    }),

  getProgress: protectedProcedure
    .input(z.object({ taskId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const task = await ctx.db.query.tasks.findFirst({
        where: and(eq(tasks.id, input.taskId), eq(tasks.companyId, ctx.companyId)),
        columns: { id: true, status: true, triggerRunId: true, startedAt: true, completedAt: true, plan: true, planApproved: true, parentTaskId: true },
      });
      return task ?? null;
    }),

  getStreamToken: protectedProcedure
    .input(z.object({ triggerRunId: z.string() }))
    .query(async ({ ctx, input }) => {
      // All tenants share one Trigger.dev project, so a read token for an
      // arbitrary run id would cross tenants. Only mint for a run that belongs
      // to a task in the caller's company. assertNotDemo because the demo guard
      // only blocks mutations, and this hits live Trigger.dev infra.
      assertNotDemo("Streaming a run");
      const owned = await ctx.db.query.tasks.findFirst({
        where: and(eq(tasks.triggerRunId, input.triggerRunId), eq(tasks.companyId, ctx.companyId)),
        columns: { id: true },
      });
      if (!owned) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Run not found" });
      }
      const token = await triggerAuth.createPublicToken({
        scopes: {
          read: {
            runs: [input.triggerRunId],
          },
        },
      });
      return { publicAccessToken: token };
    }),
});
