import { pgTable, uuid, text, integer, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { aiEmployees } from "./employees";

// Lifecycle for trust-promotion suggestions surfaced by
// packages/ai/src/autonomy/evolution.ts. activity_log is append-only
// and not appropriate for "shown / dismissed / accepted" state, so the
// suggestion lifecycle lives here. See SPECS/autonomy-suggestions.md.
export const autonomySuggestions = pgTable(
  "autonomy_suggestions",
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid("company_id").notNull(),
    aiEmployeeId: uuid("ai_employee_id")
      .references(() => aiEmployees.id, { onDelete: "cascade" })
      .notNull(),
    action: text().notNull(),
    consecutiveApprovals: integer("consecutive_approvals").notNull(),
    message: text().notNull(),
    // queued | shown | accepted | snoozed | dismissed
    state: text().default("queued").notNull(),
    shownAt: timestamp("shown_at", { withTimezone: true }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    snoozeUntil: timestamp("snooze_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    companyStateIdx: index("autonomy_suggestions_company_state_idx").on(
      t.companyId,
      t.state,
    ),
    // Partial unique index: prevents a duplicate suggestion for the
    // same employee + action while one is still in flight. Once
    // accepted / dismissed (terminal states), a new suggestion can
    // queue if the streak rebuilds.
    activeUniqueIdx: uniqueIndex("autonomy_suggestions_active_unique")
      .on(t.companyId, t.aiEmployeeId, t.action)
      .where(sql`state IN ('queued','shown','snoozed')`),
  }),
);
