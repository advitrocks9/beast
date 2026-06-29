import { pgTable, uuid, text, jsonb, timestamp } from "drizzle-orm/pg-core";

export const activityLog = pgTable("activity_log", {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid("company_id").notNull(),
  aiEmployeeId: uuid("ai_employee_id"),
  actionType: text("action_type").notNull(),
  actionDetail: jsonb("action_detail").notNull(),
  reasoning: text(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
