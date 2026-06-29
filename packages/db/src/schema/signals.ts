import { pgTable, uuid, text, integer, jsonb, timestamp } from "drizzle-orm/pg-core";
import { aiEmployees } from "./employees";

/** Incoming signals from external sources (competitor changes, news, internal gaps). */
export const signals = pgTable("signals", {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid("company_id").notNull(),
  source: text().notNull(), // "competitor_crawl" | "industry_news" | "goal_gap" | "internal"
  title: text().notNull(),
  summary: text().notNull(),
  relevanceScore: integer("relevance_score"), // 0-10, set by Haiku filter
  routedToEmployeeId: uuid("routed_to_employee_id").references(() => aiEmployees.id),
  status: text().default("pending").notNull(), // "pending" | "filtered" | "routed" | "acted" | "dismissed"
  metadata: jsonb().default({}), // source-specific data (URL, diff, etc.)
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
