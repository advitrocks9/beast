import { pgTable, uuid, text, jsonb, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { aiEmployees } from "./employees";
import { goals } from "./goals";

export const tasks = pgTable("tasks", {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid("company_id").notNull(),
  aiEmployeeId: uuid("ai_employee_id").references(() => aiEmployees.id, { onDelete: "cascade" }).notNull(),
  goalId: uuid("goal_id").references(() => goals.id),
  parentTaskId: uuid("parent_task_id").references((): any => tasks.id),
  title: text().notNull(),
  brief: jsonb().notNull(),
  taskType: text("task_type").notNull(),
  origin: text().notNull(),
  status: text().default("pending").notNull(),
  plan: jsonb(),
  planApproved: boolean("plan_approved").default(false).notNull(),
  triggerRunId: text("trigger_run_id"),
  recurrence: jsonb(),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const deliverables = pgTable("deliverables", {
  id: uuid().defaultRandom().primaryKey(),
  taskId: uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }).notNull(),
  companyId: uuid("company_id").notNull(),
  aiEmployeeId: uuid("ai_employee_id").notNull(),
  deliverableType: text("deliverable_type").notNull(),
  title: text().notNull(),
  content: jsonb().notNull(),
  renderedPreview: text("rendered_preview"),
  version: integer().default(1).notNull(),
  status: text().default("draft").notNull(),
  publishedUrl: text("published_url"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  shareSlug: text("share_slug").unique(),
  shareEnabledAt: timestamp("share_enabled_at", { withTimezone: true }),
  shareSnapshot: jsonb("share_snapshot"),
  approvalRationale: text("approval_rationale"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  publishAfter: timestamp("publish_after", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const deliverableVersions = pgTable("deliverable_versions", {
  id: uuid().defaultRandom().primaryKey(),
  deliverableId: uuid("deliverable_id").references(() => deliverables.id, { onDelete: "cascade" }).notNull(),
  version: integer().notNull(),
  content: jsonb().notNull(),
  changeSummary: text("change_summary"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
