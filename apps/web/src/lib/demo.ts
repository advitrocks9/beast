/**
 * Demo mode runs the full product against a seeded company with auth bypassed
 * and every paid/external call disabled. It powers the public showcase deploy
 * and lets anyone clone the repo and click through without a single API key.
 */
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "1";

/** Stable id the seed assigns to the demo company's owner. */
export const DEMO_USER_ID = "11111111-1111-4111-8111-111111111111";

export const DEMO_USER_EMAIL = "founder@northwind.test";

export const DEMO_SESSION_COOKIE = "beast_demo_session";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Parse the visitor session cookie from a raw header; client-safe, no next/headers. */
export function demoSessionIdFromHeaders(headers: Headers): string | null {
  const header = headers.get("cookie");
  if (!header) return null;
  for (const pair of header.split(";")) {
    const sep = pair.indexOf("=");
    if (sep === -1) continue;
    if (pair.slice(0, sep).trim() !== DEMO_SESSION_COOKIE) continue;
    const value = pair.slice(sep + 1).trim();
    return UUID_RE.test(value) ? value : null;
  }
  return null;
}
