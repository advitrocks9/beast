import { z } from "zod";
import { eq, and, gte, sql } from "drizzle-orm";
import { companies, tasks } from "@beast/db";
import { getStripe, PRICE_IDS, TIER_LIMITS } from "@/lib/stripe/client";
import { createTRPCRouter, protectedProcedure, assertNotDemo } from "../init";

export const billingRouter = createTRPCRouter({
  /** Get current subscription info for this company. */
  getSubscription: protectedProcedure.query(async ({ ctx }) => {
    const company = await ctx.db.query.companies.findFirst({
      where: eq(companies.id, ctx.companyId),
      columns: {
        billingTier: true,
        billingStatus: true,
        trialEndsAt: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
      },
    });

    if (!company) throw new Error("Company not found");

    const limits = TIER_LIMITS[company.billingTier] ?? TIER_LIMITS.trial!;
    const trialDaysRemaining = company.trialEndsAt
      ? Math.max(0, Math.ceil((company.trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
      : null;

    return {
      tier: company.billingTier,
      status: company.billingStatus,
      trialDaysRemaining,
      limits,
      hasPaymentMethod: !!company.stripeSubscriptionId,
    };
  }),

  /** Create a Stripe Checkout session for subscription. */
  createCheckout: protectedProcedure
    .input(z.object({
      tier: z.enum(["starter", "team", "business"]),
    }))
    .mutation(async ({ ctx, input }) => {
      assertNotDemo("Starting a checkout");
      const stripe = getStripe();
      const company = await ctx.db.query.companies.findFirst({
        where: eq(companies.id, ctx.companyId),
        columns: { stripeCustomerId: true, name: true },
      });

      if (!company) throw new Error("Company not found");

      const priceId = PRICE_IDS[input.tier];
      if (!priceId) throw new Error(`Price not configured for tier: ${input.tier}`);

      // Create or reuse Stripe customer.
      //
      // The idempotency key prevents the orphan-customer race: if the
      // stripe.customers.create call succeeds but the subsequent DB write
      // fails (transient pool issue, lambda cold start hitting timeout,
      // etc.), a retry within Stripe's 24h key window returns the SAME
      // customer instead of creating a duplicate. Without this, the
      // founder retries, gets a fresh stripe customer, the DB writes that
      // one, and the prior orphan customer sits in Stripe forever
      // collecting invoices that never reach the right tenant.
      let customerId = company.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create(
          {
            metadata: { companyId: ctx.companyId },
            name: company.name,
          },
          { idempotencyKey: `customer-${ctx.companyId}` },
        );
        customerId = customer.id;

        await ctx.db.update(companies)
          .set({ stripeCustomerId: customerId, updatedAt: new Date() })
          .where(eq(companies.id, ctx.companyId));
      }

      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${appUrl}/settings?billing=success`,
        cancel_url: `${appUrl}/settings?billing=cancel`,
        subscription_data: {
          metadata: { companyId: ctx.companyId, tier: input.tier },
        },
      });

      return { checkoutUrl: session.url };
    }),

  /** Create a Stripe Customer Portal session for managing subscription. */
  createPortal: protectedProcedure.mutation(async ({ ctx }) => {
    assertNotDemo("Opening the billing portal");
    const stripe = getStripe();
    const company = await ctx.db.query.companies.findFirst({
      where: eq(companies.id, ctx.companyId),
      columns: { stripeCustomerId: true },
    });

    if (!company?.stripeCustomerId) {
      throw new Error("No billing account. Subscribe to a plan first.");
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    const session = await stripe.billingPortal.sessions.create({
      customer: company.stripeCustomerId,
      return_url: `${appUrl}/settings`,
    });

    return { portalUrl: session.url };
  }),

  /** Get task usage for the current billing period. */
  getUsage: protectedProcedure.query(async ({ ctx }) => {
    const company = await ctx.db.query.companies.findFirst({
      where: eq(companies.id, ctx.companyId),
      columns: { billingTier: true },
    });

    const tier = company?.billingTier ?? "trial";
    const limits = TIER_LIMITS[tier] ?? TIER_LIMITS.trial!;

    // Count tasks created this calendar month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [result] = await ctx.db
      .select({ count: sql<number>`count(*)::int` })
      .from(tasks)
      .where(and(
        eq(tasks.companyId, ctx.companyId),
        gte(tasks.createdAt, startOfMonth),
      ));

    return {
      tasksThisMonth: result?.count ?? 0,
      limit: limits.tasksPerMonth,
      tier,
    };
  }),
});
