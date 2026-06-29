import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
    _stripe = new Stripe(key);
  }
  return _stripe;
}

/** Price IDs - set these in Stripe Dashboard and configure here. */
export const PRICE_IDS: Record<string, string> = {
  starter: process.env.STRIPE_PRICE_STARTER ?? "",
  team: process.env.STRIPE_PRICE_TEAM ?? "",
  business: process.env.STRIPE_PRICE_BUSINESS ?? "",
};

/** Tier metadata. */
export const TIER_LIMITS: Record<string, { tasksPerMonth: number; employees: number; storageMb: number }> = {
  trial: { tasksPerMonth: 200, employees: 3, storageMb: 2048 }, // Same as Team tier during trial
  starter: { tasksPerMonth: 50, employees: 1, storageMb: 512 },
  team: { tasksPerMonth: 200, employees: 3, storageMb: 2048 },
  business: { tasksPerMonth: 500, employees: 6, storageMb: 5120 },
};
