import { db, aiEmployees, tasks, activityLog } from "@beast/db";
import { eq, and, inArray } from "drizzle-orm";
import type { TickContext, StatusDetermination } from "./types";

const ACTIVE_TASK_STATUSES = ["pending", "planned", "working", "review", "revision"];

/**
 * Update employee statuses for a company based on current task state.
 * Returns list of status changes made.
 */
export async function updateEmployeeStatuses(ctx: TickContext): Promise<StatusDetermination[]> {
  const changes: StatusDetermination[] = [];

  const employees = await db.query.aiEmployees.findMany({
    where: eq(aiEmployees.companyId, ctx.companyId),
    columns: { id: true, status: true, currentTaskId: true },
  });

  for (const emp of employees) {
    try {
      // Find the most relevant active task for this employee
      const activeTasks = await db.query.tasks.findMany({
        where: and(
          eq(tasks.aiEmployeeId, emp.id),
          eq(tasks.companyId, ctx.companyId),
          inArray(tasks.status, ACTIVE_TASK_STATUSES),
        ),
        columns: { id: true, status: true, startedAt: true },
        orderBy: (t, { desc }) => [desc(t.startedAt)],
        limit: 5,
      });

      const determination = determineStatus(
        { id: emp.id, status: emp.status, currentTaskId: emp.currentTaskId },
        activeTasks,
      );

      if (determination.newStatus !== determination.previousStatus) {
        // Atomic so a partial commit can't leave the status updated
        // without its audit row. Without the tx, retry would re-read
        // the already-updated status, determineStatus would return "no
        // change", and the activity_log row would never be written -
        // the founder's dashboard ActivityFeed would silently miss the
        // status transition.
        await db.transaction(async (tx) => {
          await tx.update(aiEmployees).set({
            status: determination.newStatus,
            currentTaskId: determination.newStatus === "idle" ? null : activeTasks[0]?.id ?? null,
            updatedAt: new Date(),
          }).where(eq(aiEmployees.id, emp.id));

          await tx.insert(activityLog).values({
            companyId: ctx.companyId,
            aiEmployeeId: emp.id,
            actionType: "status_change",
            actionDetail: {
              from: determination.previousStatus,
              to: determination.newStatus,
              reason: determination.reason,
            },
          });
        });

        changes.push(determination);
      }
    } catch (err) {
      // Status update is non-critical - log and continue
      console.error(`[Orchestrator] Status update failed for employee ${emp.id}:`, err);
    }
  }

  return changes;
}

/**
 * Pure function: determine employee status from their active tasks.
 * Prioritizes the most "active" status.
 */
export function determineStatus(
  employee: { id: string; status: string; currentTaskId: string | null },
  activeTasks: Array<{ id: string; status: string }>,
): StatusDetermination {
  const previousStatus = employee.status;

  // No active tasks → idle
  if (activeTasks.length === 0) {
    return {
      employeeId: employee.id,
      previousStatus,
      newStatus: "idle",
      reason: "No active tasks",
    };
  }

  // Check for most relevant status (priority order)
  const hasWorking = activeTasks.some((t) => t.status === "working");
  if (hasWorking) {
    return {
      employeeId: employee.id,
      previousStatus,
      newStatus: "working",
      reason: "Has task in working status",
    };
  }

  const hasReview = activeTasks.some((t) => t.status === "review" || t.status === "revision");
  if (hasReview) {
    return {
      employeeId: employee.id,
      previousStatus,
      newStatus: "waiting_review",
      reason: "Has task awaiting review",
    };
  }

  // Only pending/planned tasks - still idle (not actively working)
  return {
    employeeId: employee.id,
    previousStatus,
    newStatus: "idle",
    reason: "Only pending/planned tasks",
  };
}
