import { schedules, tasks as triggerTasks } from "@trigger.dev/sdk";
import { runTick } from "@beast/ai";
import { db, companies, tasks } from "@beast/db";
import { and, eq } from "drizzle-orm";

/**
 * Orchestrator tick - runs every 5 minutes per company.
 * Checks recurring tasks, updates employee statuses, dispatches check-ins.
 *
 * Schedules are created per company via schedules.create() during onboarding.
 */
export const orchestratorTick = schedules.task({
  id: "orchestrator-tick",
  run: async (payload) => {
    const companyId = payload.externalId;
    if (!companyId) {
      return { skipped: true, reason: "No externalId (companyId)" };
    }

    const company = await db.query.companies.findFirst({
      where: eq(companies.id, companyId),
      columns: { id: true, timezone: true, onboardingStatus: true },
    });

    if (!company || company.onboardingStatus !== "complete") {
      return { skipped: true, reason: "Company not found or onboarding incomplete" };
    }

    const result = await runTick({
      companyId: company.id,
      timezone: company.timezone,
      now: new Date(),
    });

    // Dispatch spawned recurring tasks. Optimistic claim guards against
    // duplicate parallel runs: if trigger fires but the row update fails,
    // a second 5-min tick would otherwise see the task still at "pending"
    // and re-trigger, producing two execute-task runs for the same row.
    // The pre-claim flips pending -> working with a WHERE on pending so
    // a concurrent tick's claim no-ops.
    for (const item of result.tasksToSpawn) {
      const claimed = await db
        .update(tasks)
        .set({ status: "working", startedAt: new Date() })
        .where(and(eq(tasks.id, item.taskId), eq(tasks.status, "pending")))
        .returning({ id: tasks.id });
      if (claimed.length === 0) continue;

      try {
        const handle = await triggerTasks.trigger("execute-task", item.payload);
        await db
          .update(tasks)
          .set({ triggerRunId: handle.id })
          .where(eq(tasks.id, item.taskId));
      } catch (err) {
        console.error(`[Orchestrator] Failed to dispatch recurring task ${item.taskId}:`, err);
        // Revert claim so the next tick can retry. If the revert update
        // also fails, the task is stuck at "working" until manual recovery.
        await db
          .update(tasks)
          .set({ status: "pending", startedAt: null })
          .where(eq(tasks.id, item.taskId))
          .catch((revertErr) => {
            console.error(`[Orchestrator] Failed to revert claim on ${item.taskId}:`, revertErr);
          });
      }
    }

    // Dispatch check-ins
    for (const checkIn of result.checkInsToDispatch) {
      try {
        await triggerTasks.trigger("generate-checkin", checkIn);
      } catch (err) {
        console.error(`[Orchestrator] Failed to dispatch check-in for ${checkIn.employeeId}:`, err);
      }
    }

    return {
      companyId: result.companyId,
      recurringTasksSpawned: result.recurringTasksSpawned,
      statusUpdates: result.statusUpdates,
      checkInsDispatched: result.checkInsDispatched,
      signalsProcessed: result.signalsProcessed,
      signalsRouted: result.signalsRouted,
      errors: result.errors,
    };
  },
});
