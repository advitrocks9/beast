"use client";

import { useEffect, useState } from "react";

interface AppliedRule {
  ruleId: string;
  summary: string;
  evidence: string;
  extractedFromDeliverableId: string;
  extractedFromTitle: string;
  extractedAt: string;
  confidence: number;
  tasksAppliedTo?: number;
}

type Surface = "review" | "dashboard";

interface MemoryReceiptProps {
  rules: AppliedRule[] | undefined;
  scopeKey: string;
  employeeName: string;
  surface?: Surface;
}

const VISIBLE_DEFAULT = 3;
const VISIBLE_EXPANDED = 8;
const PULSE_MS = 600;
const DASHBOARD_MIN_RULES = 3;

export function MemoryReceipt({
  rules,
  scopeKey,
  employeeName,
  surface = "review",
}: MemoryReceiptProps) {
  const dashboard = surface === "dashboard";
  // Review opens by default (the panel IS the second-teardown moment).
  // Dashboard opens to a single-line pill (passive trust signal between sessions).
  const [hidden, setHidden] = useState(dashboard);
  const [expanded, setExpanded] = useState(false);
  const [pulseDone, setPulseDone] = useState(false);

  const storageKey = `memory-receipt-hidden:${scopeKey}`;

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem(storageKey);
      if (stored === "1") setHidden(true);
      else if (stored === "0") setHidden(false);
    }
  }, [storageKey]);

  useEffect(() => {
    const t = window.setTimeout(() => setPulseDone(true), PULSE_MS);
    return () => window.clearTimeout(t);
  }, []);

  if (!rules || rules.length === 0) return null;
  if (dashboard && rules.length < DASHBOARD_MIN_RULES) return null;

  const sorted = [...rules].sort((a, b) => b.confidence - a.confidence);
  const cap = expanded ? VISIBLE_EXPANDED : VISIBLE_DEFAULT;
  const visible = sorted.slice(0, cap);
  const remaining = sorted.length - visible.length;

  function persist(next: boolean) {
    setHidden(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, next ? "1" : "0");
    }
  }

  const headlineOpen = dashboard ? `${employeeName} remembers...` : `${employeeName} remembered.`;
  const headlineClosedVerb = dashboard ? "remembers" : "remembered";

  if (hidden) {
    const count = rules.length;
    return (
      <div className="rounded-xl bg-surface-sunken px-4 py-2.5 text-sm text-text-secondary">
        {employeeName} {headlineClosedVerb} {count} {count === 1 ? "thing" : "things"} about your voice.{" "}
        <button
          type="button"
          onClick={() => persist(false)}
          className="font-medium underline-offset-2 hover:underline"
        >
          show
        </button>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl border border-border bg-white p-6"
      style={pulseDone || dashboard ? undefined : { animation: `memory-receipt-pulse ${PULSE_MS}ms ease-out` }}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-(--font-display) text-base font-semibold tracking-tight">
          {headlineOpen}
        </h3>
        <button
          type="button"
          onClick={() => persist(true)}
          className="text-xs text-text-muted hover:text-text-secondary"
        >
          {dashboard ? "collapse" : "hide for this deliverable"}
        </button>
      </div>

      <ul className="space-y-2.5">
        {visible.map((rule) => (
          <li
            key={rule.ruleId}
            title={provenanceTitle(rule)}
            className="flex items-start gap-2 text-sm leading-relaxed"
          >
            <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
            <span className="flex-1">
              <span className="font-medium text-text">{rule.summary}</span>
              {dashboard
                ? renderDashboardRightClause(rule)
                : rule.evidence && (
                    <span className="text-text-secondary"> · {rule.evidence}</span>
                  )}
            </span>
          </li>
        ))}
      </ul>

      {!expanded && remaining > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-3 text-xs font-medium text-text-secondary hover:text-text"
        >
          + {remaining} more
        </button>
      )}
    </div>
  );
}

function renderDashboardRightClause(rule: AppliedRule) {
  const n = rule.tasksAppliedTo ?? 0;
  if (n <= 0) return null;
  const noun = n === 1 ? "deliverable" : "deliverables";
  return <span className="text-text-secondary"> · used in {n} {noun}</span>;
}

function provenanceTitle(rule: AppliedRule): string {
  if (rule.extractedFromTitle) {
    return `extracted from your feedback on "${rule.extractedFromTitle}"`;
  }
  return "extracted from your prior feedback";
}
