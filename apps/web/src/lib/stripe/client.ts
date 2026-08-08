import Stripe from "stripe";
import { env, requireEnv } from "@beast/shared/env";
import type { PaidTier } from "@beast/shared";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(requireEnv("STRIPE_SECRET_KEY"));
  }
  return _stripe;
}

export const PRICE_IDS: Record<PaidTier, string | undefined> = {
  starter: env.STRIPE_PRICE_STARTER,
  team: env.STRIPE_PRICE_TEAM,
  business: env.STRIPE_PRICE_BUSINESS,
};

/** Reverse lookup for webhook events, where only the price id is authoritative. */
export function tierForPrice(priceId: string): PaidTier | null {
  const entry = (Object.entries(PRICE_IDS) as [PaidTier, string | undefined][]).find(
    ([, id]) => id === priceId,
  );
  return entry?.[0] ?? null;
}
