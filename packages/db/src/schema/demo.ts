import { pgTable, uuid, text, integer, bigint, date, timestamp, index } from "drizzle-orm/pg-core";

export const demoSessions = pgTable(
  "demo_sessions",
  {
    id: uuid().defaultRandom().primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
    ipHash: text("ip_hash").notNull(),
    runsUsed: integer("runs_used").default(0).notNull(),
  },
  (table) => [index("demo_sessions_ip_hash_created_idx").on(table.ipHash, table.createdAt)],
);

export const demoBudget = pgTable("demo_budget", {
  day: date().primaryKey(),
  tokensUsed: bigint("tokens_used", { mode: "number" }).default(0).notNull(),
  runs: integer().default(0).notNull(),
});
