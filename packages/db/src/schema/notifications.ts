import { pgTable, uuid, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { companies } from "./companies";

/**
 * Per-user dismissal record. The notification list itself is derived
 * (no notifications denormalisation table). A row here means "user U has
 * marked source S as read."
 */
export const notificationReads = pgTable(
  "notification_reads",
  {
    id: uuid().defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: uuid("source_id").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("notification_reads_unique").on(table.userId, table.sourceType, table.sourceId),
    index("notification_reads_user_company_idx").on(table.userId, table.companyId),
  ],
);
