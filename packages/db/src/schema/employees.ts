import { pgTable, uuid, text, jsonb, timestamp, index, vector } from "drizzle-orm/pg-core";
import { companies } from "./companies";

export const aiEmployees = pgTable("ai_employees", {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  name: text().notNull(),
  roleTitle: text("role_title").notNull(),
  roleType: text("role_type").notNull(),
  personality: jsonb().notNull(),
  systemPrompt: text("system_prompt").notNull(),
  memorySummary: text("memory_summary"),
  status: text().default("idle").notNull(),
  currentTaskId: uuid("current_task_id"),
  autonomySettings: jsonb("autonomy_settings").default({}),
  checkInFrequency: text("check_in_frequency").default("daily").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const employeeMemories = pgTable(
  "employee_memories",
  {
    id: uuid().defaultRandom().primaryKey(),
    aiEmployeeId: uuid("ai_employee_id").references(() => aiEmployees.id, { onDelete: "cascade" }).notNull(),
    companyId: uuid("company_id").notNull(),
    memoryType: text("memory_type").notNull(),
    content: text().notNull(),
    sourceTaskId: uuid("source_task_id"),
    embedding: vector("embedding", { dimensions: 1536 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_employee_memories_vector").using("hnsw", table.embedding.op("vector_cosine_ops")),
  ],
);
