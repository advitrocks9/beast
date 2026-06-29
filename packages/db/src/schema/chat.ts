import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { aiEmployees } from "./employees";
import { tasks } from "./tasks";

/**
 * Persistent founder<->AI employee chat history. Each row is a single
 * message turn. The ChatPanel reads recent rows on open so threads
 * survive navigation and new sessions.
 */
export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
    aiEmployeeId: uuid("ai_employee_id").references(() => aiEmployees.id, { onDelete: "cascade" }).notNull(),
    role: text().notNull(),
    content: text().notNull(),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("chat_messages_company_employee_time_idx").on(
      table.companyId,
      table.aiEmployeeId,
      table.createdAt,
    ),
  ],
);
