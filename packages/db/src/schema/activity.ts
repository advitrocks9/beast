import { pgTable, uuid, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { demoSessions } from "./demo";

export const activityLog = pgTable(
  "activity_log",
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid("company_id").notNull(),
    aiEmployeeId: uuid("ai_employee_id"),
    actionType: text("action_type").notNull(),
    actionDetail: jsonb("action_detail").notNull(),
    reasoning: text(),
    demoSessionId: uuid("demo_session_id").references(() => demoSessions.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("activity_log_demo_session_idx").on(table.demoSessionId)],
);
