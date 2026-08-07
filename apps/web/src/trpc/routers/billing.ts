import { z } from "zod";
import { eq } from "drizzle-orm";
import { companies } from "@beast/db";
import { env } from "@beast/shared/env";
import { PAID_TIERS, TIER_LIMITS } from "@beast/shared";
import { getStripe, PRICE_IDS } from "@/lib/stripe/client";
import { readTier, tasksCreatedThisMonth, employeeCount } from "@/lib/entitlements";
import { createTRPCRouter, protectedProcedure, assertNotDemo } from "../init";

export const billingRouter = createTRPCRouter({
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

    const tier = readTier(company);
    const trialDaysRemaining = company.trialEndsAt
      ? Math.max(0, Math.ceil((company.trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
      : null;

    return {
      tier,
      status: company.billingStatus,
      trialDaysRemaining,
      limits: TIER_LIMITS[tier],
      hasSubscription: !!company.stripeSubscriptionId,
    };
  }),

  /** Usage against the two enforced limits: monthly task creations, employee count. */
  getUsage: protectedProcedure.query(async ({ ctx }) => {
    const company = await ctx.db.query.companies.findFirst({
      where: eq(companies.id, ctx.companyId),
      columns: { billingTier: true },
    });

    if (!company) throw new Error("Company not found");

    const tier = readTier(company);
    const limits = TIER_LIMITS[tier];
    const [tasksUsed, employeesUsed] = await Promise.all([
      tasksCreatedThisMonth(ctx.db, ctx.companyId),
      employeeCount(ctx.db, ctx.companyId),
    ]);

    return {
      tier,
      tasks: { used: tasksUsed, limit: limits.tasksPerMonth },
      employees: { used: employeesUsed, limit: limits.employees },
    };
  }),

  createCheckout: protectedProcedure
    .input(z.object({ tier: z.enum(PAID_TIERS) }))
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

      const appUrl = env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

      // Metadata rides both objects: the session copy feeds
      // checkout.session.completed, the subscription copy feeds every later
      // subscription.* event.
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${appUrl}/settings/billing?billing=success`,
        cancel_url: `${appUrl}/settings/billing?billing=cancel`,
        metadata: { companyId: ctx.companyId, tier: input.tier },
        subscription_data: {
          metadata: { companyId: ctx.companyId, tier: input.tier },
        },
      });

      return { checkoutUrl: session.url };
    }),

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

    const appUrl = env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    const session = await stripe.billingPortal.sessions.create({
      customer: company.stripeCustomerId,
      return_url: `${appUrl}/settings/billing`,
    });

    return { portalUrl: session.url };
  }),
});
