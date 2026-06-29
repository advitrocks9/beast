import { db, aiEmployees, deliverables, tasks, activityLog, autonomySuggestions } from "@beast/db";
import { eq, and, desc, inArray, lte, sql } from "drizzle-orm";
import type { TickContext } from "../orchestrator/types";

/** Action types that can be autonomously escalated. */
const AUTONOMY_ACTIONS = ["publishSocial", "sendEmail", "reachOut"] as const;
type AutonomyAction = typeof AUTONOMY_ACTIONS[number];

/** How many consecutive approvals without edits needed to suggest escalation. */
const ESCALATION_THRESHOLD = 8;

interface AutonomySuggestion {
  employeeId: string;
  employeeName: string;
  action: AutonomyAction;
  consecutiveApprovals: number;
  message: string;
}

/**
 * Evaluate each employee's approval track record.
 * Surfaces suggestions when an employee has consistently good output.
 * Called from the orchestrator tick (runs less frequently - e.g., once daily).
 */
export async function evaluateAutonomy(ctx: TickContext): Promise<AutonomySuggestion[]> {
  const suggestions: AutonomySuggestion[] = [];

  const employees = await db.query.aiEmployees.findMany({
    where: eq(aiEmployees.companyId, ctx.companyId),
    columns: { id: true, name: true, autonomySettings: true },
  });

  for (const emp of employees) {
    const settings = (emp.autonomySettings ?? {}) as Record<string, string>;

    // Check each action that currently requires permission
    for (const action of AUTONOMY_ACTIONS) {
      if (settings[action] === "auto") continue; // Already autonomous

      const deliverableTypes = actionToDeliverableTypes(action);
      if (deliverableTypes.length === 0) continue;

      // Count recent consecutive approvals without edits
      const streak = await getApprovalStreak(emp.id, ctx.companyId, deliverableTypes);

      if (streak >= ESCALATION_THRESHOLD) {
        suggestions.push({
          employeeId: emp.id,
          employeeName: emp.name,
          action,
          consecutiveApprovals: streak,
          message: `${emp.name} has been approved ${streak} consecutive times on ${formatAction(action)} without edits. Allow them to ${formatAction(action)} directly?`,
        });
      }
    }
  }

  // First: revive any snoozed rows whose snooze_until has passed AND
  // whose streak is still met. They go back to queued so the dashboard
  // surface picks them up again on the next render.
  await reviveSnoozedSuggestions(ctx.companyId, suggestions);

  // Persist each suggestion. The partial unique index ensures we do
  // not duplicate while one is in flight (queued/shown/snoozed). Once
  // a row terminates (accepted/dismissed) and the founder later
  // earns another streak, ON CONFLICT DO NOTHING is bypassed by the
  // index because terminal-state rows are not in the index.
  //
  // Two coordinated guarantees:
  //
  // 1. tx atomicity: insert(autonomy_suggestions) +
  //    insert(activity_log) commit together so a connection drop
  //    can't leave a suggestion in flight without its corresponding
  //    audit-trail row (or vice versa).
  // 2. skip-activity-log-on-conflict: returning() captures whether
  //    the suggestions insert actually wrote a new row. If empty,
  //    onConflictDoNothing bypassed the insert (a prior in-flight
  //    suggestion already exists). Skipping the activity_log insert
  //    in that branch prevents worker retries from spamming the
  //    founder's dashboard feed with duplicate "Alex earned more
  //    autonomy" entries.
  for (const suggestion of suggestions) {
    await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(autonomySuggestions)
        .values({
          companyId: ctx.companyId,
          aiEmployeeId: suggestion.employeeId,
          action: suggestion.action,
          consecutiveApprovals: suggestion.consecutiveApprovals,
          message: suggestion.message,
        })
        .onConflictDoNothing()
        .returning({ id: autonomySuggestions.id });

      if (inserted.length === 0) return;

      await tx.insert(activityLog).values({
        companyId: ctx.companyId,
        aiEmployeeId: suggestion.employeeId,
        actionType: "autonomy_suggestion",
        actionDetail: {
          action: suggestion.action,
          consecutiveApprovals: suggestion.consecutiveApprovals,
          message: suggestion.message,
        },
      });
    });
  }

  return suggestions;
}

/**
 * Move snoozed rows back to queued when their snooze window has ended,
 * but only if the streak is still met. Snoozed rows whose streak broke
 * are left alone; they age out via the next dismissal pass.
 */
async function reviveSnoozedSuggestions(
  companyId: string,
  freshSuggestions: AutonomySuggestion[],
): Promise<void> {
  const now = new Date();
  const expiredSnoozes = await db.query.autonomySuggestions.findMany({
    where: and(
      eq(autonomySuggestions.companyId, companyId),
      eq(autonomySuggestions.state, "snoozed"),
      lte(autonomySuggestions.snoozeUntil, now),
    ),
    columns: { id: true, aiEmployeeId: true, action: true },
  });
  if (expiredSnoozes.length === 0) return;

  const stillMet = new Set(
    freshSuggestions.map((s) => `${s.employeeId}:${s.action}`),
  );

  const toRevive = expiredSnoozes
    .filter((row) => stillMet.has(`${row.aiEmployeeId}:${row.action}`))
    .map((row) => row.id);

  if (toRevive.length === 0) return;

  await db
    .update(autonomySuggestions)
    .set({ state: "queued", snoozeUntil: null, updatedAt: now })
    .where(inArray(autonomySuggestions.id, toRevive));
}

/** Count consecutive approved deliverables (no edits) for specific types. */
async function getApprovalStreak(
  employeeId: string,
  companyId: string,
  deliverableTypes: string[],
): Promise<number> {
  // Get recent deliverables of the target types, ordered newest first
  const recent = await db.query.deliverables.findMany({
    where: and(
      eq(deliverables.aiEmployeeId, employeeId),
      eq(deliverables.companyId, companyId),
    ),
    columns: { status: true, version: true, deliverableType: true },
    orderBy: [desc(deliverables.createdAt)],
    limit: 20,
  });

  // Filter to relevant types and count streak
  let streak = 0;
  for (const d of recent) {
    if (!deliverableTypes.includes(d.deliverableType)) continue;

    // Approved on first version = no edits
    if (d.status === "approved" && d.version === 1) {
      streak++;
    } else if (d.status === "published" && d.version === 1) {
      streak++;
    } else {
      break; // Streak broken
    }
  }

  return streak;
}

/** Map autonomy action to deliverable types. */
function actionToDeliverableTypes(action: AutonomyAction): string[] {
  switch (action) {
    case "publishSocial":
      return ["social_twitter", "social_linkedin"];
    case "sendEmail":
      return ["email"];
    case "reachOut":
      return ["email"]; // Outreach emails
    default:
      return [];
  }
}

function formatAction(action: AutonomyAction): string {
  switch (action) {
    case "publishSocial": return "publish social posts";
    case "sendEmail": return "send emails";
    case "reachOut": return "reach out to prospects";
  }
}

// Compatible with both `db` and a drizzle transaction `tx`. Both expose
// the same insert/update surface; tx carries an extra `$client` we don't use.
type DbClient = Pick<typeof db, "insert" | "update">;

/**
 * Apply an autonomy escalation - founder approved the suggestion.
 *
 * Uses jsonb_set to atomically update a single key inside the
 * autonomy_settings JSONB column. The previous implementation read the
 * full settings object, mutated in JS, and wrote it back, which races
 * with any concurrent escalation: two parallel approvals for different
 * actions would each see the same prior snapshot and the second write
 * would overwrite the first. jsonb_set sidesteps the race by mutating
 * one key in a single SQL statement; the action argument is bound as a
 * parameter so the path is safe even if the route's input validation
 * changes.
 *
 * The `client` parameter accepts either the module-level db or a
 * caller's transaction. The autonomy router's accept mutation passes
 * its tx so the employee escalation, audit log row, and suggestion
 * state flip all commit together.
 */
export async function escalateAutonomy(
  client: DbClient,
  params: {
    employeeId: string;
    companyId: string;
    action: string;
  },
): Promise<void> {
  const result = await client
    .update(aiEmployees)
    .set({
      autonomySettings: sql`jsonb_set(COALESCE(${aiEmployees.autonomySettings}, '{}'::jsonb), ARRAY[${params.action}], '"auto"'::jsonb, true)`,
      updatedAt: new Date(),
    })
    .where(and(eq(aiEmployees.id, params.employeeId), eq(aiEmployees.companyId, params.companyId)))
    .returning({ id: aiEmployees.id });

  if (result.length === 0) throw new Error("Employee not found");

  await client.insert(activityLog).values({
    companyId: params.companyId,
    aiEmployeeId: params.employeeId,
    actionType: "autonomy_escalated",
    actionDetail: { action: params.action, newLevel: "auto" },
  });
}
