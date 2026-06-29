/**
 * In-memory soft rate limiter. Per-instance / per-cold-start on Vercel
 * serverless, which is intentional for v0: each function instance keeps
 * its own counters, so a determined attacker can scale-out around the
 * limit by hitting different cold-start instances. That's acceptable
 * before private-beta exit since the only attack surface on the
 * auto-confirm route is "flip email_confirmed_at on a just-signed-up
 * row that hasn't been confirmed yet" - low severity.
 *
 * Pre-launch graduation path: swap the body of `check` for a Vercel KV
 * or Upstash Redis fixed-window or sliding-window primitive. Call sites
 * keep the same shape.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

const SWEEP_EVERY = 256;
let writes = 0;

function maybeSweep(now: number): void {
  writes++;
  if (writes < SWEEP_EVERY) return;
  writes = 0;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitResult {
  ok: boolean;
  retryAfterSec: number;
}

/**
 * Increment a fixed-window counter for `key`. Allows up to `limit`
 * requests per `windowMs`. Returns ok + a retryAfter hint on failure.
 */
export function check(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  maybeSweep(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }

  if (existing.count >= limit) {
    return { ok: false, retryAfterSec: Math.ceil((existing.resetAt - now) / 1000) };
  }

  existing.count++;
  return { ok: true, retryAfterSec: 0 };
}

/**
 * Best-effort caller IP from a Next.js Request. On Vercel the trustworthy
 * value is the platform-injected hop (x-vercel-forwarded-for / x-real-ip),
 * NOT the leftmost x-forwarded-for entry, which the client controls and can
 * rotate to mint a fresh rate-limit bucket per request. Prefer the injected
 * headers; only fall back to the rightmost x-forwarded-for hop (closest to
 * the platform), and never the spoofable leftmost one.
 */
export function clientIpFrom(request: Request): string {
  const vercel = request.headers.get("x-vercel-forwarded-for");
  if (vercel) return vercel.split(",")[0]!.trim();
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const hops = xff.split(",").map((h) => h.trim()).filter(Boolean);
    if (hops.length > 0) return hops[hops.length - 1]!;
  }
  return "unknown";
}
