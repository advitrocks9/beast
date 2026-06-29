"use client";

import { useEffect, useRef, useState } from "react";
import { GlassCard } from "@beast/ui";

export interface RunStep {
  kind: "plan" | "search" | "read" | "draft";
  title: string;
  detail: string;
  result?: string;
}

export interface RunReplayData {
  employeeName: string;
  roleColor: string;
  taskTitle: string;
  steps: RunStep[];
  citations: number;
  preview: string;
  ruleApplied?: string;
  deliverableTitle: string;
}

const STEP_MS = 950;

const KIND_LABEL: Record<RunStep["kind"], string> = {
  plan: "Plan",
  search: "Search",
  read: "Read",
  draft: "Draft",
};

export function RunReplay({ data }: { data: RunReplayData }) {
  // -1 = idle (not started), 0..steps.length-1 revealing, steps.length = done
  const [revealed, setRevealed] = useState(-1);
  const timers = useRef<number[]>([]);

  const total = data.steps.length;
  const done = revealed >= total;
  const started = revealed >= 0;

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  function play() {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setRevealed(total);
      return;
    }
    setRevealed(0);
    for (let i = 1; i <= total; i++) {
      timers.current.push(window.setTimeout(() => setRevealed(i), STEP_MS * i));
    }
  }

  return (
    <GlassCard hoverable={false} className="p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Watch {data.employeeName} work</h3>
          <p className="text-xs text-text-secondary">
            A real run on {"“"}{data.taskTitle}{"”"}, start to finish.
          </p>
        </div>
        <button
          type="button"
          onClick={play}
          className="shrink-0 rounded-lg bg-brand px-3.5 py-2 text-xs font-medium text-brand-fg transition-colors hover:bg-brand-deep"
        >
          {started ? "Replay" : "Play run"}
        </button>
      </div>

      {started && (
        <ol className="mt-4 space-y-0">
          {data.steps.map((step, i) => {
            const show = revealed >= i;
            const active = revealed === i && !done;
            return (
              <li
                key={i}
                className="grid grid-cols-[auto_1fr] gap-x-3"
                style={{
                  opacity: show ? 1 : 0.25,
                  transition: "opacity 300ms ease",
                }}
              >
                <div className="flex flex-col items-center">
                  <span
                    className="mt-1 h-2 w-2 rounded-full"
                    style={{
                      backgroundColor: show ? "var(--color-brand)" : "var(--color-border)",
                      boxShadow: active ? "0 0 0 4px var(--color-brand-light)" : "none",
                      transition: "all 300ms ease",
                    }}
                  />
                  {i < data.steps.length - 1 && (
                    <span className="my-1 w-px flex-1 bg-border" style={{ minHeight: 22 }} />
                  )}
                </div>
                <div className="pb-4">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                      {KIND_LABEL[step.kind]}
                    </span>
                    <span className="text-sm font-medium">{step.title}</span>
                  </div>
                  {step.detail && (
                    <p className="text-xs text-text-secondary">{step.detail}</p>
                  )}
                  {step.result && show && (
                    <p className="mt-0.5 text-xs text-text-muted">{step.result}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {done && (
        <div className="mt-1 rounded-xl border border-border bg-surface-sunken p-4">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "var(--color-active)" }} />
            <span className="text-xs font-medium" style={{ color: "var(--color-active)" }}>
              Shipped to your review queue
            </span>
          </div>
          <p className="mt-2 text-sm font-medium">{data.deliverableTitle}</p>
          <p className="mt-1 text-xs leading-relaxed text-text-secondary">{data.preview}</p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-text-muted">
            <span>{data.citations} sources cited</span>
            {data.ruleApplied && <span>Applied your rule: {data.ruleApplied}</span>}
          </div>
        </div>
      )}

      {!started && (
        <p className="mt-4 text-xs text-text-muted">
          {total} steps · ~{Math.round((total * STEP_MS) / 1000)}s · grounded in cited sources
        </p>
      )}
    </GlassCard>
  );
}
