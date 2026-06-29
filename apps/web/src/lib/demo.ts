/**
 * Demo mode runs the full product against a seeded company with auth bypassed
 * and every paid/external call disabled. It powers the public showcase deploy
 * and lets anyone clone the repo and click through without a single API key.
 */
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "1";

/** Stable id the seed assigns to the demo company's owner. */
export const DEMO_USER_ID = "11111111-1111-4111-8111-111111111111";

export const DEMO_USER_EMAIL = "founder@northwind.test";
