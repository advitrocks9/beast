import { pgTable, text, uuid, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { companies } from "./companies";
import { deliverables } from "./tasks";

// Referral codes. One inviter can generate many codes
// (one per share); each code redeems once. Code is the primary key so the
// public /sign-up?ref=<code> route is a direct lookup.
export const referralCodes = pgTable(
  "referral_codes",
  {
    code: text("code").primaryKey(),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
    sourceDeliverableId: uuid("source_deliverable_id").references(() => deliverables.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    redeemedByCompanyId: uuid("redeemed_by_company_id").references(() => companies.id),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
    rewardGrantedAt: timestamp("reward_granted_at", { withTimezone: true }),
  },
  (table) => [
    index("referral_codes_company_idx").on(table.companyId),
    index("referral_codes_redeemed_idx")
      .on(table.redeemedByCompanyId)
      .where(sql`${table.redeemedByCompanyId} IS NOT NULL`),
  ],
);
