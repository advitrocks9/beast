import { pgTable, uuid, text, jsonb, timestamp, customType } from "drizzle-orm/pg-core";
import { companies } from "./companies";

const bytea = customType<{ data: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const connectors = pgTable("connectors", {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  platform: text().notNull(),
  status: text().default("connected").notNull(),
  accessTokenEnc: bytea("access_token_enc").notNull(),
  refreshTokenEnc: bytea("refresh_token_enc"),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
  metadata: jsonb().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
