import { randomBytes } from "node:crypto";

const SLUG_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const CODE_TAIL_ALPHABET = "abcdefghijkmnopqrstuvwxyz23456789";
const SLUG_LEN = 12;
const CODE_TAIL_LEN = 4;

/**
 * 12-char URL-safe slug for deliverables.share_slug.
 * Uses crypto.randomBytes against a 62-char alphabet so the slug
 * survives base64 quirks (no `-`, no `_`, no padding) without dropping
 * to a smaller character set.
 */
export function generateShareSlug(): string {
  const bytes = randomBytes(SLUG_LEN);
  let out = "";
  for (let i = 0; i < SLUG_LEN; i++) {
    out += SLUG_ALPHABET[bytes[i]! % SLUG_ALPHABET.length];
  }
  return out;
}

/**
 * Readable referral code in the format "{prefix}-{4 chars}", e.g.
 * "alex-7gp4". Tail alphabet excludes look-alikes (0/O, 1/l/i) so
 * the code reads cleanly when typed from a screenshot or email.
 */
export function generateReferralCode(prefix: string): string {
  const cleanPrefix = prefix.toLowerCase().replace(/[^a-z]/g, "").slice(0, 8) || "beast";
  const bytes = randomBytes(CODE_TAIL_LEN);
  let tail = "";
  for (let i = 0; i < CODE_TAIL_LEN; i++) {
    tail += CODE_TAIL_ALPHABET[bytes[i]! % CODE_TAIL_ALPHABET.length];
  }
  return `${cleanPrefix}-${tail}`;
}
