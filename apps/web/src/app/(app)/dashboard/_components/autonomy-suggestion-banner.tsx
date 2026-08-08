"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import { DEMO_MODE } from "@/lib/demo";
import { roleMeta } from "@/lib/colors";

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
    if (!DEMO_MODE && active && active.state === "queued") {
      markShown.mutate({ suggestionId: active.id });
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

  const role = roleMeta(active.employeeRoleType);
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
      <div className="panel p-5">
        <div className="flex items-start gap-3">
          <span
            className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: role.solid }}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <div className="rule-b flex items-baseline justify-between gap-3 pb-2">
              <p className="spec-label" style={{ color: role.text }}>
                {active.employeeName} earned trust
              </p>
              <div className="flex items-center gap-3">
                {counter && (
                  <span className="spec text-ink-muted">{counter}</span>
                )}
                <button
                  type="button"
                  onClick={handleDismiss}
                  aria-label="Dismiss suggestion"
                  disabled={pending}
                  className="spec-label transition-colors hover:text-ink disabled:opacity-50"
                >
                  Hide
                </button>
              </div>
            </div>
            <p
              className="mt-2.5 text-sm text-ink"
              id={`autonomy-${active.id}-sentence`}
            >
              {sentence}
            </p>
            {safety && (
              <p
                className="mt-2 text-xs text-ink-secondary"
                id={`autonomy-${active.id}-safety`}
              >
                {safety}
              </p>
            )}

            {error && (
              <p className="mt-2 text-xs text-destructive">{error}</p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setPanelOpen((v) => !v)}
                className="btn-ghost px-3 py-1.5 text-[12px]"
              >
                {panelOpen ? "Hide last 8" : "See last 8"}
              </button>
              <button
                type="button"
                onClick={handleSnooze}
                disabled={pending}
                aria-describedby={`autonomy-${active.id}-sentence`}
                className="btn-ghost px-3 py-1.5 text-[12px] disabled:opacity-50"
              >
                Snooze 14 days
              </button>
              <button
                type="button"
                onClick={handleAccept}
                disabled={pending}
                aria-describedby={`autonomy-${active.id}-safety`}
                className="btn-ink px-3 py-1.5 text-[12px] disabled:opacity-50"
              >
                Let {active.employeeName} {active.action === "publishSocial" ? "publish" : active.action === "sendEmail" ? "send" : "reach out"}
              </button>
              {total > 1 && (
                <button
                  type="button"
                  onClick={() => setActiveIdx((i) => (i + 1) % total)}
                  className="ml-auto spec-label transition-colors hover:text-ink"
                >
                  Next suggestion &rarr;
                </button>
              )}
            </div>

            {panelOpen && (
              <LastEightInline rows={(lastApproved.data ?? []) as LastApprovedRow[]} loading={lastApproved.isLoading} role={role} />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function LastEightInline({
  rows,
  loading,
  role,
}: {
  rows: LastApprovedRow[];
  loading: boolean;
  role: ReturnType<typeof roleMeta>;
}) {
  if (loading) {
    return (
      <p className="mt-4 text-xs text-ink-muted">Loading last 8...</p>
    );
  }
  if (rows.length === 0) {
    return (
      <p className="mt-4 text-xs text-ink-muted">
        No approved deliverables found yet.
      </p>
    );
  }
  return (
    <div className="panel-tinted mt-4 p-3">
      <p className="spec-label mb-2">
        These set the streak
      </p>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-3 text-xs">
            <a
              href={`/review/${r.id}`}
              className="min-w-0 flex-1 truncate text-ink hover:underline"
              title={r.title}
            >
              {r.title}
            </a>
            <span className="shrink-0 text-ink-muted">
              {r.deliverableType}
            </span>
            {r.version === 1 && (
              <span
                className="shrink-0 rounded-[2px] px-1.5 py-0.5 text-[10px] font-medium"
                style={{ background: role.tint, color: role.text }}
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
