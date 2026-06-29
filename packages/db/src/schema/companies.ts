import { pgTable, uuid, text, integer, jsonb, timestamp } from "drizzle-orm/pg-core";

export const companies = pgTable("companies", {
  id: uuid().defaultRandom().primaryKey(),
  userId: uuid("user_id").unique().notNull(),
  name: text().notNull(),
  websiteUrl: text("website_url"),
  industry: text(),
  companySize: text("company_size"),
  contextScore: integer("context_score").default(0),
  onboardingStatus: text("onboarding_status").default("started").notNull(),
  timezone: text().default("UTC").notNull(),
  goals: jsonb().default([]),
  // Knowledge categories the founder explicitly skipped during onboarding.
  // Backs the suggestion-chip "Skip" affordance; the assistant does not
  // re-ask about a category in the same session once it lands here.
  skippedCategories: jsonb("skipped_categories").$type<string[]>().default([]).notNull(),
  founderEmail: text("founder_email"),
  // Billing (Stripe)
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  billingTier: text("billing_tier").default("trial").notNull(), // trial | starter | team | business
  billingStatus: text("billing_status").default("trialing").notNull(), // trialing | active | past_due | canceled
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  // tracks the one-shot empty-state weekly email.
  // Set when an empty-state digest is sent; subsequent weeks with empty state
  // skip silently rather than re-sending.
  weeklyEmptyStateSentAt: timestamp("weekly_empty_state_sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
