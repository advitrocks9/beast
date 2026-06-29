import { pgTable, uuid, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";

// Append-only product analytics events. Funnel + cohort retention queries
// run from this single table.
export const events = pgTable(
  "events",
  {
    id: uuid().defaultRandom().primaryKey(),
    // Always required; events without a tenant cannot be queried safely.
    companyId: uuid("company_id").notNull(),
    // Nullable: system-emitted events (cron, worker) have no user.
    userId: uuid("user_id"),
    // Snake-case canonical event name (e.g. onboarding_started,
    // first_deliverable_approved, onboarding_chip_tapped).
    eventName: text("event_name").notNull(),
    properties: jsonb().$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    companyEventTimeIdx: index("events_company_event_time_idx").on(
      t.companyId,
      t.eventName,
      t.createdAt,
    ),
    eventTimeIdx: index("events_event_time_idx").on(t.eventName, t.createdAt),
  }),
);
