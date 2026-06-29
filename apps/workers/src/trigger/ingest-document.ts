import { task } from "@trigger.dev/sdk";
import { eq } from "drizzle-orm";
import { db, uploadedFiles, knowledgeItems, knowledgeEmbeddings } from "@beast/db";
import { chunkText, embedBatch } from "@beast/ai";

interface IngestPayload {
  fileId: string;
  companyId: string;
  downloadUrl: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
}

const TEXT_CONTENT_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "text/x-markdown",
  "application/octet-stream",
]);
const TEXT_FILENAME_RE = /\.(txt|md|markdown)$/i;
const UNSTRUCTURED_CONTENT_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
]);
const UNSTRUCTURED_FILENAME_RE = /\.(pdf|docx|doc)$/i;

const MAX_INLINE_BYTES = 5 * 1024 * 1024;
const KNOWLEDGE_CONTENT_PREVIEW_CHARS = 8000;
const UNSTRUCTURED_ENDPOINT = "https://api.unstructured.io/general/v0/general";

interface UnstructuredElement {
  text?: string;
  type?: string;
  metadata?: { page_number?: number };
}

/**
 * Pulls an uploaded file out of R2, extracts text (utf8 for plain text,
 * Unstructured hosted API for PDF), chunks, embeds via Gemini, and writes
 * one knowledge_items row plus one embedding row per chunk.
 */
export const ingestDocumentTask = task({
  id: "ingest-document",
  run: async (payload: IngestPayload) => {
    const isText =
      TEXT_CONTENT_TYPES.has(payload.contentType) ||
      TEXT_FILENAME_RE.test(payload.filename);
    const needsUnstructured =
      UNSTRUCTURED_CONTENT_TYPES.has(payload.contentType) ||
      UNSTRUCTURED_FILENAME_RE.test(payload.filename);

    if (!isText && !needsUnstructured) {
      await markFailed(payload.fileId, "unsupported_content_type");
      return { status: "failed" as const, reason: "unsupported_content_type", chunks: 0 };
    }
    if (payload.sizeBytes > MAX_INLINE_BYTES) {
      await markFailed(payload.fileId, "file_too_large");
      return { status: "failed" as const, reason: "file_too_large", chunks: 0 };
    }

    // Trigger.dev retry guard. A prior attempt may have completed
    // ingestion; if so, skip the work to avoid duplicate knowledge_items
    // rows and a second paid Gemini embed call. If the prior attempt
    // partially completed (knowledge_items inserted but embedding threw),
    // delete the partial row so this attempt can re-create cleanly.
    // knowledge_embeddings.knowledge_item_id has ON DELETE CASCADE so
    // dangling embeddings clean up automatically.
    const existingFile = await db.query.uploadedFiles.findFirst({
      where: eq(uploadedFiles.id, payload.fileId),
      columns: { processingStatus: true },
    });
    if (existingFile?.processingStatus === "complete") {
      return { status: "complete" as const, fileId: payload.fileId, chunks: 0 };
    }
    await db
      .delete(knowledgeItems)
      .where(eq(knowledgeItems.sourceFileId, payload.fileId));

    let text: string;
    let pageCount: number | null = null;
    try {
      if (needsUnstructured) {
        const result = await extractViaUnstructured(payload);
        if ("error" in result) {
          await markFailed(payload.fileId, result.error);
          return { status: "failed" as const, reason: result.error, chunks: 0 };
        }
        text = result.text;
        pageCount = result.pageCount;
      } else {
        const res = await fetch(payload.downloadUrl, {
          signal: AbortSignal.timeout(30_000),
        });
        if (!res.ok) {
          await markFailed(payload.fileId, `r2_fetch_${res.status}`);
          return { status: "failed" as const, reason: `r2_fetch_${res.status}`, chunks: 0 };
        }
        text = await res.text();
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : "fetch_failed";
      await markFailed(payload.fileId, reason);
      throw err;
    }

    if (text.trim().length === 0) {
      await markFailed(payload.fileId, "empty_file");
      return { status: "failed" as const, reason: "empty_file", chunks: 0 };
    }

    const chunks = chunkText(text);
    if (chunks.length === 0) {
      await markFailed(payload.fileId, "no_chunks");
      return { status: "failed" as const, reason: "no_chunks", chunks: 0 };
    }

    let item: { id: string } | undefined;
    try {
      const inserted = await db
        .insert(knowledgeItems)
        .values({
          companyId: payload.companyId,
          category: "company_overview",
          title: payload.filename,
          content: text.slice(0, KNOWLEDGE_CONTENT_PREVIEW_CHARS),
          sourceType: "document",
          sourceFileId: payload.fileId,
        })
        .returning({ id: knowledgeItems.id });
      item = inserted[0];
    } catch (err) {
      const reason = err instanceof Error ? err.message : "knowledge_insert_failed";
      await markFailed(payload.fileId, reason);
      throw err;
    }
    if (!item) {
      await markFailed(payload.fileId, "knowledge_insert_returned_empty");
      return { status: "failed" as const, reason: "knowledge_insert_returned_empty", chunks: 0 };
    }

    let embeddings: number[][];
    try {
      embeddings = await embedBatch(chunks);
    } catch (err) {
      const reason = err instanceof Error ? err.message : "embed_failed";
      await markFailed(payload.fileId, reason);
      throw err;
    }
    if (embeddings.length !== chunks.length) {
      await markFailed(payload.fileId, "embed_count_mismatch");
      return { status: "failed" as const, reason: "embed_count_mismatch", chunks: 0 };
    }

    await db.insert(knowledgeEmbeddings).values(
      chunks.map((chunk, i) => ({
        companyId: payload.companyId,
        knowledgeItemId: item!.id,
        chunkIndex: i,
        chunkText: chunk,
        embedding: embeddings[i],
      })),
    );

    await db
      .update(uploadedFiles)
      .set({
        processingStatus: "complete",
        ...(pageCount !== null ? { pageCount } : {}),
      })
      .where(eq(uploadedFiles.id, payload.fileId));

    return { status: "complete" as const, fileId: payload.fileId, chunks: chunks.length };
  },
});

async function extractViaUnstructured(
  payload: IngestPayload,
): Promise<{ text: string; pageCount: number | null } | { error: string }> {
  const apiKey = process.env.UNSTRUCTURED_API_KEY;
  if (!apiKey) {
    return { error: "unstructured_not_configured" };
  }

  const downloadRes = await fetch(payload.downloadUrl, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!downloadRes.ok) {
    return { error: `r2_fetch_${downloadRes.status}` };
  }
  const blob = await downloadRes.blob();

  const formData = new FormData();
  formData.append("files", blob, payload.filename);
  formData.append("strategy", "auto");

  const res = await fetch(UNSTRUCTURED_ENDPOINT, {
    method: "POST",
    headers: { "unstructured-api-key": apiKey },
    body: formData,
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    return { error: `unstructured_${res.status}` };
  }

  const elements = (await res.json()) as UnstructuredElement[];
  if (!Array.isArray(elements) || elements.length === 0) {
    return { error: "unstructured_no_elements" };
  }

  const text = elements
    .map((el) => (typeof el.text === "string" ? el.text.trim() : ""))
    .filter((t) => t.length > 0)
    .join("\n\n");

  let pageCount: number | null = null;
  for (const el of elements) {
    const n = el.metadata?.page_number;
    if (typeof n === "number" && (pageCount === null || n > pageCount)) {
      pageCount = n;
    }
  }

  return { text, pageCount };
}

async function markFailed(fileId: string, reason: string): Promise<void> {
  try {
    await db
      .update(uploadedFiles)
      .set({ processingStatus: "failed" })
      .where(eq(uploadedFiles.id, fileId));
    console.error(`[ingest-document] ${fileId} failed: ${reason}`);
  } catch (e) {
    console.error("[ingest-document] markFailed write itself failed:", e);
  }
}
