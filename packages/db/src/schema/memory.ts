import { pgTable, uuid, text, jsonb, boolean, integer, real, timestamp, index, vector } from "drizzle-orm/pg-core";
import { aiEmployees } from "./employees";
import { companies } from "./companies";
import { tasks } from "./tasks";

// Episodic memory - immutable event records
export const episodicMemories = pgTable(
  "episodic_memories",
  {
    id: uuid().defaultRandom().primaryKey(),
    agentId: uuid("agent_id").references(() => aiEmployees.id, { onDelete: "cascade" }).notNull(),
    tenantId: uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
    episodeType: text("episode_type").notNull(),
    summary: text().notNull(),
    content: jsonb().notNull(),
    embedding: vector("embedding", { dimensions: 1536 }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    taskId: uuid("task_id").references(() => tasks.id),
    sessionId: uuid("session_id"),
    salienceScore: real("salience_score").default(0.5).notNull(),
    accessCount: integer("access_count").default(0).notNull(),
    lastAccessedAt: timestamp("last_accessed_at", { withTimezone: true }),
    consolidatedInto: uuid("consolidated_into").references(() => proceduralMemories.id),
    isConsolidated: boolean("is_consolidated").default(false).notNull(),
  },
  (table) => [
    index("idx_episodic_memories_vector").using("hnsw", table.embedding.op("vector_cosine_ops")),
    index("idx_episodic_memories_agent_time").on(table.agentId, table.occurredAt),
    index("idx_episodic_memories_tenant_type").on(table.tenantId, table.episodeType, table.isConsolidated),
  ],
);

// Semantic memory - company knowledge facts
export const semanticMemories = pgTable(
  "semantic_memories",
  {
    id: uuid().defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
    scope: text().default("shared").notNull(),
    agentId: uuid("agent_id").references(() => aiEmployees.id),
    fact: text().notNull(),
    context: text(),
    category: text().notNull(),
    embedding: vector("embedding", { dimensions: 1536 }),
    entityName: text("entity_name"),
    entityType: text("entity_type"),
    relatedTo: uuid("related_to").array(),
    validFrom: timestamp("valid_from", { withTimezone: true }).defaultNow().notNull(),
    validUntil: timestamp("valid_until", { withTimezone: true }),
    supersededBy: uuid("superseded_by").references((): any => semanticMemories.id),
    confidence: real().default(1.0).notNull(),
    source: text(),
    sourceRef: text("source_ref"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_semantic_memories_vector").using("hnsw", table.embedding.op("vector_cosine_ops")),
    index("idx_semantic_memories_tenant_category").on(table.tenantId, table.category, table.validUntil),
  ],
);

// Procedural memory - learned rules and patterns (append-only versioned)
export const proceduralMemories = pgTable(
  "procedural_memories",
  {
    id: uuid().defaultRandom().primaryKey(),
    agentId: uuid("agent_id").references(() => aiEmployees.id, { onDelete: "cascade" }).notNull(),
    tenantId: uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
    ruleType: text("rule_type").notNull(),
    taskScope: text("task_scope").array(),
    title: text().notNull(),
    description: text().notNull(),
    examples: jsonb(),
    version: integer().default(1).notNull(),
    parentId: uuid("parent_id").references((): any => proceduralMemories.id),
    isCurrent: boolean("is_current").default(true).notNull(),
    sourceEpisodes: uuid("source_episodes").array(),
    signalCount: integer("signal_count").default(1).notNull(),
    signalWeight: real("signal_weight").default(1.0).notNull(),
    tasksAppliedTo: integer("tasks_applied_to").default(0).notNull(),
    approvalRateDelta: real("approval_rate_delta"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    deprecatedAt: timestamp("deprecated_at", { withTimezone: true }),
    deprecatedReason: text("deprecated_reason"),
    embedding: vector("embedding", { dimensions: 1536 }),
  },
  (table) => [
    index("idx_procedural_memories_agent_current").on(table.agentId, table.isCurrent, table.taskScope),
    index("idx_procedural_memories_vector").using("hnsw", table.embedding.op("vector_cosine_ops")),
  ],
);

// Signal accumulation - pending rule candidates before promotion
export const ruleCandidates = pgTable("rule_candidates", {
  id: uuid().defaultRandom().primaryKey(),
  agentId: uuid("agent_id").references(() => aiEmployees.id, { onDelete: "cascade" }).notNull(),
  tenantId: uuid("tenant_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  ruleType: text("rule_type").notNull(),
  taskScope: text("task_scope").array(),
  title: text().notNull(),
  description: text().notNull(),
  signalCount: integer("signal_count").default(1).notNull(),
  signalWeight: real("signal_weight").default(0).notNull(),
  sourceEpisodes: uuid("source_episodes").array(),
  promotedToId: uuid("promoted_to_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
