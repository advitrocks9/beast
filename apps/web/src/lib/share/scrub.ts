/**
 * Conservative PII scrubber for the public /share/[slug] route.:
 * "v0 scrubber is conservative and false-positive-prone" - we'd rather hide a
 * brand name that looks like an email than serve a real one. The redaction marker
 * is a single token so the rendered prose stays readable.
 */
const REDACTED = "[redacted]";

const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

// E.164-ish + common US/UK forms. Conservative: 7-15 digit runs that look like
// phone numbers. Catches false-positives on long ID strings, which is fine
// for v0.
const PHONE_RE = /\b(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{2,4}\)?[-.\s]?){2,4}\d{2,4}\b/g;

/**
 * Scrub a single string. Order matters: emails first so the @ doesn't get
 * eaten by the phone regex's permissive whitespace handling.
 */
export function scrubText(input: string): string {
  if (!input) return input;
  return input.replace(EMAIL_RE, REDACTED).replace(PHONE_RE, REDACTED);
}

// Keys that carry internal/tenant identifiers or credentials and must never be
// exposed on a public share, regardless of their string value.
const INTERNAL_KEY = /(^|_)(id|ids)$|company|tenant|user|owner|email|secret|token|enc$|password|internal/i;

/**
 * Recursively scrub a JSONB-ish value. Leaves numbers, booleans, null untouched;
 * walks arrays + plain objects; replaces strings via scrubText and drops keys
 * that name internal identifiers/credentials. Objects keep their remaining key
 * shape so the downstream JSON renderer doesn't break.
 */
export function scrubPII<T>(value: T): T {
  if (typeof value === "string") {
    return scrubText(value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => scrubPII(v)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (INTERNAL_KEY.test(k)) continue;
      out[k] = scrubPII(v);
    }
    return out as T;
  }
  return value;
}
