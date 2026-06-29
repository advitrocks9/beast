import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { check as rateLimitCheck, clientIpFrom } from "@/lib/rate-limit";

const IP_LIMIT = 10;
const IP_WINDOW_MS = 5 * 60 * 1000;
const EMAIL_LIMIT = 5;
const EMAIL_WINDOW_MS = 10 * 60 * 1000;

/**
 * Auto-confirm a just-signed-up user, bypassing the email-confirmation
 * round trip. Supabase email confirmation may or may not
 * be enabled at the project level; either way, the founder-facing demo
 * needs sign-up -> instant sign-in.
 *
 * Security model: looks up the user by the email in the request body and
 * confirms ONLY if `email_confirmed_at` is null (i.e., they just signed
 * up and haven't been confirmed yet). Already-confirmed users are not
 * re-confirmed. This prevents an attacker from triggering this endpoint
 * on someone else's email to gain anything (the endpoint does not
 * issue sessions; it just toggles email_confirmed_at).
 */
export async function POST(request: Request) {
  // Per-IP rate limit fires before parsing - cheap defense against a
  // bot looping on this endpoint without varying input..
  const ip = clientIpFrom(request);
  const ipCheck = rateLimitCheck(`autoconfirm:ip:${ip}`, IP_LIMIT, IP_WINDOW_MS);
  if (!ipCheck.ok) {
    return NextResponse.json(
      { error: "rate_limited", scope: "ip", retryAfterSec: ipCheck.retryAfterSec },
      { status: 429, headers: { "retry-after": String(ipCheck.retryAfterSec) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const email =
    typeof body === "object" && body && "email" in body
      ? (body as { email: unknown }).email
      : null;

  if (typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json({ error: "missing_email" }, { status: 400 });
  }

  const normalizedEmail = email.toLowerCase();
  const emailCheck = rateLimitCheck(
    `autoconfirm:email:${normalizedEmail}`,
    EMAIL_LIMIT,
    EMAIL_WINDOW_MS,
  );
  if (!emailCheck.ok) {
    return NextResponse.json(
      { error: "rate_limited", scope: "email", retryAfterSec: emailCheck.retryAfterSec },
      { status: 429, headers: { "retry-after": String(emailCheck.retryAfterSec) } },
    );
  }

  const admin = createAdminClient();

  // listUsers takes pagination but no email filter; use generous page size
  // and filter client-side. the user count is small, so this is fine.
  const { data, error: listError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listError) {
    return NextResponse.json(
      { error: "list_failed", detail: listError.message },
      { status: 500 },
    );
  }

  const target = data.users.find(
    (u) => u.email?.toLowerCase() === normalizedEmail,
  );
  if (!target) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  if (target.email_confirmed_at) {
    return NextResponse.json({ ok: true, alreadyConfirmed: true });
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(
    target.id,
    { email_confirm: true },
  );
  if (updateError) {
    return NextResponse.json(
      { error: "update_failed", detail: updateError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, confirmed: true });
}
