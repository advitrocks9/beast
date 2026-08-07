"use client";

import { GlassCard } from "@beast/ui";
import { useRunStream } from "@/hooks/use-run-stream";
import type { AgentRunEvent, RunStreamKind } from "@beast/shared";

const KIND_LABEL: Record<RunStreamKind, string> = {
  live: "Live",
  replay: "Replay",
  simulated: "Simulated",
};

function stepLabel(event: AgentRunEvent): string | null {
  switch (event.type) {
    case "run_start":
      return `${event.agentName} started the run.`;
    case "tool_call_start":
      return `Calling ${event.toolName.replace(/_/g, " ")}.`;
    case "tool_call_end": {
      const snippet = event.result
        ? ` -> ${event.result.slice(0, 80)}${event.result.length > 80 ? "..." : ""}`
        : "";
      return `Finished ${event.toolName.replace(/_/g, " ")}.${snippet}`;
    }
    case "scratchpad_update": {
      const done = event.items.filter((i) => i.status === "done").length;
      return `Progress: ${done} of ${event.items.length} steps done.`;
    }
    case "error":
      return `Error: ${event.message}`;
    case "run_end":
      return `Done in ${event.iterations} iteration${event.iterations === 1 ? "" : "s"}, ${Math.round(event.durationMs / 1000)}s.`;
    default:
      return null;
  }
}

export function LiveRunFeed({ taskId, employeeName }: { taskId: string; employeeName: string }) {
  const { events, status, kind } = useRunStream(taskId);

  const steps = events
    .map((event) => stepLabel(event))
    .filter((label): label is string => label !== null);
  const textTail = events
    .filter((e): e is AgentRunEvent & { type: "text_delta" } => e.type === "text_delta")
    .map((e) => e.text)
    .join("")
    .slice(-280);
  const finished = status === "done" || events.some((e) => e.type === "run_end");

  return (
    <section aria-live="polite">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold">Run</h2>
        {kind && (
          <span className="rounded-full border border-[oklch(0.85_0.01_260/0.5)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-text-secondary">
            {KIND_LABEL[kind]}
          </span>
        )}
      </div>
      <GlassCard hoverable={false} className="p-5">
        {status === "connecting" && (
          <p className="text-sm text-text-secondary">Connecting to {employeeName}&apos;s run…</p>
        )}
        {status === "error" && (
          <p className="text-sm text-text-secondary">
            Could not open the run stream. The timeline below stays current on refresh.
          </p>
        )}
        {steps.length > 0 && (
          <ol className="space-y-2">
            {steps.map((step, i) => (
              <li key={i} className="flex gap-2 text-xs text-text">
                <span
                  className={`mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                    i === steps.length - 1 && !finished ? "animate-pulse bg-brand" : "bg-[oklch(0.7_0.01_260)]"
                  }`}
                />
                <span className="min-w-0">{step}</span>
              </li>
            ))}
          </ol>
        )}
        {!finished && textTail && (
          <p className="mt-3 border-t border-[oklch(0.9_0.005_260/0.5)] pt-3 text-xs text-text-muted whitespace-pre-wrap">
            …{textTail}
          </p>
        )}
        {status === "streaming" && steps.length === 0 && (
          <p className="text-sm text-text-secondary">{employeeName} is warming up…</p>
        )}
      </GlassCard>
    </section>
  );
}
