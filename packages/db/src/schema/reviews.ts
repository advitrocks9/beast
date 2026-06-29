import { pgTable, uuid, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { deliverables } from "./tasks";

export const commentThreads = pgTable("comment_threads", {
  id: uuid().defaultRandom().primaryKey(),
  deliverableId: uuid("deliverable_id").references(() => deliverables.id, { onDelete: "cascade" }).notNull(),
  companyId: uuid("company_id").notNull(),
  anchorFrom: integer("anchor_from").notNull(),
  anchorTo: integer("anchor_to").notNull(),
  resolved: boolean().default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const comments = pgTable("comments", {
  id: uuid().defaultRandom().primaryKey(),
  threadId: uuid("thread_id").references(() => commentThreads.id, { onDelete: "cascade" }).notNull(),
  authorType: text("author_type").notNull(),
  authorId: text("author_id").notNull(),
  content: text().notNull(),
  commentType: text("comment_type").default("text").notNull(),
  chipValue: text("chip_value"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
