import { pgTable, uuid, text, jsonb, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { aiEmployees } from "./employees";

export const checkIns = pgTable(
  "check_ins",
  {
    id: uuid().defaultRandom().primaryKey(),
    aiEmployeeId: uuid("ai_employee_id").references(() => aiEmployees.id, { onDelete: "cascade" }).notNull(),
    companyId: uuid("company_id").notNull(),
    checkInType: text("check_in_type").notNull(),
    content: jsonb().notNull(),
    taskId: uuid("task_id"),
    acknowledged: boolean().default(false).notNull(),
    response: text(),
    // promoted from content.scheduledFor JSONB key to a dedicated
    // indexed column for cheap dashboard "next check-in" lookups. JSONB key
    // still written by approve/reschedule for backward compatibility.
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("check_ins_company_unack_scheduled_idx")
      .on(table.companyId, table.scheduledFor)
      .where(sql`${table.acknowledged} = false`),
  ],
);
