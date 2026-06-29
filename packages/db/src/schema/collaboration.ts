import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { aiEmployees } from "./employees";
import { deliverables, tasks } from "./tasks";

export const collaborationProposals = pgTable("collaboration_proposals", {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid("company_id").notNull(),
  fromEmployeeId: uuid("from_employee_id").references(() => aiEmployees.id).notNull(),
  toEmployeeId: uuid("to_employee_id").references(() => aiEmployees.id).notNull(),
  sourceDeliverableId: uuid("source_deliverable_id").references(() => deliverables.id),
  proposal: text().notNull(),
  status: text().default("pending").notNull(),
  resultingTaskId: uuid("resulting_task_id").references(() => tasks.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
