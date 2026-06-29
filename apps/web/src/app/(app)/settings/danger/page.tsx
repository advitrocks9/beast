"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import { GlassCard } from "@beast/ui";
import { createClient } from "@/lib/supabase/client";

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
        <GlassCard
          hoverable={false}
          className="p-5"
          style={{
            borderColor: "#B45309",
            backgroundColor: "color-mix(in oklab, #FBBF24 8%, white)",
          }}
        >
          <h2 className="text-base font-semibold mb-1" style={{ color: "#B45309" }}>
            Database migrations are not tracked
          </h2>
          <p className="text-xs text-text-secondary mb-3">
            Tables exist but{" "}
            <code className="rounded bg-gray-100 px-1 py-0.5 text-[10px]">
              drizzle.__drizzle_migrations
            </code>{" "}
            is empty, so the schema was applied without recording migrations.
            Drizzle cannot track further schema changes until the journal is
            reconciled.
          </p>
          <ol className="list-decimal pl-5 space-y-1 text-xs text-text-secondary mb-3">
            <li>
              Backfill the migration journal to match the live schema, one row
              per tag in{" "}
              <code className="rounded bg-gray-100 px-1 py-0.5 text-[10px]">
                packages/db/drizzle/meta/_journal.json
              </code>
              .
            </li>
            <li>
              Or, on a disposable database, reset and re-run{" "}
              <code className="rounded bg-gray-100 px-1 py-0.5 text-[10px]">
                pnpm --filter @beast/db db:migrate
              </code>
              .
            </li>
          </ol>
          <p className="text-[11px] text-text-muted">
            This banner clears automatically once{" "}
            <code className="rounded bg-gray-100 px-1 py-0.5 text-[10px]">
              drizzle.__drizzle_migrations
            </code>{" "}
            has rows.
          </p>
        </GlassCard>
      )}

      {dbHealth.data?.status === "unknown" && (
        <GlassCard hoverable={false} className="p-5 border-gray-200">
          <h2 className="text-base font-semibold mb-1">Database health unknown</h2>
          <p className="text-xs text-text-secondary">
            {dbHealth.data.message}
          </p>
        </GlassCard>
      )}

      <GlassCard hoverable={false} className="p-5 border-error">
        <h2 className="text-base font-semibold text-error mb-1">Reset onboarding</h2>
        <p className="text-xs text-text-secondary mb-3">
          Re-runs the conversational interview. Your knowledge base, employees, and tasks
          stay intact; only the onboarding flow restarts so you can re-answer the company
          questions.
        </p>
        <button
          onClick={() => resetOnboarding.mutate({ status: "started" })}
          disabled={resetOnboarding.isPending}
          className="rounded-xl border border-error bg-white px-4 py-2 text-sm font-medium text-error hover:bg-[oklch(0.97_0.05_25)] disabled:opacity-50"
        >
          {resetOnboarding.isPending ? "Resetting..." : "Reset onboarding"}
        </button>
        {resetOnboarding.error && (
          <p className="mt-2 text-xs text-error">
            {resetOnboarding.error.message}
          </p>
        )}
      </GlassCard>

      <GlassCard hoverable={false} className="p-5">
        <h2 className="text-base font-semibold mb-1">Re-register orchestrator schedules</h2>
        <p className="text-xs text-text-secondary mb-3">
          Fires the schedules.create calls that finish onboarding wires up
          (orchestrator tick every 5 min plus nightly maintenance at 11pm
          local time). Idempotent via deduplicationKey, so this is safe to
          click even when the schedules already exist. Use this if your
          dashboard is missing nightly-maintenance results or orchestrator
          activity stalled.
        </p>
        <button
          onClick={() => registerSchedules.mutate()}
          disabled={registerSchedules.isPending}
          className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-foreground hover:bg-gray-50 disabled:opacity-50"
        >
          {registerSchedules.isPending ? "Registering..." : "Register schedules"}
        </button>
        {registerSchedules.isSuccess && registerSchedules.data && (
          <p className="mt-2 text-xs text-text-secondary">
            Registered for timezone {registerSchedules.data.timezone}. Tick id{" "}
            <code className="rounded bg-gray-100 px-1 py-0.5 text-[10px]">
              {registerSchedules.data.tickScheduleId}
            </code>
            , nightly id{" "}
            <code className="rounded bg-gray-100 px-1 py-0.5 text-[10px]">
              {registerSchedules.data.nightlyScheduleId}
            </code>
            .
          </p>
        )}
        {registerSchedules.error && (
          <p className="mt-2 text-xs text-error">{registerSchedules.error.message}</p>
        )}
      </GlassCard>

      <GlassCard hoverable={false} className="p-5 border-error">
        <h2 className="text-base font-semibold text-error mb-1">Sign out everywhere</h2>
        <p className="text-xs text-text-secondary mb-3">
          Revokes every active session for your account, including other browsers
          and devices. You will need to sign in again.
        </p>
        <button
          onClick={handleSignOutEverywhere}
          className="rounded-xl border border-error bg-white px-4 py-2 text-sm font-medium text-error hover:bg-[oklch(0.97_0.05_25)]"
        >
          Sign out everywhere
        </button>
      </GlassCard>
    </div>
  );
}
