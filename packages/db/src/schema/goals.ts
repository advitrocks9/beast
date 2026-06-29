import { pgTable, uuid, text, integer, date, timestamp } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { aiEmployees } from "./employees";

export const goals = pgTable("goals", {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  parentGoalId: uuid("parent_goal_id").references((): any => goals.id),
  aiEmployeeId: uuid("ai_employee_id").references(() => aiEmployees.id),
  title: text().notNull(),
  description: text(),
  targetMetric: text("target_metric"),
  targetDate: date("target_date"),
  status: text().default("active").notNull(),
  progressPct: integer("progress_pct").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
