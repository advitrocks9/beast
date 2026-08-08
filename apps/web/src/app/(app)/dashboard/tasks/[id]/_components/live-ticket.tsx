"use client";

import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRunStream } from "@/hooks/use-run-stream";
import { StateChip, RegisterMark } from "@/components/state-chip";
import { ProvenanceTag, type Provenance } from "@/components/provenance-tag";
import { toTicketLines, lineToneClass } from "./ticket-lines";
import { TicketMasthead, type TicketMastheadData } from "./ticket-masthead";
import { CancelTaskButton } from "./cancel-task-button";

const HOLD_COPY: Record<string, string> = {
  plan_review: "The press holds for your sign-off. Approve the plan and the run starts.",
  queued: "Queued for dispatch. The orchestrator's next sweep puts it on the press.",
  planning: "Planning. The plan lands here for your sign-off before the press starts.",
};

export function LiveTicket({
  taskId,
  taskTitle,
  taskStatus,
  provenance,
  masthead,
  children,
}: {
  taskId: string;
  taskTitle: string;
  taskStatus: string;
  provenance: Provenance | null;
  masthead: TicketMastheadData;
  children?: React.ReactNode;
}) {
  const stream = useRunStream(taskId);
  const router = useRouter();
  const entries = useMemo(() => stream.events.map((event) => ({ event })), [stream.events]);
  const { lines, draft, ended, fatal } = useMemo(() => toTicketLines(entries), [entries]);
  const replay = stream.kind === "replay";

  const refreshed = useRef(false);
  useEffect(() => {
    if (replay || (!ended && !fatal) || refreshed.current) return;
    refreshed.current = true;
    const t = setTimeout(() => router.refresh(), 1200);
    return () => clearTimeout(t);
  }, [ended, fatal, replay, router]);

  const chipStatus = replay
    ? taskStatus
    : fatal
      ? "failed"
      : ended
        ? "in_review"
        : taskStatus !== "plan_review" && stream.status === "streaming"
          ? "running"
          : taskStatus;

  const tag = stream.kind ?? provenance;
  const pressOn = !replay && !ended && !fatal && stream.status === "streaming";
  const holdCopy = HOLD_COPY[taskStatus];

  return (
    <>
      <TicketMasthead
        {...masthead}
        title={taskTitle}
        state={
          <>
            {tag && <ProvenanceTag kind={tag} />}
            <StateChip
              key={chipStatus}
              status={chipStatus}
              className={ended || fatal ? "stamp-in" : undefined}
            />
            {!ended && !fatal && <CancelTaskButton taskId={taskId} taskTitle={taskTitle} />}
          </>
        }
      />

      {children}

      <section aria-label="The run" className="mt-5">
        <div className="rule-t flex items-center justify-between pt-2.5">
          <h2 className="text-[15px] font-semibold">The run</h2>
          {pressOn ? (
            <span className="flex items-center gap-2 text-identity-deep">
              <RegisterMark size={11} />
              <span className="spec-label text-identity-deep">press running</span>
            </span>
          ) : replay ? (
            <span className="spec-label">replayed record</span>
          ) : null}
        </div>

        <div className="mt-2 min-h-[120px]" aria-live="polite">
          {stream.status === "connecting" &&
            (holdCopy ? (
              <p className="text-[13.5px] text-ink-secondary">{holdCopy}</p>
            ) : (
              <div className="space-y-2 py-1">
                <div className="h-3.5 w-2/3 bg-panel" />
                <div className="h-3.5 w-1/2 bg-panel" />
                <div className="h-3.5 w-3/5 bg-panel" />
              </div>
            ))}

          {stream.status === "error" && (
            <p className="text-[13.5px] text-state-failed">
              Could not open the run stream. Refresh to read the record off the ticket.
            </p>
          )}

          <ol className="space-y-1.5">
            {lines.map((line) => (
              <li key={line.key} className="line-arrive flex items-baseline gap-3">
                <span className={`spec min-w-[86px] shrink-0 font-semibold ${lineToneClass(line.tone)}`}>
                  {line.label}
                </span>
                <span className="spec min-w-0 flex-1 break-words text-ink-secondary">
                  {line.detail}
                </span>
              </li>
            ))}
          </ol>

          {pressOn && draft && (
            <p className="spec mt-2.5 border-l border-hairline pl-3 text-ink-muted">
              drafting: …{draft.slice(-140)}
            </p>
          )}
        </div>

        {ended && !replay && (
          <footer className="hairline-t flex items-center justify-between py-2.5">
            <span className="spec-label">Filed to the review tray</span>
            <Link
              href="/reviews"
              className="text-[13px] font-semibold text-ink underline underline-offset-2 transition-colors hover:text-identity-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              Open review
            </Link>
          </footer>
        )}
      </section>
    </>
  );
}
