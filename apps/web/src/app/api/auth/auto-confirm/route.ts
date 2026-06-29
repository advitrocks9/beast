import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEMO_MODE } from "@/lib/demo";
import { check as rateLimitCheck, clientIpFrom } from "@/lib/rate-limit";

const IP_LIMIT = 10;
const IP_WINDOW_MS = 5 * 60 * 1000;
const EMAIL_LIMIT = 5;
const EMAIL_WINDOW_MS = 10 * 60 * 1000;

/**
 * Confirm a just-signed-up user so v0 founders go straight from sign-up to
 * onboarding without the email round trip.
 *
 * Security model: the caller must prove control of the account by sending the
 * password they just set. We verify it with an anon sign-in BEFORE any
 * service-role action, so this endpoint can only ever confirm an email whose
 * password the caller already knows. That removes the previous behaviour where
 * an unauthenticated body of just `{ email }` could flip email_confirmed_at on
 * any pending signup (user enumeration + confirm-someone-elses-email). Every
 * response is a uniform 200 so the endpoint leaks nothing about which emails
 * exist. Disabled entirely in the read-only demo.
 */
export async function POST(request: Request) {
  // The demo has no real sign-up flow and no service-role key; the route is
  // pure liability there, so refuse structurally rather than relying on env.
  if (DEMO_MODE) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

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
  const password =
    typeof body === "object" && body && "password" in body
      ? (body as { password: unknown }).password
      : null;

  if (typeof email !== "string" || !email.includes("@") || typeof password !== "string" || !password) {
    return NextResponse.json({ error: "missing_credentials" }, { status: 400 });
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

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json({ error: "not_configured" }, { status: 500 });
  }

  // Verify the caller knows the password for this email using the anon client.
  const anon = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: signIn, error: signInError } = await anon.auth.signInWithPassword({
    email: normalizedEmail,
    password,
  });

  // Already confirmed (sign-in succeeded): nothing to do.
  if (signIn?.session) {
    return NextResponse.json({ ok: true });
  }

  // Only the "email not confirmed" failure means the password was correct but
  // the account is pending. Any other error (wrong password, no such user) is
  // answered with the same uniform 200 and no action, so existence never leaks.
  const pendingConfirmation =
    signInError?.code === "email_not_confirmed" ||
    /email not confirmed/i.test(signInError?.message ?? "");
  if (!pendingConfirmation) {
    return NextResponse.json({ ok: true });
  }

  const admin = createAdminClient();
  const { data, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) {
    return NextResponse.json({ ok: true });
  }
  const target = data.users.find((u) => u.email?.toLowerCase() === normalizedEmail);
  if (target && !target.email_confirmed_at) {
    await admin.auth.admin.updateUserById(target.id, { email_confirm: true });
  }
  return NextResponse.json({ ok: true });
}
