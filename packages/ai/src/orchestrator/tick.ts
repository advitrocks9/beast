import { db, tasks, agentRunEvents, activityLog } from "@beast/db";
import { and, eq, gt, isNull, lt, lte, notExists, or, sql } from "drizzle-orm";
import { dispatchRun, type TriggerExecuteTask } from "../runner";
import { processRecurringTasks } from "./recurring";
import { updateEmployeeStatuses } from "./status";
import { processCheckIns } from "./checkin";
import { processSignals, detectGoalGaps } from "../signals";
import type { TickContext, TickResult, TickDispatch } from "./types";

const RUN_STALE_MS = 15 * 60 * 1000;
const QUEUE_STALE_MS = 2 * 60 * 1000;
const MAX_ORCHESTRATOR_RETRIES = 2;
const RETRY_WINDOW_MS = 24 * 60 * 60 * 1000;

function noRunEventsSince(cutoff: Date) {
  return notExists(
    db
      .select({ one: sql`1` })
      .from(agentRunEvents)
      .where(and(eq(agentRunEvents.taskId, tasks.id), gt(agentRunEvents.createdAt, cutoff))),
  );
}

async function sweepStaleRunning(ctx: TickContext): Promise<number> {
  const cutoff = new Date(ctx.now.getTime() - RUN_STALE_MS);
  const timedOut = await db
    .update(tasks)
    .set({ status: "timed_out", completedAt: ctx.now })
    .where(and(
      eq(tasks.companyId, ctx.companyId),
      eq(tasks.status, "running"),
      lt(sql`coalesce(${tasks.startedAt}, ${tasks.createdAt})`, cutoff),
      noRunEventsSince(cutoff),
    ))
    .returning({ id: tasks.id, aiEmployeeId: tasks.aiEmployeeId, title: tasks.title });

  if (timedOut.length > 0) {
    await db.insert(activityLog).values(timedOut.map((t) => ({
      companyId: ctx.companyId,
      aiEmployeeId: t.aiEmployeeId,
      actionType: "task_timed_out",
      actionDetail: { taskId: t.id, title: t.title, staleMinutes: RUN_STALE_MS / 60_000 },
    })));
  }
  return timedOut.length;
}

async function sweepFailedForRetry(ctx: TickContext): Promise<number> {
  const windowStart = new Date(ctx.now.getTime() - RETRY_WINDOW_MS);
  const requeued = await db
    .update(tasks)
    .set({
      status: "queued",
      orchestratorRetries: sql`${tasks.orchestratorRetries} + 1`,
      startedAt: null,
      completedAt: null,
      triggerRunId: null,
    })
    .where(and(
      eq(tasks.companyId, ctx.companyId),
      eq(tasks.status, "failed"),
      lt(tasks.orchestratorRetries, MAX_ORCHESTRATOR_RETRIES),
      gt(sql`coalesce(${tasks.completedAt}, ${tasks.createdAt})`, windowStart),
      isNull(tasks.recurrence),
    ))
    .returning({ id: tasks.id });
  return requeued.length;
}

async function sweepStuckQueued(
  ctx: TickContext,
  opts: { trigger?: TriggerExecuteTask },
): Promise<{ redispatched: number; errors: string[] }> {
  const cutoff = new Date(ctx.now.getTime() - QUEUE_STALE_MS);
  // Recurrence rows are templates, never runnable themselves.
  const stuck = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(
      eq(tasks.companyId, ctx.companyId),
      eq(tasks.status, "queued"),
      lt(tasks.createdAt, cutoff),
      isNull(tasks.recurrence),
      or(isNull(tasks.scheduledAt), lte(tasks.scheduledAt, ctx.now)),
      noRunEventsSince(cutoff),
    ));

  const errors: string[] = [];
  let redispatched = 0;
  for (const task of stuck) {
    try {
      await dispatchRun(task.id, opts);
      redispatched += 1;
    } catch (err) {
      errors.push(`Redispatch ${task.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { redispatched, errors };
}

/**
 * Core orchestrator sweep for a single company: times out stale runs,
 * re-queues recent failures, re-dispatches stuck queued work, spawns
 * recurring instances, then refreshes statuses, check-ins, and signals.
 * Callable from the Trigger.dev schedule, the /api/cron/tick route, or
 * directly; run dispatch goes through dispatchRun, with opts.trigger
 * injected by the worker so this package stays free of @trigger.dev/sdk.
 */
export async function runTick(
  ctx: TickContext,
  opts: { trigger?: TriggerExecuteTask } = {},
): Promise<TickResult & TickDispatch> {
  const errors: string[] = [];
  let tasksTimedOut = 0;
  let tasksRequeued = 0;
  let tasksRedispatched = 0;
  let recurringTasksSpawned = 0;
  let statusUpdates = 0;
  let checkInsDispatched = 0;
  const checkInsToDispatch: TickDispatch["checkInsToDispatch"] = [];

  try {
    tasksTimedOut = await sweepStaleRunning(ctx);
  } catch (err) {
    errors.push(`Timeout sweep: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Requeue before the queued sweep so an aged-out failure can redispatch this tick.
  try {
    tasksRequeued = await sweepFailedForRetry(ctx);
  } catch (err) {
    errors.push(`Retry sweep: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    const queued = await sweepStuckQueued(ctx, opts);
    tasksRedispatched = queued.redispatched;
    errors.push(...queued.errors);
  } catch (err) {
    errors.push(`Queued sweep: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    const recurring = await processRecurringTasks(ctx);
    recurringTasksSpawned = recurring.spawned.length;
    errors.push(...recurring.errors);
    // Instance dispatch failures self-heal: the row stays queued and the
    // next tick's queued sweep picks it up.
    for (const taskId of recurring.spawned) {
      await dispatchRun(taskId, opts).catch((err) => {
        errors.push(`Recurring dispatch ${taskId}: ${err instanceof Error ? err.message : String(err)}`);
      });
    }
  } catch (err) {
    errors.push(`Recurring tasks: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    const changes = await updateEmployeeStatuses(ctx);
    statusUpdates = changes.length;
  } catch (err) {
    errors.push(`Status updates: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    const checkInResult = await processCheckIns(ctx);
    checkInsDispatched = checkInResult.dispatched.length;
    checkInsToDispatch.push(...checkInResult.dispatched);
    errors.push(...checkInResult.errors);
  } catch (err) {
    errors.push(`Check-ins: ${err instanceof Error ? err.message : String(err)}`);
  }

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

  try {
    await detectGoalGaps(ctx);
  } catch (err) {
    errors.push(`Goal gaps: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Log only when something happened: a no-op row every 5 minutes would
  // drown real activity. Errors still log so debugging works.
  const tickHadEffect =
    tasksTimedOut > 0 ||
    tasksRequeued > 0 ||
    tasksRedispatched > 0 ||
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
          tasksTimedOut,
          tasksRequeued,
          tasksRedispatched,
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
    tasksTimedOut,
    tasksRequeued,
    tasksRedispatched,
    recurringTasksSpawned,
    statusUpdates,
    checkInsDispatched,
    signalsProcessed,
    signalsRouted,
    errors,
    checkInsToDispatch,
  };
}
