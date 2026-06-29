import { db } from "@beast/db";
import { knowledgeEmbeddings, knowledgeItems } from "@beast/db";
import { eq, sql, and, desc } from "drizzle-orm";
import { embed, embedBatch, chunkText } from "./embeddings";
import type { RetrievedMemory } from "../types";

/**
 * Store a knowledge item's content as chunked embeddings.
 */
export async function indexKnowledgeItem(
  companyId: string,
  knowledgeItemId: string,
  content: string,
): Promise<number> {
  const chunks = chunkText(content);
  const vectors = await embedBatch(chunks);

  const rows = chunks.map((text, i) => ({
    companyId,
    knowledgeItemId,
    chunkIndex: i,
    chunkText: text,
    embedding: vectors[i]!,
  }));

  if (rows.length > 0) {
    await db.insert(knowledgeEmbeddings).values(rows);
  }

  return rows.length;
}

/**
 * Retrieve relevant knowledge chunks for a query.
 * Uses pgvector cosine similarity search, scoped to tenant.
 *
 * Unlike episodic retrieve (which has a hybrid score that lets even
 * low-similarity matches surface via recency + frequency), semantic
 * retrieve is pure cosine. Without a floor, a query whose KB has no
 * real match still returns the topK closest chunks regardless of how
 * distant; the agent then treats irrelevant content as authoritative
 * RAG context. The 0.5 default rejects matches in the bottom half of
 * the similarity range while still being permissive enough that
 * tenants with small KBs are not starved of context.
 */
export async function retrieveSemanticMemories(
  tenantId: string,
  query: string,
  topK = 8,
  minSimilarity = 0.5,
): Promise<RetrievedMemory[]> {
  const queryVector = await embed(query);

  const results = await db
    .select({
      chunkId: knowledgeEmbeddings.id,
      knowledgeItemId: knowledgeEmbeddings.knowledgeItemId,
      chunkText: knowledgeEmbeddings.chunkText,
      similarity: sql<number>`1 - (${knowledgeEmbeddings.embedding} <=> ${JSON.stringify(queryVector)}::vector)`,
      category: knowledgeItems.category,
      title: knowledgeItems.title,
    })
    .from(knowledgeEmbeddings)
    .innerJoin(knowledgeItems, eq(knowledgeEmbeddings.knowledgeItemId, knowledgeItems.id))
    .where(
      and(
        eq(knowledgeEmbeddings.companyId, tenantId),
        sql`1 - (${knowledgeEmbeddings.embedding} <=> ${JSON.stringify(queryVector)}::vector) >= ${minSimilarity}`,
      ),
    )
    .orderBy(sql`${knowledgeEmbeddings.embedding} <=> ${JSON.stringify(queryVector)}::vector`)
    .limit(topK);

  return results.map((r) => ({
    type: "semantic" as const,
    content: `[${r.category}/${r.title}] ${r.chunkText}`,
    score: r.similarity,
    sourceRef: {
      chunkId: r.chunkId,
      knowledgeItemId: r.knowledgeItemId,
      category: r.category,
      title: r.title,
    },
  }));
}

/**
 * Delete all embeddings for a knowledge item (before re-indexing).
 */
export async function deleteKnowledgeEmbeddings(knowledgeItemId: string): Promise<void> {
  await db
    .delete(knowledgeEmbeddings)
    .where(eq(knowledgeEmbeddings.knowledgeItemId, knowledgeItemId));
}
