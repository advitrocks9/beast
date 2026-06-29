import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { companies } from "./companies";

export const departments = pgTable("departments", {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  name: text().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const functions = pgTable("functions", {
  id: uuid().defaultRandom().primaryKey(),
  departmentId: uuid("department_id").references(() => departments.id, { onDelete: "cascade" }).notNull(),
  companyId: uuid("company_id").notNull(),
  name: text().notNull(),
  mode: text().default("ai").notNull(),
  aiEmployeeId: uuid("ai_employee_id"),
  humanOwnerId: text("human_owner_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
