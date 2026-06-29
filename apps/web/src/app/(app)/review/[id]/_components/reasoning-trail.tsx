"use client";

import { useState } from "react";

interface ToolCallTrace {
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

const SEARCH_TOOLS = new Set(["web_search", "search", "google_search"]);
const FETCH_TOOLS = new Set(["web_fetch", "fetch_url", "scrape", "scrape_url"]);

export function ReasoningTrail({ trace, employeeName }: ReasoningTrailProps) {
  const [open, setOpen] = useState(false);

  if (!trace || trace.length === 0) return null;

  // Filter out internal tools the founder doesn't need to see
  const visible = trace.filter(
    (t) => !t.name.startsWith("scratchpad") && !t.name.startsWith("memory_"),
  );
  if (visible.length === 0) return null;

  const searches = visible.filter((t) => SEARCH_TOOLS.has(t.name));
  const fetches = visible.filter((t) => FETCH_TOOLS.has(t.name));
  const others = visible.filter(
    (t) => !SEARCH_TOOLS.has(t.name) && !FETCH_TOOLS.has(t.name),
  );

  const totalMs = visible.reduce((sum, t) => sum + (t.durationMs ?? 0), 0);
  const summary = buildSummary({
    employeeName,
    pageCount: fetches.length,
    searchCount: searches.length,
    otherCount: others.length,
    totalMs,
  });

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-full bg-[oklch(0.95_0.01_260)] px-3.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-[oklch(0.93_0.01_260)]"
      >
        <span aria-hidden>&#9656;</span>
        <span style={{ display: "inline-block", transform: open ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 200ms" }}>
          {/* arrow rotation handled inline via the transform */}
        </span>
        <span className="tabular-nums">{summary}</span>
      </button>

      {open && (
        <div className="mt-3 rounded-xl border border-gray-200 bg-white p-5">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {searches.length > 0 && (
              <Column title="Searches">
                {searches.map((t, i) => (
                  <Row
                    key={t.toolCallId}
                    index={i + 1}
                    label={t.inputSummary || "(empty query)"}
                    durationMs={t.durationMs}
                    title={t.resultSummary}
                  />
                ))}
              </Column>
            )}

            {fetches.length > 0 && (
              <Column title="Pages read">
                {fetches.map((t, i) => (
                  <Row
                    key={t.toolCallId}
                    index={i + 1}
                    label={t.inputSummary || "(empty url)"}
                    durationMs={t.durationMs}
                    title={t.resultSummary}
                    monospace
                  />
                ))}
              </Column>
            )}
          </div>

          {others.length > 0 && (
            <div className="mt-6">
              <Column title="Tools">
                {others.map((t, i) => (
                  <Row
                    key={t.toolCallId}
                    index={i + 1}
                    label={`${t.name} ${t.inputSummary ? `(${t.inputSummary})` : ""}`.trim()}
                    durationMs={t.durationMs}
                    title={t.resultSummary}
                  />
                ))}
              </Column>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Column({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-text-muted">
        {title}
      </p>
      <ul className="space-y-1.5">{children}</ul>
    </div>
  );
}

function Row({
  index,
  label,
  durationMs,
  title,
  monospace,
}: {
  index: number;
  label: string;
  durationMs: number;
  title?: string;
  monospace?: boolean;
}) {
  return (
    <li
      title={title}
      className="flex items-baseline gap-2 text-sm"
    >
      <span className="w-5 shrink-0 text-right tabular-nums text-text-muted">
        {index}.
      </span>
      <span
        className={`flex-1 truncate ${monospace ? "font-mono text-xs" : ""}`}
      >
        {label}
      </span>
      <span className="shrink-0 tabular-nums text-xs text-text-muted">
        {formatDuration(durationMs)}
      </span>
    </li>
  );
}

function buildSummary(args: {
  employeeName: string;
  pageCount: number;
  searchCount: number;
  otherCount: number;
  totalMs: number;
}): string {
  const { employeeName, pageCount, searchCount, otherCount, totalMs } = args;
  const parts: string[] = [];
  if (pageCount > 0) {
    parts.push(`read ${pageCount} page${pageCount === 1 ? "" : "s"}`);
  }
  if (searchCount > 0) {
    parts.push(`ran ${searchCount} search${searchCount === 1 ? "" : "es"}`);
  }
  if (parts.length === 0 && otherCount > 0) {
    parts.push(`used ${otherCount} tool${otherCount === 1 ? "" : "s"}`);
  }
  if (parts.length === 0) {
    return `${employeeName} did the work.`;
  }
  const phrase = parts.join(", ");
  return `${employeeName} ${phrase}, took ${formatDuration(totalMs)}.`;
}

function formatDuration(ms: number): string {
  if (!ms || ms < 0) return "0ms";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}
