import { db } from "@beast/db";
import { episodicMemories, proceduralMemories, deliverables, activityLog } from "@beast/db";
import { eq, and, or, sql, lt, gte, inArray, isNull } from "drizzle-orm";
import { getClient, getModelId } from "../models";
import { embed } from "./embeddings";

// ── Memory Consolidation ──

/**
 * Consolidation job: runs nightly per agent.
 * 1. Gather unconsolidated episodes
 * 2. Group by episode_type + task similarity
 * 3. For groups ≥ 3 episodes, extract a pattern via LLM
 * 4. Promote to procedural memory if confidence > 0.7
 * 5. Mark consolidated episodes
 */
export async function consolidateMemories(agentId: string, tenantId: string): Promise<{
  patternsExtracted: number;
  episodesConsolidated: number;
  episodesDecayed: number;
}> {
  let patternsExtracted = 0;
  let episodesConsolidated = 0;

  // Step 1: Get unconsolidated episodes (max 100)
  const episodes = await db.query.episodicMemories.findMany({
    where: and(
      eq(episodicMemories.agentId, agentId),
      eq(episodicMemories.tenantId, tenantId),
      eq(episodicMemories.isConsolidated, false),
    ),
    orderBy: (e, { desc }) => [desc(e.occurredAt)],
    limit: 100,
  });

  if (episodes.length < 3) {
    const { decayed, archived } = await decayOldEpisodes(agentId, tenantId);
    return {
      patternsExtracted: 0,
      episodesConsolidated: archived,
      episodesDecayed: decayed,
    };
  }

  const groups = new Map<string, typeof episodes>();
  for (const ep of episodes) {
    const key = ep.episodeType;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(ep);
  }

  // Step 3: For groups ≥ 3, extract patterns
  for (const [type, groupEpisodes] of groups) {
    if (groupEpisodes.length < 3) continue;

    const summaries = groupEpisodes
      .slice(0, 10) // Cap at 10 to stay within token limits
      .map((e) => {
        // Tag each summary with finalStatus so the LLM can distinguish
        // approval patterns (do) from rejection patterns (do not). Without
        // this tag, the clustering flattens both into style_rule and
        // avoid-patterns are silently lost.
        const content = (e.content as Record<string, unknown> | null) ?? {};
        const finalStatus = typeof content.finalStatus === "string"
          ? content.finalStatus.toUpperCase()
          : null;
        const tag = finalStatus ? `[${finalStatus}] ` : "";
        return `${tag}${e.summary}`;
      })
      .join("\n- ");

    const client = getClient();
    const completion = await client.messages.create({
      model: getModelId("haiku"),
      max_tokens: 512,
      system: "Extract recurring patterns from episodic memories. Return JSON only.",
      messages: [
        {
          role: "user",
          content: `${groupEpisodes.length} episodes of type "${type}":
- ${summaries}

Episode prefixes [APPROVED] / [PUBLISHED] / [REVISION] / [REJECTED] tag the outcome.
Extract patterns that appear 3+ times. Polarity rules:
- "positive" if the pattern is a thing the agent should keep doing (>=3 approvals)
- "negative" if the pattern correlates with rejections or revision requests

Return:
{
  "patterns": [
    {
      "title": "short pattern name",
      "description": "what the pattern is and why it matters",
      "confidence": 0.0-1.0,
      "task_scope": ["task types this applies to"],
      "polarity": "positive" | "negative"
    }
  ]
}

If no clear pattern emerges, return {"patterns": []}.`,
        },
      ],
    });

    const raw = completion.content[0]?.type === "text" ? completion.content[0].text : "{}";
    let parsed: {
      patterns: Array<{
        title: string;
        description: string;
        confidence: number;
        task_scope: string[];
        polarity?: string;
      }>;
    };
    try {
      parsed = JSON.parse(raw.replace(/^```json?\s*/i, "").replace(/\s*```$/, ""));
    } catch {
      continue;
    }

    // Step 4: Pre-compute embeddings for qualifying patterns BEFORE the
    // DB write so a Trigger.dev retry of an embed failure does not duplicate
    // procedural rows. The original code inserted procedural memories
    // inside the loop with the embed call between them; an embed throw on
    // pattern N+1 would have left N rows committed, then attempt 2 of the
    // task would re-extract patterns via paid LLM call and re-insert all
    // N+1 rows duplicating the first N.
    const qualifying = (parsed.patterns ?? []).filter((p) => p.confidence >= 0.7);
    const patternRows = await Promise.all(
      qualifying.map(async (pattern) => {
        const vector = await embed(`${pattern.title}: ${pattern.description}`);
        const isNegative = pattern.polarity === "negative";
        const ruleType = type === "feedback_received" || type === "task_completed"
          ? (isNegative ? "avoid_pattern" : "style_rule")
          : "skill_template";
        return {
          agentId,
          tenantId,
          ruleType,
          title: pattern.title,
          description: pattern.description,
          taskScope: pattern.task_scope,
          version: 1,
          isCurrent: true,
          sourceEpisodes: groupEpisodes.map((e) => e.id),
          signalCount: groupEpisodes.length,
          signalWeight: pattern.confidence * groupEpisodes.length,
          embedding: vector,
        };
      }),
    );

    // Step 5: Atomic write. procedural inserts + episode-marked-consolidated
    // updates + audit row roll back together. If the marking fails, no
    // procedural row commits; if any procedural insert fails, no episode
    // is marked. Without this, a partial commit between the two for-loops
    // in the original code would let the retry re-fire the LLM call and
    // double-write procedural rows for episodes that were never marked.
    if (patternRows.length > 0 || groupEpisodes.length > 0) {
      const episodeIds = groupEpisodes.map((e) => e.id);
      await db.transaction(async (tx) => {
        if (patternRows.length > 0) {
          await tx.insert(proceduralMemories).values(patternRows);
          patternsExtracted += patternRows.length;

          // Surface the rule promotion in the dashboard ActivityFeed so
          // the founder doesn't have to visit /settings/rules to discover
          // what the agent learned overnight. One row per episode-type
          // group; with ~3 active groups per agent the feed sees at most
          // a handful of these per nightly run.
          await tx.insert(activityLog).values({
            companyId: tenantId,
            aiEmployeeId: agentId,
            actionType: "patterns_learned",
            actionDetail: {
              count: patternRows.length,
              episodeType: type,
              fromEpisodes: groupEpisodes.length,
              titles: patternRows.slice(0, 3).map((p) => p.title),
            },
          });
        }
        if (episodeIds.length > 0) {
          await tx
            .update(episodicMemories)
            .set({ isConsolidated: true })
            .where(inArray(episodicMemories.id, episodeIds));
          episodesConsolidated += episodeIds.length;
        }
      });
    }
  }

  // Step 6: Decay old episodes + archive long-stale low-salience ones
  const { decayed, archived } = await decayOldEpisodes(agentId, tenantId);

  return {
    patternsExtracted,
    episodesConsolidated: episodesConsolidated + archived,
    episodesDecayed: decayed,
  };
}

// ── Salience Decay ──

/**
 * Decay episodes that haven't been accessed in 30+ days, then archive
 * long-stale low-salience ones. -10% salience per cycle on the decay
 * pass; flip isConsolidated=true on episodes that are 90+ days old
 * with salience < 0.3.
 *
 * The previous filter used `eq(accessCount, 0)` which only decayed
 * never-accessed episodes. Combined with the fix that
 * actually bumps accessCount on retrieve, this regressed to "no
 * accessed episode ever decays" - salience stuck at insert value
 * forever. The correct test is on lastAccessedAt: an episode hasn't
 * been accessed in 30+ days iff lastAccessedAt is null (never
 * retrieved) OR lastAccessedAt < 30 days ago.
 *
 * Archive uses isConsolidated=true to remove the row from active recall
 * without a schema migration (an `archived` column would be cleaner but
 * needs a migration). Existing readers (retrieve filter, consolidation
 * input filter, decay filter) all already exclude isConsolidated=true,
 * so the dual use is functionally correct; the docblock notes the
 * archive semantic so future code reading isConsolidated knows the
 * value can mean either "consolidated into procedural" or "archived
 * by decay."
 */
async function decayOldEpisodes(
  agentId: string,
  tenantId: string,
): Promise<{ decayed: number; archived: number }> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const ARCHIVE_SALIENCE_THRESHOLD = 0.3;

  // Decay salience on stale episodes
  const decayResult = await db
    .update(episodicMemories)
    .set({
      salienceScore: sql`GREATEST(${episodicMemories.salienceScore} * 0.9, 0.05)`,
    })
    .where(
      and(
        eq(episodicMemories.agentId, agentId),
        eq(episodicMemories.tenantId, tenantId),
        eq(episodicMemories.isConsolidated, false),
        lt(episodicMemories.occurredAt, thirtyDaysAgo),
        or(
          isNull(episodicMemories.lastAccessedAt),
          lt(episodicMemories.lastAccessedAt, thirtyDaysAgo),
        ),
      ),
    )
    .returning({ id: episodicMemories.id });

  // Archive episodes that have decayed below threshold AND are 90+ days
  // old. Runs AFTER decay so this pass's decay can trigger this pass's
  // archive (an episode at 0.33 that decays to 0.297 in this cycle is
  // archived immediately rather than waiting for the next nightly run).
  const archiveResult = await db
    .update(episodicMemories)
    .set({ isConsolidated: true })
    .where(
      and(
        eq(episodicMemories.agentId, agentId),
        eq(episodicMemories.tenantId, tenantId),
        eq(episodicMemories.isConsolidated, false),
        lt(episodicMemories.occurredAt, ninetyDaysAgo),
        lt(episodicMemories.salienceScore, ARCHIVE_SALIENCE_THRESHOLD),
      ),
    )
    .returning({ id: episodicMemories.id });

  return { decayed: decayResult.length, archived: archiveResult.length };
}

// ── Drift Detection + Auto-Rollback ──

const DRIFT_RECENT_WINDOW_DAYS = 14;
const DRIFT_PRIOR_WINDOW_DAYS = 14;
const DRIFT_THRESHOLD = -0.1;

interface DeliverableRow {
  id: string;
  status: string;
  updatedAt: Date | null;
  content: unknown;
}

function approvalRate(rows: DeliverableRow[]): number | null {
  if (rows.length === 0) return null;
  const good = rows.filter((d) => d.status === "approved" || d.status === "published").length;
  const bad = rows.filter(
    (d) => d.status === "revision" || d.status === "rejected",
  ).length;
  const denom = good + bad;
  if (denom === 0) return null;
  return good / denom;
}

function deliverableTouchesRule(row: DeliverableRow, ruleId: string): boolean {
  const content = (row.content as Record<string, unknown> | null) ?? {};
  const applied = content.appliedRules as Array<{ ruleId?: string }> | undefined;
  if (!Array.isArray(applied)) return false;
  return applied.some((r) => r?.ruleId === ruleId);
}

/**
 * Check for rules that have degraded performance.
 * Compares approval rate in the last 14 days vs the prior 14 days,
 * computed inline from deliverables.content.appliedRules so we do not
 * depend on a never-written approvalRateDelta column. Drift fires when
 * recent rate dropped 10pp+ vs the prior window.
 */
export async function detectDrift(agentId: string, tenantId: string): Promise<{
  rulesRolledBack: number;
  rulesDeprecated: number;
}> {
  let rulesRolledBack = 0;
  let rulesDeprecated = 0;

  const currentRules = await db.query.proceduralMemories.findMany({
    where: and(
      eq(proceduralMemories.agentId, agentId),
      eq(proceduralMemories.tenantId, tenantId),
      eq(proceduralMemories.isCurrent, true),
    ),
  });

  if (currentRules.length === 0) return { rulesRolledBack, rulesDeprecated };

  const now = Date.now();
  const recentStart = new Date(now - DRIFT_RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const priorStart = new Date(
    now - (DRIFT_RECENT_WINDOW_DAYS + DRIFT_PRIOR_WINDOW_DAYS) * 24 * 60 * 60 * 1000,
  );

  // Pull every final-state deliverable for this agent in the 28-day window
  // once, then filter per rule in JS via content.appliedRules. JSONB query
  // per rule would be O(rules * deliverables) round trips; the in-memory
  // filter is O(rules * deliverables) compute against a single query.
  const recentRows: DeliverableRow[] = await db
    .select({
      id: deliverables.id,
      status: deliverables.status,
      updatedAt: deliverables.updatedAt,
      content: deliverables.content,
    })
    .from(deliverables)
    .where(
      and(
        eq(deliverables.aiEmployeeId, agentId),
        eq(deliverables.companyId, tenantId),
        gte(deliverables.updatedAt, priorStart),
      ),
    );

  for (const rule of currentRules) {
    if ((rule.tasksAppliedTo ?? 0) < 5) continue;

    const touched = recentRows.filter((d) => deliverableTouchesRule(d, rule.id));
    if (touched.length === 0) continue;

    const recentSet = touched.filter((d) => d.updatedAt && d.updatedAt >= recentStart);
    const priorSet = touched.filter(
      (d) => d.updatedAt && d.updatedAt >= priorStart && d.updatedAt < recentStart,
    );

    const recentRate = approvalRate(recentSet);
    const priorRate = approvalRate(priorSet);
    if (recentRate === null || priorRate === null) continue;

    const approvalDelta = recentRate - priorRate;

    // Persist the delta we just computed so /settings/rules + future
    // ticks can read it without recomputing.
    await db
      .update(proceduralMemories)
      .set({ approvalRateDelta: approvalDelta })
      .where(eq(proceduralMemories.id, rule.id));

    if (approvalDelta < DRIFT_THRESHOLD) {
      const reasonText = `Auto-rollback: approval rate dropped ${(approvalDelta * 100).toFixed(0)}%`;
      const deprecatedText = `Auto-deprecated: approval rate dropped ${(approvalDelta * 100).toFixed(0)}%`;
      if (rule.parentId) {
        const { rollbackRule } = await import("./procedural");
        await rollbackRule(rule.id, reasonText, { companyId: tenantId, agentId });
        rulesRolledBack++;
      } else {
        // Atomic so deprecate + audit log commit together; same shape as
        // updateEmployeeStatuses. Without the tx, retry could
        // re-read the already-deprecated rule, the currentRules query
        // (filters isCurrent=true) would skip it, and the rule_deprecated
        // activity row would never get written.
        await db.transaction(async (tx) => {
          await tx
            .update(proceduralMemories)
            .set({
              isCurrent: false,
              deprecatedAt: new Date(),
              deprecatedReason: deprecatedText,
            })
            .where(eq(proceduralMemories.id, rule.id));

          await tx.insert(activityLog).values({
            companyId: tenantId,
            aiEmployeeId: agentId,
            actionType: "rule_deprecated",
            actionDetail: {
              ruleId: rule.id,
              ruleTitle: rule.title,
              reason: deprecatedText,
              approvalRateDelta: approvalDelta,
            },
          });
        });
        rulesDeprecated++;
      }
    }
  }

  return { rulesRolledBack, rulesDeprecated };
}
