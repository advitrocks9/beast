"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import { createClient } from "@/lib/supabase/client";
import { DEMO_MODE } from "@/lib/demo";

const BTN_FAILED =
  "inline-flex items-center justify-center rounded-[2px] bg-state-failed px-4 py-[9px] text-[13.5px] font-semibold text-white transition-colors duration-150 hover:bg-[#A82115] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink active:translate-y-px disabled:pointer-events-none disabled:opacity-50";

export default function SettingsDangerPage() {
  const router = useRouter();
  const trpc = useTRPC();

  const dbHealth = useQuery(trpc.system.dbHealth.queryOptions());

  const resetOnboarding = useMutation({
    ...trpc.company.updateOnboardingStatus.mutationOptions(),
    onSuccess: () => router.push("/onboarding"),
  });

  const registerSchedules = useMutation(trpc.system.registerSchedules.mutationOptions());

  async function handleSignOutEverywhere() {
    const supabase = createClient();
    await supabase.auth.signOut({ scope: "global" });
    window.location.href = "/sign-in";
  }

  return (
    <div className="space-y-6">
      {dbHealth.data?.status === "drifted" && (
        <div
          role="alert"
          className="border border-state-failed/40 bg-state-failed/5 px-4 py-3.5"
        >
          <h2 className="text-[14px] font-semibold text-state-failed">
            Database migrations are not tracked
          </h2>
          <p className="mt-1 text-[13px] leading-snug text-ink-secondary">
            Tables exist but <span className="spec">drizzle.__drizzle_migrations</span> is empty:
            the schema was applied without recording migrations, so Drizzle cannot track further
            schema changes until the journal is reconciled.
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13px] leading-snug text-ink-secondary">
            <li>
              Backfill the journal to match the live schema, one row per tag in{" "}
              <span className="spec">packages/db/drizzle/meta/_journal.json</span>.
            </li>
            <li>
              Or, on a disposable database, reset and re-run{" "}
              <span className="spec">pnpm --filter @beast/db db:migrate</span>.
            </li>
          </ol>
          <p className="spec-label mt-2">
            Clears automatically once the journal has rows
          </p>
        </div>
      )}

      {dbHealth.data?.status === "unknown" && (
        <div className="border border-hairline bg-panel px-4 py-3">
          <h2 className="text-[14px] font-semibold">Database health unknown</h2>
          <p className="mt-1 text-[13px] text-ink-secondary">{dbHealth.data.message}</p>
        </div>
      )}

      <section aria-label="Re-register orchestrator schedules">
        <div className="rule-t pt-2.5">
          <h2 className="text-[15px] font-semibold">Re-register orchestrator schedules</h2>
        </div>
        <p className="mt-1.5 text-[13px] leading-snug text-ink-secondary">
          Re-fires the schedule registration onboarding runs: orchestrator tick every 5 minutes,
          nightly maintenance at 11pm local. Idempotent, so safe when the schedules already exist.
          Use it when the dashboard stops showing orchestrator activity.
        </p>
        <button
          onClick={() => registerSchedules.mutate()}
          disabled={DEMO_MODE || registerSchedules.isPending}
          className="btn-ghost mt-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:pointer-events-none disabled:opacity-50"
        >
          {registerSchedules.isPending ? "Registering…" : "Register schedules"}
        </button>
        {DEMO_MODE && <p className="spec-label mt-2">Disabled in the read-only demo</p>}
        {registerSchedules.isSuccess && registerSchedules.data && (
          <p className="spec mt-2 text-ink-secondary">
            registered · tz {registerSchedules.data.timezone} · tick{" "}
            {registerSchedules.data.tickScheduleId} · nightly{" "}
            {registerSchedules.data.nightlyScheduleId}
          </p>
        )}
        {registerSchedules.error && (
          <p className="mt-2 text-[13px] text-state-failed">{registerSchedules.error.message}</p>
        )}
      </section>

      <section aria-label="Reset onboarding">
        <div className="rule-t pt-2.5">
          <h2 className="text-[15px] font-semibold">Reset onboarding</h2>
        </div>
        <p className="mt-1.5 text-[13px] leading-snug text-ink-secondary">
          Restarts the founding interview. Knowledge, employees, and jobs stay intact; you re-answer
          the company questions and cannot use the app until the interview is done again.
        </p>
        <button
          onClick={() => resetOnboarding.mutate({ status: "started" })}
          disabled={DEMO_MODE || resetOnboarding.isPending}
          className={`mt-3 ${BTN_FAILED}`}
        >
          {resetOnboarding.isPending ? "Resetting…" : "Reset onboarding"}
        </button>
        {DEMO_MODE && <p className="spec-label mt-2">Disabled in the read-only demo</p>}
        {resetOnboarding.error && (
          <p className="mt-2 text-[13px] text-state-failed">{resetOnboarding.error.message}</p>
        )}
      </section>

      <section aria-label="Sign out everywhere">
        <div className="rule-t pt-2.5">
          <h2 className="text-[15px] font-semibold">Sign out everywhere</h2>
        </div>
        <p className="mt-1.5 text-[13px] leading-snug text-ink-secondary">
          Revokes every active session for your account, on every browser and device. You sign in
          again from scratch.
        </p>
        <button
          onClick={handleSignOutEverywhere}
          disabled={DEMO_MODE}
          className={`mt-3 ${BTN_FAILED}`}
        >
          Sign out everywhere
        </button>
        {DEMO_MODE && <p className="spec-label mt-2">Disabled in the read-only demo</p>}
      </section>
    </div>
  );
}
