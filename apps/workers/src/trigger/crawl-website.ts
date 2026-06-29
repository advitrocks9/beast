import { task } from "@trigger.dev/sdk";
import { db, knowledgeItems, knowledgeEmbeddings } from "@beast/db";
import { chunkText, embedBatch } from "@beast/ai";

interface CrawlPayload {
  url: string;
  companyId: string;
}

interface FirecrawlResponse {
  success: boolean;
  data?: {
    markdown: string;
    metadata: {
      title?: string;
      description?: string;
      sourceURL?: string;
    };
  };
  error?: string;
}

const KNOWLEDGE_CONTENT_PREVIEW_CHARS = 8000;
const MIN_TEXT_CHARS = 100;

/**
 * Pulls a single URL through Firecrawl, takes the rendered markdown, chunks
 * it, embeds each chunk via Gemini, and writes one knowledge_items row plus
 * one embedding row per chunk. Without FIRECRAWL_API_KEY we bail explicitly
 * so the founder sees a real error instead of a silent no-op.
 */
export const crawlWebsiteTask = task({
  id: "crawl-website",
  run: async (payload: CrawlPayload) => {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      console.error("[crawl-website] FIRECRAWL_API_KEY missing; bailing");
      return { status: "failed" as const, reason: "firecrawl_not_configured", chunks: 0 };
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(payload.url);
    } catch {
      return { status: "failed" as const, reason: "invalid_url", chunks: 0 };
    }

    let data: FirecrawlResponse;
    try {
      const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: parsedUrl.toString(),
          formats: ["markdown"],
        }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) {
        return {
          status: "failed" as const,
          reason: `firecrawl_${res.status}`,
          chunks: 0,
        };
      }
      data = (await res.json()) as FirecrawlResponse;
    } catch (err) {
      const reason = err instanceof Error ? err.message : "firecrawl_fetch_failed";
      console.error("[crawl-website] firecrawl fetch error:", reason);
      throw err;
    }

    if (!data.success || !data.data) {
      return {
        status: "failed" as const,
        reason: data.error ?? "firecrawl_no_content",
        chunks: 0,
      };
    }

    const firecrawlData = data.data;
    const markdown = firecrawlData.markdown.trim();
    if (markdown.length < MIN_TEXT_CHARS) {
      return { status: "failed" as const, reason: "page_too_short", chunks: 0 };
    }

    const title = firecrawlData.metadata.title?.trim() || parsedUrl.hostname + parsedUrl.pathname;

    const chunks = chunkText(markdown);
    if (chunks.length === 0) {
      return { status: "failed" as const, reason: "no_chunks", chunks: 0 };
    }

    // Compute embeddings BEFORE the DB write so a failed embedBatch does
    // not leave an orphan knowledge_items row that a Trigger.dev retry
    // would then duplicate. Without a sourceUrl column on knowledge_items
    // there is no reliable retry-time dedupe key for url_crawl rows; the
    // ordering fix is the no-migration mitigation.
    const embeddings = await embedBatch(chunks);
    if (embeddings.length !== chunks.length) {
      return { status: "failed" as const, reason: "embed_count_mismatch", chunks: 0 };
    }

    // Atomic write: knowledge_items + knowledge_embeddings either both
    // succeed or both roll back. Eliminates the partial-state window
    // between the two inserts.
    const item = await db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(knowledgeItems)
        .values({
          companyId: payload.companyId,
          category: "company_overview",
          title: title.slice(0, 200),
          content: markdown.slice(0, KNOWLEDGE_CONTENT_PREVIEW_CHARS),
          sourceType: "url_crawl",
          aiSummary: firecrawlData.metadata.description?.slice(0, 400) ?? null,
        })
        .returning({ id: knowledgeItems.id });
      if (!inserted) throw new Error("knowledge_insert_returned_empty");

      await tx.insert(knowledgeEmbeddings).values(
        chunks.map((chunk, i) => ({
          companyId: payload.companyId,
          knowledgeItemId: inserted.id,
          chunkIndex: i,
          chunkText: chunk,
          embedding: embeddings[i],
        })),
      );

      return inserted;
    });

    return {
      status: "complete" as const,
      url: payload.url,
      knowledgeItemId: item.id,
      chunks: chunks.length,
    };
  },
});
