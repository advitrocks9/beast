import { db, signals, aiEmployees, goals } from "@beast/db";
import { eq, and, isNull, inArray } from "drizzle-orm";
import { getClient, getModelId } from "../models";
import type { TickContext } from "../orchestrator/types";

interface SignalDispatch {
  signalId: string;
  employeeId: string;
  title: string;
}

/**
 * Process pending signals: filter by relevance, route to appropriate employee.
 * Called from the orchestrator tick.
 */
export async function processSignals(ctx: TickContext): Promise<{
  processed: number;
  routed: SignalDispatch[];
  filtered: number;
  errors: string[];
}> {
  const result = { processed: 0, routed: [] as SignalDispatch[], filtered: 0, errors: [] as string[] };

  // Fetch pending signals for this company
  const pending = await db.query.signals.findMany({
    where: and(eq(signals.companyId, ctx.companyId), eq(signals.status, "pending")),
    limit: 20,
  });

  if (pending.length === 0) return result;

  // Load employees for routing
  const employees = await db.query.aiEmployees.findMany({
    where: eq(aiEmployees.companyId, ctx.companyId),
    columns: { id: true, name: true, roleType: true },
  });

  if (employees.length === 0) return result;

  // Hoist the company-goals query out of the per-signal scoreRelevance
  // call. Goals don't change within a single tick, so re-fetching them
  // 20 times (once per pending signal) is 19 redundant round trips. The
  // formatted goalContext string is identical across all signals in this
  // batch.
  const companyGoalsForRelevance = await db.query.goals.findMany({
    where: and(eq(goals.companyId, ctx.companyId), isNull(goals.parentGoalId), eq(goals.status, "active")),
    columns: { title: true },
    limit: 5,
  });
  const goalContext = companyGoalsForRelevance.length > 0
    ? `Company goals: ${companyGoalsForRelevance.map((g) => g.title).join(", ")}`
    : "No active goals set.";

  for (const signal of pending) {
    try {
      result.processed++;

      // Haiku relevance filter
      const relevance = await scoreRelevance(signal.title, signal.summary, goalContext);

      if (relevance < 5) {
        // Low relevance - filter out
        await db.update(signals).set({
          status: "filtered",
          relevanceScore: relevance,
        }).where(eq(signals.id, signal.id));
        result.filtered++;
        continue;
      }

      // Route to best employee
      const targetEmployee = routeToEmployee(signal.source, signal.summary, employees);

      await db.update(signals).set({
        status: "routed",
        relevanceScore: relevance,
        routedToEmployeeId: targetEmployee.id,
      }).where(eq(signals.id, signal.id));

      result.routed.push({
        signalId: signal.id,
        employeeId: targetEmployee.id,
        title: signal.title,
      });
    } catch (err) {
      result.errors.push(`Signal ${signal.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}

/** Use Haiku to score signal relevance (0-10). */
async function scoreRelevance(title: string, summary: string, goalContext: string): Promise<number> {
  const client = getClient();
  const response = await client.messages.create({
    model: getModelId("haiku"),
    max_tokens: 32,
    system: "Score the relevance of this signal to the company on a scale of 0-10. Return only the number.",
    messages: [{
      role: "user",
      content: `${goalContext}\n\nSignal: ${title}\n${summary}`,
    }],
  });

  const raw = response.content[0]?.type === "text" ? response.content[0].text.trim() : "0";
  const score = parseInt(raw, 10);
  return Number.isNaN(score) ? 5 : Math.max(0, Math.min(10, score));
}

/** Route a signal to the most relevant employee based on source and content. */
function routeToEmployee(
  source: string,
  summary: string,
  employees: Array<{ id: string; name: string; roleType: string }>,
): { id: string; name: string } {
  // Simple keyword-based routing
  const lower = `${source} ${summary}`.toLowerCase();

  const marketing = employees.find((e) => e.roleType === "marketing");
  const sales = employees.find((e) => e.roleType === "sales");
  const support = employees.find((e) => e.roleType === "support");

  // Competitor/content signals → marketing
  if (lower.includes("competitor") || lower.includes("content") || lower.includes("seo") || lower.includes("blog")) {
    if (marketing) return { id: marketing.id, name: marketing.name };
  }

  // Prospect/outreach signals → sales
  if (lower.includes("prospect") || lower.includes("lead") || lower.includes("outreach") || lower.includes("pipeline")) {
    if (sales) return { id: sales.id, name: sales.name };
  }

  // Support/ticket signals → support
  if (lower.includes("ticket") || lower.includes("support") || lower.includes("faq") || lower.includes("customer")) {
    if (support) return { id: support.id, name: support.name };
  }

  // Default: route to marketing (most general)
  return marketing ?? sales ?? support ?? { id: employees[0]!.id, name: employees[0]!.name };
}

/**
 * Detect goal gaps - company goals that are behind schedule.
 * Creates internal signals for goals with low progress near their target date.
 *
 * Deduplicates against existing pending/routed goal_gap signals so the
 * 5-minute orchestrator tick does not flood the signals table with one
 * row per at-risk goal per tick (288 duplicates per goal per day).
 */
export async function detectGoalGaps(ctx: TickContext): Promise<number> {
  const activeGoals = await db.query.goals.findMany({
    where: and(
      eq(goals.companyId, ctx.companyId),
      eq(goals.status, "active"),
    ),
    columns: { id: true, title: true, progressPct: true, targetDate: true, aiEmployeeId: true },
  });

  if (activeGoals.length === 0) return 0;

  // Pull every live goal_gap signal for this company in one query and
  // build a Set keyed on metadata.goalId. JSONB key extraction in JS is
  // safer than a drizzle expression here since the signals table sees
  // metadata writes from multiple sources.
  const liveGapSignals = await db.query.signals.findMany({
    where: and(
      eq(signals.companyId, ctx.companyId),
      eq(signals.source, "goal_gap"),
      inArray(signals.status, ["pending", "routed"]),
    ),
    columns: { metadata: true },
  });
  const goalsWithLiveSignal = new Set<string>();
  for (const row of liveGapSignals) {
    const meta = (row.metadata as Record<string, unknown> | null) ?? {};
    if (typeof meta.goalId === "string") goalsWithLiveSignal.add(meta.goalId);
  }

  let signalsCreated = 0;

  for (const goal of activeGoals) {
    if (!goal.targetDate) continue;
    if (goalsWithLiveSignal.has(goal.id)) continue;

    const targetDate = new Date(goal.targetDate);
    const daysRemaining = Math.ceil((targetDate.getTime() - ctx.now.getTime()) / (1000 * 60 * 60 * 24));

    // Flag goals that are <50% progress with <30 days remaining
    if (daysRemaining > 0 && daysRemaining <= 30 && goal.progressPct < 50) {
      await db.insert(signals).values({
        companyId: ctx.companyId,
        source: "goal_gap",
        title: `Goal at risk: ${goal.title}`,
        summary: `Only ${goal.progressPct}% progress with ${daysRemaining} days remaining. Needs attention.`,
        metadata: { goalId: goal.id, progressPct: goal.progressPct, daysRemaining },
      });
      signalsCreated++;
    }
  }

  return signalsCreated;
}
