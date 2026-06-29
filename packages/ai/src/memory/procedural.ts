import { db } from "@beast/db";
import { proceduralMemories, activityLog } from "@beast/db";
import { eq, and, sql } from "drizzle-orm";
import { embed } from "./embeddings";
import type { AppliedRule, RetrievedMemory } from "../types";

/**
 * Load current procedural rules for an agent, optionally filtered by task scope.
 *
 * Capped at `topK` (default 30) so working-memory budget stays bounded as
 * a tenant accumulates rules over time. The PRIMER spec budgets ~1K tokens
 * for procedural memory per task; at ~50 tokens per rule that is ~20
 * rules, so 30 leaves headroom for the post-fetch taskScope filter to
 * reject some without dropping below the working budget.
 */
export async function retrieveProceduralMemories(
  agentId: string,
  tenantId: string,
  taskType?: string,
  topK = 30,
): Promise<RetrievedMemory[]> {
  const conditions = [
    eq(proceduralMemories.agentId, agentId),
    eq(proceduralMemories.tenantId, tenantId),
    eq(proceduralMemories.isCurrent, true),
  ];

  const results = await db.query.proceduralMemories.findMany({
    where: and(...conditions),
    columns: {
      ruleType: true,
      title: true,
      description: true,
      taskScope: true,
      examples: true,
    },
    orderBy: (pm, { desc }) => [desc(pm.signalWeight)],
    limit: topK,
  });

  // Filter to rules that apply to this task type (or are universal)
  const filtered = results.filter((r) => {
    if (!r.taskScope || r.taskScope.length === 0) return true;
    if (!taskType) return true;
    return r.taskScope.includes(taskType);
  });

  return filtered.map((r) => {
    let content = `[${r.ruleType}] ${r.title}: ${r.description}`;
    const examples = r.examples as { good?: string[]; bad?: string[] } | null;
    if (examples?.good?.length) {
      content += `\nGood examples: ${examples.good.join("; ")}`;
    }
    if (examples?.bad?.length) {
      content += `\nAvoid: ${examples.bad.join("; ")}`;
    }
    return {
      type: "procedural" as const,
      content,
      score: 1.0,
    };
  });
}

/**
 * Same query as retrieveProceduralMemories but returns the rule metadata
 * needed for the "Alex remembered" panel. the current build treats every
 * loaded rule as applied; per-rule attribution from the output text is a
 * v1 concern.
 */
export async function retrieveAppliedRules(
  agentId: string,
  tenantId: string,
  taskType?: string,
  topK = 30,
): Promise<AppliedRule[]> {
  const conditions = [
    eq(proceduralMemories.agentId, agentId),
    eq(proceduralMemories.tenantId, tenantId),
    eq(proceduralMemories.isCurrent, true),
  ];

  const rows = await db.query.proceduralMemories.findMany({
    where: and(...conditions),
    columns: {
      id: true,
      title: true,
      description: true,
      taskScope: true,
      sourceEpisodes: true,
      signalWeight: true,
      createdAt: true,
    },
    orderBy: (pm, { desc }) => [desc(pm.signalWeight)],
    limit: topK,
  });

  const filtered = rows.filter((r) => {
    if (!r.taskScope || r.taskScope.length === 0) return true;
    if (!taskType) return true;
    return r.taskScope.includes(taskType);
  });

  return filtered.map((r) => ({
    ruleId: r.id,
    summary: r.title,
    evidence: r.description,
    extractedFromDeliverableId: r.sourceEpisodes?.[0] ?? "",
    extractedFromTitle: "",
    extractedAt: r.createdAt.toISOString(),
    confidence: r.signalWeight ?? 1.0,
  }));
}

/**
 * Create a new version of a procedural rule (append-only).
 * Sets previous version's is_current to false.
 *
 * Embed runs BEFORE the transaction (LLM network call shouldn't hold a
 * DB connection). The two writes in the parent-update path (mark parent
 * not-current + insert successor) are wrapped in a single transaction
 * so a connection drop between them cannot leave the lineage with no
 * current rule. Same shape as the row 89 rollbackRule fix.
 */
export async function upsertProceduralRule(input: {
  agentId: string;
  tenantId: string;
  ruleType: string;
  taskScope?: string[];
  title: string;
  description: string;
  examples?: { good?: string[]; bad?: string[] };
  sourceEpisodes?: string[];
  parentId?: string;
  signalCount?: number;
  signalWeight?: number;
}): Promise<string> {
  const vector = await embed(`${input.title} ${input.description}`);

  return await db.transaction(async (tx) => {
    let version = 1;
    if (input.parentId) {
      const parent = await tx.query.proceduralMemories.findFirst({
        where: eq(proceduralMemories.id, input.parentId),
        columns: { version: true },
      });
      if (parent) version = parent.version + 1;

      await tx
        .update(proceduralMemories)
        .set({ isCurrent: false })
        .where(eq(proceduralMemories.id, input.parentId));
    }

    const [row] = await tx
      .insert(proceduralMemories)
      .values({
        agentId: input.agentId,
        tenantId: input.tenantId,
        ruleType: input.ruleType,
        taskScope: input.taskScope ?? [],
        title: input.title,
        description: input.description,
        examples: input.examples ?? null,
        version,
        parentId: input.parentId,
        isCurrent: true,
        sourceEpisodes: input.sourceEpisodes ?? [],
        signalCount: input.signalCount ?? 1,
        signalWeight: input.signalWeight ?? 1.0,
        embedding: vector,
      })
      .returning({ id: proceduralMemories.id });

    return row!.id;
  });
}

/**
 * Rollback a procedural rule to its previous version.
 *
 * Wraps the two updates in a single transaction so a connection drop
 * between them cannot leave the lineage with no current rule (the
 * deprecated child committed but the parent restoration unwritten).
 *
 * `audit` is optional so existing callers (e.g. founder-driven restore
 * via memory router) can roll back without writing an activity_log row;
 * detectDrift passes audit so its auto-rollbacks surface in the
 * dashboard ActivityFeed via the rule_rolled_back arm.
 */
export async function rollbackRule(
  ruleId: string,
  reason?: string,
  audit?: { companyId: string; agentId: string },
): Promise<boolean> {
  const rule = await db.query.proceduralMemories.findFirst({
    where: eq(proceduralMemories.id, ruleId),
    columns: { id: true, parentId: true, title: true },
  });

  if (!rule?.parentId) return false;
  const parentId = rule.parentId;
  const title = rule.title;

  await db.transaction(async (tx) => {
    await tx
      .update(proceduralMemories)
      .set({ isCurrent: false, deprecatedAt: new Date(), deprecatedReason: reason ?? "rolled_back" })
      .where(eq(proceduralMemories.id, ruleId));

    await tx
      .update(proceduralMemories)
      .set({ isCurrent: true })
      .where(eq(proceduralMemories.id, parentId));

    if (audit) {
      await tx.insert(activityLog).values({
        companyId: audit.companyId,
        aiEmployeeId: audit.agentId,
        actionType: "rule_rolled_back",
        actionDetail: { ruleId, parentRuleId: parentId, ruleTitle: title, reason: reason ?? null },
      });
    }
  });

  return true;
}
