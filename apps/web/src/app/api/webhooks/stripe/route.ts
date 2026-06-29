import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { db, companies } from "@beast/db";
import { eq } from "drizzle-orm";
import { getStripe } from "@/lib/stripe/client";
import { DEMO_MODE } from "@/lib/demo";

/**
 * Stripe webhook handler.
 * Processes subscription lifecycle events to keep billing state in sync.
 */
export async function POST(request: NextRequest) {
  // No billing in the read-only demo; refuse before touching Stripe or the DB.
  if (DEMO_MODE) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const stripe = getStripe();
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[Stripe Webhook] STRIPE_WEBHOOK_SECRET not configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Stripe Webhook] Signature verification failed:", message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case "invoice.payment_failed":
        await handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      default:
        break;
    }
  } catch (err) {
    console.error(`[Stripe Webhook] Error handling ${event.type}:`, err);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  if (session.mode !== "subscription" || !session.subscription) return;

  const companyId = session.metadata?.companyId;
  const tier = session.metadata?.tier;
  if (!companyId || !tier) {
    console.error("[Stripe Webhook] Checkout missing metadata");
    return;
  }

  await db.update(companies).set({
    stripeSubscriptionId: session.subscription as string,
    billingTier: tier,
    billingStatus: "active",
    trialEndsAt: null,
    updatedAt: new Date(),
  }).where(eq(companies.id, companyId));
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const companyId = subscription.metadata?.companyId;
  if (!companyId) return;

  const statusMap: Record<string, string> = {
    active: "active",
    past_due: "past_due",
    trialing: "trialing",
    canceled: "canceled",
    unpaid: "past_due",
  };

  await db.update(companies).set({
    billingStatus: statusMap[subscription.status] ?? subscription.status,
    updatedAt: new Date(),
  }).where(eq(companies.id, companyId));
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const companyId = subscription.metadata?.companyId;
  if (!companyId) return;

  await db.update(companies).set({
    billingStatus: "canceled",
    stripeSubscriptionId: null,
    updatedAt: new Date(),
  }).where(eq(companies.id, companyId));
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  // Extract subscription ID from parent - Stripe v22 uses `parent.subscription_details`
  const subId = (invoice as unknown as Record<string, unknown>).subscription as string
    ?? (invoice.parent as Record<string, unknown> | null)?.subscription as string
    ?? null;

  if (!subId) return;

  // Find company by subscription ID
  const company = await db.query.companies.findFirst({
    where: eq(companies.stripeSubscriptionId, subId),
    columns: { id: true },
  });

  if (!company) return;

  await db.update(companies).set({
    billingStatus: "past_due",
    updatedAt: new Date(),
  }).where(eq(companies.id, company.id));
}
