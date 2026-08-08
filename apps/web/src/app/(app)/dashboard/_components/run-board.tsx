"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { AgentRunEvent } from "@beast/shared";
import { useRunStream } from "@/hooks/use-run-stream";
import { Monogram } from "@/components/monogram";
import { StateChip, RegisterMark } from "@/components/state-chip";
import { ProvenanceTag, type Provenance } from "@/components/provenance-tag";

export interface RunBoardTask {
  id: string;
  title: string;
  status: string;
  employeeName: string;
  roleType: string;
}

interface TicketLine {
  key: string;
  label: string;
  detail: string;
  tone: "tool" | "note" | "error" | "end";
}

function toLines(events: AgentRunEvent[]): { lines: TicketLine[]; draft: string; ended: boolean } {
  const lines: TicketLine[] = [];
  let draft = "";
  let ended = false;
  const openTools = new Map<string, number>();

  events.forEach((e, i) => {
    switch (e.type) {
      case "run_start":
        lines.push({ key: `s${i}`, label: "run_start", detail: `${e.agentName} clocked in`, tone: "note" });
        break;
      case "tool_call_start":
        openTools.set(e.toolCallId, lines.length);
        lines.push({ key: e.toolCallId, label: e.toolName, detail: "…", tone: "tool" });
        break;
      case "tool_call_end": {
        const at = openTools.get(e.toolCallId);
        const detail = e.result.length > 110 ? `${e.result.slice(0, 110)}…` : e.result;
        if (at !== undefined && lines[at]) lines[at] = { ...lines[at], detail };
        else lines.push({ key: e.toolCallId, label: e.toolName, detail, tone: "tool" });
        break;
      }
      case "scratchpad_update": {
        const current = e.items.find((it) => it.status === "in_progress");
        if (current) lines.push({ key: `p${i}`, label: "plan", detail: current.description, tone: "note" });
        break;
      }
      case "text_delta":
        draft += e.text;
        break;
      case "error":
        lines.push({ key: `e${i}`, label: "error", detail: e.message, tone: "error" });
        break;
      case "run_end":
        ended = true;
        lines.push({
          key: `end${i}`,
          label: "filed",
          detail: `deliverable filed for review · ${e.iterations} steps · ${(e.durationMs / 1000).toFixed(0)}s`,
          tone: "end",
        });
        break;
    }
  });

  return { lines, draft, ended };
}

export function RunBoard({ task }: { task: RunBoardTask | null }) {
  const stream = useRunStream(task?.id);
  const { lines, draft, ended } = useMemo(() => toLines(stream.events), [stream.events]);

  if (!task) {
    return (
      <div className="panel-tinted flex flex-col items-start gap-2 p-5">
        <p className="spec-label">Production board</p>
        <p className="text-sm text-ink-secondary">
          No run on the press. Commission a job and watch it work here.
        </p>
      </div>
    );
  }

  const streaming = stream.status === "streaming" && !ended;
  const provenance: Provenance =
    stream.kind === "live" ? "live" : stream.kind === "simulated" ? "simulated" : "replay";

  return (
    <section aria-label="Production board" className="panel overflow-hidden">
      <header className="rule-b flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Monogram name={task.employeeName} roleType={task.roleType} size="sm" />
          <div className="min-w-0">
            <p className="line-clamp-2 text-[14px] leading-tight font-semibold sm:line-clamp-1">{task.title}</p>
            <p className="spec-label mt-0.5">{task.employeeName} · production record</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {stream.kind && <ProvenanceTag kind={provenance} />}
          <StateChip status={streaming ? "running" : ended ? "in_review" : task.status} />
        </div>
      </header>

      <div className="min-h-[180px] px-4 py-3" aria-live="polite">
        {stream.status === "connecting" && (
          <div className="space-y-2 py-1">
            <div className="h-3.5 w-2/3 bg-panel" />
            <div className="h-3.5 w-1/2 bg-panel" />
            <div className="h-3.5 w-3/5 bg-panel" />
          </div>
        )}

        {stream.status === "error" && (
          <p className="text-sm text-state-failed">
            Could not open the run stream. The trajectory is on the job ticket instead.
          </p>
        )}

        <ol className="space-y-1.5">
          {lines.map((line) => (
            <li key={line.key} className="line-arrive flex items-baseline gap-3">
              <span
                className={`spec min-w-[86px] shrink-0 ${
                  line.tone === "error"
                    ? "text-state-failed"
                    : line.tone === "end"
                      ? "text-state-accepted"
                      : "text-ink"
                } font-semibold`}
              >
                {line.label}
              </span>
              <span className="spec min-w-0 flex-1 truncate text-ink-secondary">{line.detail}</span>
            </li>
          ))}
        </ol>

        {streaming && draft && (
          <p className="spec mt-2.5 border-l border-hairline pl-3 text-ink-muted">
            drafting: …{draft.slice(-140)}
          </p>
        )}

        {streaming && (
          <p className="mt-3 flex items-center gap-2 text-identity-deep">
            <RegisterMark size={11} />
            <span className="spec-label text-identity-deep">press running</span>
          </p>
        )}
      </div>

      {ended && (
        <footer className="hairline-t flex items-center justify-between px-4 py-2.5">
          <span className="spec-label">Filed to the review tray</span>
          <Link href="/reviews" className="text-[13px] font-semibold text-ink underline underline-offset-2">
            Open review
          </Link>
        </footer>
      )}
    </section>
  );
}
