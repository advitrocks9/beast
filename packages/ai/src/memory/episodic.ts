import { db } from "@beast/db";
import { episodicMemories } from "@beast/db";
import { eq, sql, and, desc, inArray } from "drizzle-orm";
import { embed } from "./embeddings";
import type { RetrievedMemory } from "../types";

interface EpisodeInput {
  agentId: string;
  tenantId: string;
  episodeType: string;
  summary: string;
  content: Record<string, unknown>;
  taskId?: string;
  sessionId?: string;
  salienceScore?: number;
}

/**
 * Store a new episodic memory.
 * Deduplicates: if a near-identical episode exists (cosine > 0.92),
 * increments access_count on the existing one instead.
 */
export async function storeEpisode(input: EpisodeInput): Promise<string> {
  const vector = await embed(input.summary);

  // Check for near-duplicates
  const duplicates = await db
    .select({
      id: episodicMemories.id,
      similarity: sql<number>`1 - (${episodicMemories.embedding} <=> ${JSON.stringify(vector)}::vector)`,
    })
    .from(episodicMemories)
    .where(
      and(
        eq(episodicMemories.agentId, input.agentId),
        eq(episodicMemories.tenantId, input.tenantId),
      ),
    )
    .orderBy(sql`${episodicMemories.embedding} <=> ${JSON.stringify(vector)}::vector`)
    .limit(1);

  const topMatch = duplicates[0];
  if (topMatch && topMatch.similarity > 0.92) {
    // Near-duplicate: bump access count instead of creating new
    await db
      .update(episodicMemories)
      .set({
        accessCount: sql`${episodicMemories.accessCount} + 1`,
        lastAccessedAt: new Date(),
      })
      .where(eq(episodicMemories.id, topMatch.id));
    return topMatch.id;
  }

  const [row] = await db
    .insert(episodicMemories)
    .values({
      agentId: input.agentId,
      tenantId: input.tenantId,
      episodeType: input.episodeType,
      summary: input.summary,
      content: input.content,
      embedding: vector,
      occurredAt: new Date(),
      taskId: input.taskId,
      sessionId: input.sessionId,
      salienceScore: input.salienceScore ?? 0.5,
    })
    .returning({ id: episodicMemories.id });

  return row!.id;
}

/**
 * Retrieve relevant episodic memories using hybrid scoring:
 * 60% cosine similarity + 20% recency + 20% frequency, multiplied by salience.
 */
export async function retrieveEpisodicMemories(
  agentId: string,
  tenantId: string,
  query: string,
  topK = 5,
): Promise<RetrievedMemory[]> {
  const queryVector = await embed(query);

  // Hybrid scoring query
  const results = await db
    .select({
      id: episodicMemories.id,
      summary: episodicMemories.summary,
      episodeType: episodicMemories.episodeType,
      occurredAt: episodicMemories.occurredAt,
      salienceScore: episodicMemories.salienceScore,
      accessCount: episodicMemories.accessCount,
      cosineSim: sql<number>`1 - (${episodicMemories.embedding} <=> ${JSON.stringify(queryVector)}::vector)`,
      recencyScore: sql<number>`1.0 / (1.0 + EXTRACT(EPOCH FROM (now() - ${episodicMemories.occurredAt})) / 86400.0)`,
      frequencyScore: sql<number>`LEAST(${episodicMemories.accessCount}::float / 10.0, 1.0)`,
    })
    .from(episodicMemories)
    .where(
      and(
        eq(episodicMemories.agentId, agentId),
        eq(episodicMemories.tenantId, tenantId),
        eq(episodicMemories.isConsolidated, false),
      ),
    )
    .orderBy(
      desc(
        sql`(0.6 * (1 - (${episodicMemories.embedding} <=> ${JSON.stringify(queryVector)}::vector)) + 0.2 * (1.0 / (1.0 + EXTRACT(EPOCH FROM (now() - ${episodicMemories.occurredAt})) / 86400.0)) + 0.2 * LEAST(${episodicMemories.accessCount}::float / 10.0, 1.0)) * ${episodicMemories.salienceScore}`,
      ),
    )
    .limit(topK);

  // Bump access counts for retrieved memories so the frequency arm of
  // the hybrid score actually reflects retrieval popularity. The previous
  // implementation had an empty for-loop with a comment claiming the
  // bump was implicit; nothing ever incremented accessCount on retrieve,
  // so the 0.2 * (accessCount / 10) term contributed 0 always and the
  // hybrid score was effectively 60% similarity + 20% recency, not the
  // documented 60/20/20 mix. The duplicate-detection write at line 48
  // bumps on EPISODE WRITE which is a different signal.
  //
  // Fire-and-forget: a failed bump should not crash retrieval. Single
  // UPDATE with inArray collapses N writes into one round trip.
  const retrievedIds = results.map((r) => r.id);
  if (retrievedIds.length > 0) {
    db
      .update(episodicMemories)
      .set({
        accessCount: sql`${episodicMemories.accessCount} + 1`,
        lastAccessedAt: new Date(),
      })
      .where(inArray(episodicMemories.id, retrievedIds))
      .catch((err) => {
        console.error("[memory] retrieve access count bump failed:", err);
      });
  }

  return results.map((r) => ({
    type: "episodic" as const,
    content: `[${r.episodeType}] ${r.summary}`,
    score: (0.6 * r.cosineSim + 0.2 * r.recencyScore + 0.2 * r.frequencyScore) * r.salienceScore,
  }));
}
