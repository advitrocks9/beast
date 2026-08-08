"use client";

import { useState } from "react";

export interface ToolCallTrace {
  toolCallId: string;
  name: string;
  inputSummary: string;
  resultSummary: string;
  durationMs: number;
  startedAt: string;
}

interface ReasoningTrailProps {
  trace: ToolCallTrace[] | undefined;
  employeeName: string;
}

const COLLAPSED_ROWS = 8;

export function ReasoningTrail({ trace, employeeName }: ReasoningTrailProps) {
  const [expanded, setExpanded] = useState(false);

  if (!trace || trace.length === 0) return null;

  const visible = trace.filter(
    (t) => !t.name.startsWith("scratchpad") && !t.name.startsWith("memory_"),
  );
  if (visible.length === 0) return null;

  const totalMs = visible.reduce((sum, t) => sum + (t.durationMs ?? 0), 0);
  const rows = expanded ? visible : visible.slice(0, COLLAPSED_ROWS);
  const hidden = visible.length - rows.length;

  return (
    <section aria-label="Production record">
      <div className="rule-t flex items-baseline justify-between pt-2.5">
        <h2 className="text-[15px] font-semibold">Production record</h2>
        <p className="spec text-ink-muted">
          {employeeName} · {visible.length} steps · {formatDuration(totalMs)}
        </p>
      </div>
      <ol className="mt-2 space-y-1.5">
        {rows.map((t) => (
          <li key={t.toolCallId} className="flex items-baseline gap-3">
            <span className="spec min-w-[86px] shrink-0 font-semibold text-ink">{t.name}</span>
            <span
              className="spec min-w-0 flex-1 truncate text-ink-secondary"
              title={t.resultSummary}
            >
              {[t.inputSummary, t.resultSummary].filter(Boolean).join(" → ") || "…"}
            </span>
            <span className="spec shrink-0 text-ink-muted">{formatDuration(t.durationMs)}</span>
          </li>
        ))}
      </ol>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="spec-label mt-2 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          All {visible.length} steps
        </button>
      )}
    </section>
  );
}

function formatDuration(ms: number): string {
  if (!ms || ms < 0) return "0ms";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}
