import { db, activityLog } from "@beast/db";
import { processRecurringTasks } from "./recurring";
import { updateEmployeeStatuses } from "./status";
import { processCheckIns } from "./checkin";
import { processSignals, detectGoalGaps } from "../signals";
import type { TickContext, TickResult, TickDispatch } from "./types";

/**
 * Core orchestrator tick for a single company.
 * Called every 5 minutes by the Trigger.dev scheduled task.
 *
 * Returns dispatch instructions - the Trigger.dev wrapper
 * handles all task triggering (keeps this package free of @trigger.dev/sdk).
 */
export async function runTick(ctx: TickContext): Promise<TickResult & TickDispatch> {
  const errors: string[] = [];
  let recurringTasksSpawned = 0;
  let statusUpdates = 0;
  let checkInsDispatched = 0;
  const tasksToSpawn: TickDispatch["tasksToSpawn"] = [];
  const checkInsToDispatch: TickDispatch["checkInsToDispatch"] = [];

  // 1. Process recurring tasks
  try {
    const recurring = await processRecurringTasks(ctx);
    recurringTasksSpawned = recurring.spawned.length;
    tasksToSpawn.push(...recurring.spawned);
    errors.push(...recurring.errors);
  } catch (err) {
    errors.push(`Recurring tasks: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 2. Update employee statuses (must run after recurring task spawning)
  try {
    const changes = await updateEmployeeStatuses(ctx);
    statusUpdates = changes.length;
  } catch (err) {
    errors.push(`Status updates: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 3. Process check-ins
  try {
    const checkInResult = await processCheckIns(ctx);
    checkInsDispatched = checkInResult.dispatched.length;
    checkInsToDispatch.push(...checkInResult.dispatched);
    errors.push(...checkInResult.errors);
  } catch (err) {
    errors.push(`Check-ins: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 4. Process signals (filter + route)
  let signalsProcessed = 0;
  let signalsRouted = 0;
  try {
    const signalResult = await processSignals(ctx);
    signalsProcessed = signalResult.processed;
    signalsRouted = signalResult.routed.length;
    errors.push(...signalResult.errors);
  } catch (err) {
    errors.push(`Signals: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 5. Detect goal gaps (creates signals for at-risk goals)
  try {
    await detectGoalGaps(ctx);
  } catch (err) {
    errors.push(`Goal gaps: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 6. Log tick summary - only when something happened. The tick fires
  // every 5 minutes, so a no-op log row would land 288 times per company
  // per day and drown real activity. Errors still log so debugging works.
  const tickHadEffect =
    recurringTasksSpawned > 0 ||
    statusUpdates > 0 ||
    checkInsDispatched > 0 ||
    signalsProcessed > 0 ||
    signalsRouted > 0 ||
    errors.length > 0;
  if (tickHadEffect) {
    try {
      await db.insert(activityLog).values({
        companyId: ctx.companyId,
        actionType: "orchestrator_tick",
        actionDetail: {
          recurringTasksSpawned,
          statusUpdates,
          checkInsDispatched,
          signalsProcessed,
          signalsRouted,
          errorCount: errors.length,
          errors: errors.length > 0 ? errors : undefined,
        },
      });
    } catch {
      // Logging failure is not fatal
    }
  }

  return {
    companyId: ctx.companyId,
    recurringTasksSpawned,
    statusUpdates,
    checkInsDispatched,
    signalsProcessed,
    signalsRouted,
    errors,
    tasksToSpawn,
    checkInsToDispatch,
  };
}
