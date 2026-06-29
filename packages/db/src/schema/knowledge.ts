import { pgTable, uuid, text, boolean, timestamp, integer, bigint, index, vector } from "drizzle-orm/pg-core";
import { companies } from "./companies";

export const knowledgeItems = pgTable("knowledge_items", {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  category: text().notNull(),
  title: text().notNull(),
  content: text().notNull(),
  sourceType: text("source_type").notNull(),
  sourceFileId: uuid("source_file_id"),
  aiSummary: text("ai_summary"),
  verified: boolean().default(false).notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const knowledgeEmbeddings = pgTable(
  "knowledge_embeddings",
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid("company_id").notNull(),
    knowledgeItemId: uuid("knowledge_item_id").references(() => knowledgeItems.id, { onDelete: "cascade" }).notNull(),
    chunkIndex: integer("chunk_index").notNull(),
    chunkText: text("chunk_text").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_knowledge_embeddings_vector").using("hnsw", table.embedding.op("vector_cosine_ops")),
  ],
);

export const uploadedFiles = pgTable("uploaded_files", {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  filename: text().notNull(),
  contentType: text("content_type").notNull(),
  r2Key: text("r2_key").notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
  processingStatus: text("processing_status").default("pending").notNull(),
  pageCount: integer("page_count"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
