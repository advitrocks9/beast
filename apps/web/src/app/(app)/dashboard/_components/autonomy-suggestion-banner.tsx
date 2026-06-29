"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GlassCard } from "@beast/ui";
import { useTRPC } from "@/trpc/client";

const ROLE_HEX: Record<string, string> = {
  marketing: "#E87B35",
  sales: "#3B82F6",
  support: "#22C55E",
};

function formatAction(action: string): string {
  switch (action) {
    case "publishSocial":
      return "publish social posts to LinkedIn directly";
    case "sendEmail":
      return "send emails directly";
    case "reachOut":
      return "reach out to prospects directly";
    default:
      return action.replace(/([A-Z])/g, " $1").toLowerCase();
  }
}

function formatSafetyNet(action: string): string | null {
  switch (action) {
    case "publishSocial":
    case "sendEmail":
    case "reachOut":
      return "We hold the post for 60 seconds before sending so you can cancel from the dashboard.";
    default:
      return null;
  }
}

interface LastApprovedRow {
  id: string;
  title: string;
  deliverableType: string;
  version: number;
  createdAt: Date;
}

export function AutonomySuggestionBanner() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const list = useQuery(trpc.autonomy.list.queryOptions());

  const accept = useMutation(trpc.autonomy.accept.mutationOptions());
  const snooze = useMutation(trpc.autonomy.snooze.mutationOptions());
  const dismiss = useMutation(trpc.autonomy.dismiss.mutationOptions());
  const markShown = useMutation(trpc.autonomy.markShown.mutationOptions());

  const items = list.data ?? [];
  const total = items.length;
  const [activeIdx, setActiveIdx] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = total > 0 ? items[Math.min(activeIdx, total - 1)] : null;

  useEffect(() => {
    if (active && active.state === "queued") {
      void markShown.mutateAsync({ suggestionId: active.id });
    }
    // We only want to fire once per active id; deliberate dep choice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id]);

  const lastApproved = useQuery({
    ...trpc.autonomy.lastApproved.queryOptions({
      aiEmployeeId: active?.aiEmployeeId ?? "",
      limit: 8,
    }),
    enabled: panelOpen && !!active?.aiEmployeeId,
  });

  if (list.isLoading || !active) return null;

  const hex = ROLE_HEX[active.employeeRoleType] ?? "#9CA3AF";
  const safety = formatSafetyNet(active.action);
  const counter = total > 1 ? `${activeIdx + 1} of ${total}` : null;
  const pending = accept.isPending || snooze.isPending || dismiss.isPending;

  async function invalidate() {
    await queryClient.invalidateQueries(trpc.autonomy.list.queryFilter());
  }

  function nextOrClear() {
    if (activeIdx < total - 1) {
      setActiveIdx((i) => i);
    } else {
      setActiveIdx(0);
    }
    setPanelOpen(false);
  }

  async function handleAccept() {
    if (!active) return;
    setError(null);
    try {
      await accept.mutateAsync({ suggestionId: active.id });
      await invalidate();
      nextOrClear();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not promote");
    }
  }

  async function handleSnooze() {
    if (!active) return;
    setError(null);
    try {
      await snooze.mutateAsync({ suggestionId: active.id, days: 14 });
      await invalidate();
      nextOrClear();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not snooze");
    }
  }

  async function handleDismiss() {
    if (!active) return;
    setError(null);
    try {
      await dismiss.mutateAsync({ suggestionId: active.id });
      await invalidate();
      nextOrClear();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not dismiss");
    }
  }

  const sentence =
    `You have approved ${active.employeeName}'s work ${active.consecutiveApprovals} times in a row, no edits. ` +
    `Let ${active.employeeName} ${formatAction(active.action)}?`;

  return (
    <section aria-label="Trust promotion suggestion">
      <GlassCard hoverable={false} className="p-5">
        <div className="flex items-start gap-3">
          <span
            className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: hex }}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: hex }}>
                {active.employeeName} earned trust
              </p>
              <div className="flex items-center gap-3">
                {counter && (
                  <span className="text-xs text-text-muted">{counter}</span>
                )}
                <button
                  type="button"
                  onClick={handleDismiss}
                  aria-label="Dismiss suggestion"
                  disabled={pending}
                  className="text-xs text-text-muted hover:text-foreground disabled:opacity-50"
                >
                  Hide
                </button>
              </div>
            </div>
            <p
              className="mt-2 text-sm text-foreground"
              id={`autonomy-${active.id}-sentence`}
            >
              {sentence}
            </p>
            {safety && (
              <p
                className="mt-2 text-xs text-text-secondary"
                id={`autonomy-${active.id}-safety`}
              >
                {safety}
              </p>
            )}

            {error && (
              <p className="mt-2 text-xs text-[oklch(0.55_0.18_30)]">{error}</p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setPanelOpen((v) => !v)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-foreground hover:bg-gray-50"
              >
                {panelOpen ? "Hide last 8" : "See last 8"}
              </button>
              <button
                type="button"
                onClick={handleSnooze}
                disabled={pending}
                aria-describedby={`autonomy-${active.id}-sentence`}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-foreground hover:bg-gray-50 disabled:opacity-50"
              >
                Snooze 14 days
              </button>
              <button
                type="button"
                onClick={handleAccept}
                disabled={pending}
                aria-describedby={`autonomy-${active.id}-safety`}
                className="rounded-lg bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
              >
                Let {active.employeeName} {active.action === "publishSocial" ? "publish" : active.action === "sendEmail" ? "send" : "reach out"}
              </button>
              {total > 1 && (
                <button
                  type="button"
                  onClick={() => setActiveIdx((i) => (i + 1) % total)}
                  className="ml-auto text-xs text-text-muted hover:text-foreground"
                >
                  Next suggestion &rarr;
                </button>
              )}
            </div>

            {panelOpen && (
              <LastEightInline rows={(lastApproved.data ?? []) as LastApprovedRow[]} loading={lastApproved.isLoading} hex={hex} />
            )}
          </div>
        </div>
      </GlassCard>
    </section>
  );
}

function LastEightInline({
  rows,
  loading,
  hex,
}: {
  rows: LastApprovedRow[];
  loading: boolean;
  hex: string;
}) {
  if (loading) {
    return (
      <p className="mt-4 text-xs text-text-muted">Loading last 8...</p>
    );
  }
  if (rows.length === 0) {
    return (
      <p className="mt-4 text-xs text-text-muted">
        No approved deliverables found yet.
      </p>
    );
  }
  return (
    <div className="mt-4 rounded-lg border border-gray-100 bg-[oklch(0.99_0.002_260)] p-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
        These set the streak
      </p>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-3 text-xs">
            <a
              href={`/review/${r.id}`}
              className="min-w-0 flex-1 truncate text-foreground hover:underline"
              title={r.title}
            >
              {r.title}
            </a>
            <span className="shrink-0 text-text-muted">
              {r.deliverableType}
            </span>
            {r.version === 1 && (
              <span
                className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                style={{ background: `${hex}20`, color: hex }}
              >
                first read
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
