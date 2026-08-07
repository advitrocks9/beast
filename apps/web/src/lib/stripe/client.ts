import Stripe from "stripe";
import { env, requireEnv } from "@beast/shared/env";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(requireEnv("STRIPE_SECRET_KEY"));
  }
  return _stripe;
}

/** Price IDs - set these in Stripe Dashboard and configure here. */
export const PRICE_IDS: Record<string, string | undefined> = {
  starter: env.STRIPE_PRICE_STARTER,
  team: env.STRIPE_PRICE_TEAM,
  business: env.STRIPE_PRICE_BUSINESS,
};

/** Tier metadata. */
export const TIER_LIMITS: Record<string, { tasksPerMonth: number; employees: number; storageMb: number }> = {
  trial: { tasksPerMonth: 200, employees: 3, storageMb: 2048 }, // Same as Team tier during trial
  starter: { tasksPerMonth: 50, employees: 1, storageMb: 512 },
  team: { tasksPerMonth: 200, employees: 3, storageMb: 2048 },
  business: { tasksPerMonth: 500, employees: 6, storageMb: 5120 },
};
