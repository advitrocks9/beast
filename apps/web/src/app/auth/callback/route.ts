import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { DEMO_MODE } from "@/lib/demo";
import { db } from "@beast/db";
import { companies } from "@beast/db";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);

  // The read-only demo has no real auth; structurally refuse the callback
  // rather than depending on the seeded session never reaching it.
  if (DEMO_MODE) {
    return NextResponse.redirect(`${origin}/dashboard`);
  }
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Ensure company record exists for this user
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const existing = await db.query.companies.findFirst({
          where: eq(companies.userId, user.id),
        });
        if (!existing) {
          const companyName = (user.user_metadata?.company_name as string) || "My Company";
          // Idempotent: two concurrent oauth callbacks (double-click,
          // redirect retry, etc.) would both see no existing row and
          // both try to insert. The companies.userId unique constraint
          // would throw on the second insert and bounce the user back
          // to /sign-in?error=auth_callback_failed even though the row
          // was created. onConflictDoNothing makes the second call a
          // no-op so both callbacks succeed.
          await db.insert(companies).values({
            userId: user.id,
            name: companyName,
            founderEmail: user.email ?? null,
          }).onConflictDoNothing({ target: companies.userId });
        } else if (!existing.founderEmail && user.email) {
          // Backfill: existing company rows do not have
          // founderEmail. Populate on first sign-in callback after the change.
          await db.update(companies)
            .set({ founderEmail: user.email })
            .where(eq(companies.userId, user.id));
        }
      }

      // New users go to onboarding, returning users to dashboard
      const company = user
        ? await db.query.companies.findFirst({
            where: eq(companies.userId, user.id),
            columns: { onboardingStatus: true },
          })
        : null;

      const dest = company?.onboardingStatus === "complete" ? "/dashboard" : "/onboarding";
      return NextResponse.redirect(`${origin}${dest}`);
    }
  }

  return NextResponse.redirect(`${origin}/sign-in?error=auth_callback_failed`);
}
