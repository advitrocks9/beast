import { db, aiEmployees, tasks, deliverables, checkIns, activityLog } from "@beast/db";
import { eq, and, desc, gte } from "drizzle-orm";
import { getClient, getModelId } from "../models";
import type { TickContext, CheckInContent, PreExecutionCheckIn } from "./types";

interface CheckInDispatch {
  employeeId: string;
  companyId: string;
  checkInType: "daily_summary" | "weekly_report";
}

/**
 * Determine which employees need check-ins dispatched.
 * Returns dispatch instructions - actual LLM generation runs as a separate Trigger.dev task.
 */
export async function processCheckIns(ctx: TickContext): Promise<{
  dispatched: CheckInDispatch[];
  errors: string[];
}> {
  const result: { dispatched: CheckInDispatch[]; errors: string[] } = { dispatched: [], errors: [] };

  const employees = await db.query.aiEmployees.findMany({
    where: eq(aiEmployees.companyId, ctx.companyId),
    columns: { id: true, checkInFrequency: true },
  });

  for (const emp of employees) {
    try {
      if (emp.checkInFrequency === "per_task") continue;

      const checkInType = emp.checkInFrequency === "daily" ? "daily_summary" : "weekly_report";
      const isDue = await isCheckInDue(emp.id, checkInType, ctx);

      if (isDue) {
        result.dispatched.push({
          employeeId: emp.id,
          companyId: ctx.companyId,
          checkInType,
        });
      }
    } catch (err) {
      result.errors.push(`Employee ${emp.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}

/** Check if a check-in is due for an employee. */
async function isCheckInDue(
  employeeId: string,
  checkInType: string,
  ctx: TickContext,
): Promise<boolean> {
  // Find the most recent check-in of this type
  const latest = await db.query.checkIns.findFirst({
    where: and(
      eq(checkIns.aiEmployeeId, employeeId),
      eq(checkIns.checkInType, checkInType),
    ),
    columns: { createdAt: true },
    orderBy: desc(checkIns.createdAt),
  });

  if (!latest) return true; // Never had one - due now

  const lastTime = latest.createdAt;
  const hoursSince = (ctx.now.getTime() - lastTime.getTime()) / (1000 * 60 * 60);

  if (checkInType === "daily_summary") {
    return hoursSince >= 20; // At least 20 hours since last daily
  }
  // weekly_report
  return hoursSince >= 144; // At least 6 days since last weekly
}

/**
 * Generate check-in content using LLM.
 * Called from the generate-checkin Trigger.dev task.
 */
export async function generateCheckIn(params: {
  employeeId: string;
  companyId: string;
  checkInType: "daily_summary" | "weekly_report";
}): Promise<CheckInContent> {
  const employee = await db.query.aiEmployees.findFirst({
    where: eq(aiEmployees.id, params.employeeId),
    columns: { name: true, roleTitle: true, roleType: true },
  });

  if (!employee) throw new Error(`Employee ${params.employeeId} not found`);

  // Gather context: recent tasks and deliverables
  const lookbackHours = params.checkInType === "daily_summary" ? 24 : 168;
  const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);

  const recentTasks = await db.query.tasks.findMany({
    where: and(
      eq(tasks.aiEmployeeId, params.employeeId),
      eq(tasks.companyId, params.companyId),
      gte(tasks.createdAt, since),
    ),
    columns: { id: true, title: true, status: true, taskType: true },
    orderBy: desc(tasks.createdAt),
    limit: 15,
  });

  const recentDeliverables = await db.query.deliverables.findMany({
    where: and(
      eq(deliverables.aiEmployeeId, params.employeeId),
      eq(deliverables.companyId, params.companyId),
      gte(deliverables.createdAt, since),
    ),
    columns: { id: true, title: true, status: true, deliverableType: true },
    orderBy: desc(deliverables.createdAt),
    limit: 10,
  });

  // Build task summary for the prompt
  const completedTasks = recentTasks
    .filter((t) => t.status === "approved" || t.status === "published")
    .map((t) => ({ taskId: t.id, title: t.title, status: t.status }));

  const pendingTasks = recentTasks
    .filter((t) => t.status === "working" || t.status === "review" || t.status === "pending");

  const taskContext = [
    `Completed: ${completedTasks.length} tasks`,
    ...completedTasks.map((t) => `  - ${t.title} (${t.status})`),
    `In progress: ${pendingTasks.length} tasks`,
    ...pendingTasks.map((t) => `  - ${t.title} (${t.status})`),
    `Deliverables created: ${recentDeliverables.length}`,
  ].join("\n");

  const period = params.checkInType === "daily_summary" ? "today" : "this week";

  // LLM generates the check-in narrative
  const client = getClient();
  const completion = await client.messages.create({
    model: getModelId("haiku"),
    max_tokens: 512,
    system: `You are ${employee.name}, a ${employee.roleTitle}. Write a brief ${params.checkInType === "daily_summary" ? "daily" : "weekly"} check-in for the founder. Be concise, specific, and actionable. Return JSON only.`,
    messages: [{
      role: "user",
      content: `Here's what happened ${period}:

${taskContext}

Return:
{
  "headline": "one-line summary of the period",
  "summary": "2-3 sentence overview",
  "highlights": ["notable wins or observations"],
  "suggestedActions": ["what the founder could do to help or prioritize"]
}`,
    }],
  });

  const raw = completion.content[0]?.type === "text" ? completion.content[0].text : "{}";
  let parsed: Partial<CheckInContent>;
  try {
    parsed = JSON.parse(raw.replace(/^```json?\s*/i, "").replace(/\s*```$/, ""));
  } catch {
    parsed = { headline: `${params.checkInType} for ${employee.name}`, summary: "Check-in generation encountered an issue." };
  }

  const content: CheckInContent = {
    headline: parsed.headline ?? `${employee.name}'s ${period} update`,
    summary: parsed.summary ?? "",
    completedTasks,
    highlights: parsed.highlights ?? [],
    suggestedActions: parsed.suggestedActions ?? [],
  };

  // Store the check-in. scheduledFor is set to "now" because daily and
  // weekly check-ins are surfaced immediately, not scheduled for a future
  // window the way post_approval_followup is. Without an explicit value
  // the column is null, and the dashboard inline list sorts those rows
  // after every scheduled row so the limit-5 cap silently buries them.
  //
  // Wrapped in a transaction so a Trigger.dev retry of generate-checkin
  // (retry: maxAttempts 2) does not double-insert the check-in row + the
  // activity feed row when the second insert fails after the first
  // committed. Either both land or neither does; retry then re-runs the
  // paid Haiku call once and inserts cleanly.
  await db.transaction(async (tx) => {
    await tx.insert(checkIns).values({
      aiEmployeeId: params.employeeId,
      companyId: params.companyId,
      checkInType: params.checkInType,
      content: content as unknown as Record<string, unknown>,
      scheduledFor: new Date(),
    });

    await tx.insert(activityLog).values({
      companyId: params.companyId,
      aiEmployeeId: params.employeeId,
      actionType: "checkin_generated",
      actionDetail: { checkInType: params.checkInType, headline: content.headline },
    });
  });

  return content;
}

/**
 * Generate a pre-execution check-in for a complex task.
 * Called before multi-step chains or high-complexity tasks.
 */
export async function generatePreExecutionCheckIn(params: {
  employeeId: string;
  companyId: string;
  taskId: string;
  taskTitle: string;
  taskObjective: string;
  taskType: string;
}): Promise<PreExecutionCheckIn> {
  const employee = await db.query.aiEmployees.findFirst({
    where: eq(aiEmployees.id, params.employeeId),
    columns: { name: true, roleTitle: true },
  });

  if (!employee) throw new Error(`Employee ${params.employeeId} not found`);

  const client = getClient();
  const response = await client.messages.create({
    model: getModelId("haiku"),
    max_tokens: 512,
    system: `You are ${employee.name}, a ${employee.roleTitle}. You're about to start a task and want to share your plan with the founder. Be concise. Return JSON only.`,
    messages: [{
      role: "user",
      content: `Plan your approach for this task:

Title: ${params.taskTitle}
Objective: ${params.taskObjective}
Type: ${params.taskType}

Return:
{
  "headline": "one-line summary of your plan",
  "approach": "2-3 sentence overview of how you'll tackle this",
  "steps": ["step 1", "step 2", ...],
  "questionsForFounder": ["any clarifying questions - empty array if none"],
  "estimatedComplexity": "simple" | "moderate" | "complex"
}`,
    }],
  });

  const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
  let parsed: Partial<PreExecutionCheckIn>;
  try {
    parsed = JSON.parse(raw.replace(/^```json?\s*/i, "").replace(/\s*```$/, ""));
  } catch {
    parsed = { headline: `Plan for: ${params.taskTitle}`, approach: "Ready to start." };
  }

  const content: PreExecutionCheckIn = {
    headline: parsed.headline ?? `Plan for: ${params.taskTitle}`,
    approach: parsed.approach ?? "",
    steps: parsed.steps ?? [],
    questionsForFounder: parsed.questionsForFounder ?? [],
    estimatedComplexity: parsed.estimatedComplexity ?? "moderate",
  };

  // Store as a check-in linked to the task. scheduledFor=now so this
  // pre-execution surface lands at the top of the dashboard inline list
  // rather than below every scheduled post_approval_followup. Atomic
  // write so retry of the calling worker does not double-insert.
  await db.transaction(async (tx) => {
    await tx.insert(checkIns).values({
      aiEmployeeId: params.employeeId,
      companyId: params.companyId,
      checkInType: "pre_execution",
      taskId: params.taskId,
      content: content as unknown as Record<string, unknown>,
      scheduledFor: new Date(),
    });

    await tx.insert(activityLog).values({
      companyId: params.companyId,
      aiEmployeeId: params.employeeId,
      actionType: "pre_execution_checkin",
      actionDetail: { taskId: params.taskId, headline: content.headline },
    });
  });

  return content;
}

/**
 * Apply founder's response to a check-in.
 * If the check-in is pre-execution, the response becomes task context.
 */
export async function applyCheckInResponse(params: {
  checkInId: string;
  companyId: string;
  response: string;
}): Promise<void> {
  const checkIn = await db.query.checkIns.findFirst({
    where: and(eq(checkIns.id, params.checkInId), eq(checkIns.companyId, params.companyId)),
  });

  if (!checkIn) throw new Error("Check-in not found");

  // Mark acknowledged with response
  await db.update(checkIns).set({
    acknowledged: true,
    response: params.response,
  }).where(eq(checkIns.id, params.checkInId));

  // If pre-execution check-in with a linked task, append response to task brief
  if (checkIn.checkInType === "pre_execution" && checkIn.taskId) {
    const task = await db.query.tasks.findFirst({
      where: eq(tasks.id, checkIn.taskId),
      columns: { brief: true },
    });

    if (task) {
      const brief = task.brief as Record<string, unknown>;
      await db.update(tasks).set({
        brief: { ...brief, _founderDirection: params.response },
      }).where(eq(tasks.id, checkIn.taskId));
    }
  }

  await db.insert(activityLog).values({
    companyId: params.companyId,
    aiEmployeeId: checkIn.aiEmployeeId,
    actionType: "checkin_response_applied",
    actionDetail: { checkInId: params.checkInId, checkInType: checkIn.checkInType },
  });
}
