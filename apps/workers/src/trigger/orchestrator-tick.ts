import { schedules, tasks as triggerTasks } from "@trigger.dev/sdk";
import { runTick } from "@beast/ai";
import type { SpawnPayload } from "@beast/ai";
import { db, companies } from "@beast/db";
import { eq } from "drizzle-orm";

async function triggerExecuteTask(payload: SpawnPayload): Promise<{ id: string }> {
  const handle = await triggerTasks.trigger("execute-task", payload);
  return { id: handle.id };
}

/**
 * Orchestrator tick - runs every 5 minutes per company.
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

    const result = await runTick(
      { companyId: company.id, timezone: company.timezone, now: new Date() },
      { trigger: triggerExecuteTask },
    );

    for (const checkIn of result.checkInsToDispatch) {
      try {
        await triggerTasks.trigger("generate-checkin", checkIn);
      } catch (err) {
        console.error(`[Orchestrator] Failed to dispatch check-in for ${checkIn.employeeId}:`, err);
      }
    }

    return {
      companyId: result.companyId,
      tasksTimedOut: result.tasksTimedOut,
      tasksRequeued: result.tasksRequeued,
      tasksRedispatched: result.tasksRedispatched,
      recurringTasksSpawned: result.recurringTasksSpawned,
      statusUpdates: result.statusUpdates,
      checkInsDispatched: result.checkInsDispatched,
      signalsProcessed: result.signalsProcessed,
      signalsRouted: result.signalsRouted,
      errors: result.errors,
    };
  },
});
