import { pgTable, uuid, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { tasks } from "./tasks";

/**
 * Persisted slice of the AG-UI event stream emitted during agent runs.
 * High-frequency events (text_delta) are NOT persisted; this table is
 * the lifecycle + tool-call feed used by the chat panel and per-task
 * surface to render "what's happening" without subscribing to a real-
 * time stream.
 */
export const agentRunEvents = pgTable(
  "agent_run_events",
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }).notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("agent_run_events_task_time_idx").on(table.taskId, table.createdAt),
  ],
);
