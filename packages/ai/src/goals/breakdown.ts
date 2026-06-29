import { db, aiEmployees, knowledgeItems, goals, tasks } from "@beast/db";
import { eq, and } from "drizzle-orm";
import { getClient, getModelId } from "../models";

export interface GoalBreakdownInput {
  goalId: string;
  companyId: string;
  goalTitle: string;
  goalDescription?: string;
  targetMetric?: string;
  targetDate?: string;
}

export interface ProposedSubGoal {
  title: string;
  description: string;
  targetMetric: string;
  aiEmployeeId: string;
  aiEmployeeName: string;
}

export interface GoalBreakdownResult {
  parentGoalId: string;
  subGoals: ProposedSubGoal[];
  reasoning: string;
}

/**
 * Use LLM to break a company-level goal into department sub-goals
 * assigned to specific AI employees. Uses Sonnet for cost efficiency
 * (Opus reserved for actual strategy execution, not planning breakdowns).
 */
export async function generateGoalBreakdown(input: GoalBreakdownInput): Promise<GoalBreakdownResult> {
  // Load company's AI employees
  const employees = await db.query.aiEmployees.findMany({
    where: eq(aiEmployees.companyId, input.companyId),
    columns: { id: true, name: true, roleTitle: true, roleType: true },
  });

  if (employees.length === 0) {
    throw new Error("No AI employees found - hire employees before setting goals");
  }

  // Load company context for better breakdown
  const kbItems = await db.query.knowledgeItems.findMany({
    where: and(
      eq(knowledgeItems.companyId, input.companyId),
      eq(knowledgeItems.category, "company_overview"),
    ),
    columns: { title: true, content: true },
    limit: 3,
  });

  const companyContext = kbItems.map((k) => k.content).join("\n").slice(0, 2000);

  const employeeList = employees
    .map((e) => `- ${e.name} (${e.roleTitle}, ID: ${e.id})`)
    .join("\n");

  const client = getClient();
  const response = await client.messages.create({
    model: getModelId("sonnet"),
    max_tokens: 2048,
    system: `You are a strategic business planner. Break company goals into actionable department sub-goals that specific AI employees can work toward. Return JSON only, no markdown.`,
    messages: [{
      role: "user",
      content: `Break this company goal into department sub-goals.

**Goal:** ${input.goalTitle}
${input.goalDescription ? `**Description:** ${input.goalDescription}` : ""}
${input.targetMetric ? `**Target metric:** ${input.targetMetric}` : ""}
${input.targetDate ? `**Target date:** ${input.targetDate}` : ""}

**Company context:**
${companyContext || "No additional context available."}

**Available AI employees:**
${employeeList}

Return JSON:
{
  "reasoning": "1-2 sentences explaining the breakdown strategy",
  "subGoals": [
    {
      "title": "specific, measurable sub-goal title",
      "description": "what this sub-goal means and how it contributes to the parent",
      "targetMetric": "measurable KPI for this sub-goal",
      "aiEmployeeId": "employee UUID from the list above",
      "aiEmployeeName": "employee name"
    }
  ]
}

Rules:
- Each sub-goal must be assigned to exactly one employee from the list
- Sub-goals should be specific and measurable
- Not every employee needs a sub-goal - only assign if relevant
- 2-5 sub-goals is ideal
- Each sub-goal should clearly contribute to the parent goal`,
    }],
  });

  const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
  let parsed: { reasoning?: string; subGoals?: ProposedSubGoal[] };
  try {
    parsed = JSON.parse(raw.replace(/^```json?\s*/i, "").replace(/\s*```$/, ""));
  } catch {
    throw new Error("Failed to parse goal breakdown response from LLM");
  }

  // Validate employee IDs
  const validIds = new Set(employees.map((e) => e.id));
  const validSubGoals = (parsed.subGoals ?? []).filter((sg) => validIds.has(sg.aiEmployeeId));

  return {
    parentGoalId: input.goalId,
    subGoals: validSubGoals,
    reasoning: parsed.reasoning ?? "",
  };
}

/**
 * Recalculate a goal's progress based on its sub-goals.
 * If no sub-goals, calculates from linked task completion rate.
 * Auto-flips status to "completed" when progress hits 100 and the
 * goal is still "active" (skips paused/archived to preserve founder intent).
 */
export async function recalculateGoalProgress(goalId: string, companyId: string): Promise<number> {
  const current = await db.query.goals.findFirst({
    where: and(eq(goals.id, goalId), eq(goals.companyId, companyId)),
    columns: { status: true },
  });

  // Check for sub-goals first
  const subGoals = await db.query.goals.findMany({
    where: and(eq(goals.parentGoalId, goalId), eq(goals.companyId, companyId)),
    columns: { progressPct: true },
  });

  let progress: number;
  if (subGoals.length > 0) {
    // Average of sub-goal progress
    const total = subGoals.reduce((sum, g) => sum + g.progressPct, 0);
    progress = Math.round(total / subGoals.length);
  } else {
    // No sub-goals: calculate from linked tasks
    const linkedTasks = await db.query.tasks.findMany({
      where: and(eq(tasks.goalId, goalId), eq(tasks.companyId, companyId)),
      columns: { status: true },
    });

    if (linkedTasks.length === 0) return 0;

    const completed = linkedTasks.filter(
      (t) => t.status === "approved" || t.status === "published",
    ).length;

    progress = Math.round((completed / linkedTasks.length) * 100);
  }

  const shouldAutoComplete = progress === 100 && current?.status === "active";
  const nextStatus = shouldAutoComplete ? "completed" : (current?.status ?? "active");

  await db
    .update(goals)
    .set({ progressPct: progress, status: nextStatus, updatedAt: new Date() })
    .where(and(eq(goals.id, goalId), eq(goals.companyId, companyId)));

  return progress;
}
