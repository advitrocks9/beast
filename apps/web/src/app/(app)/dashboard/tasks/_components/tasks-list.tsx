"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import { cn } from "@/lib/utils";
import { Monogram } from "@/components/monogram";
import { StateChip } from "@/components/state-chip";
import { ProvenanceTag } from "@/components/provenance-tag";

export interface TaskRow {
  id: string;
  title: string;
  taskType: string;
  status: string;
  when: string;
  employeeName: string;
  employeeRole: string | null;
  live: boolean;
  inFlight: boolean;
}

export interface TaskSection {
  key: string;
  title: string;
  teach: string;
  count: number;
  collapsed: boolean;
  rows: TaskRow[];
}

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

export function TasksList({ sections }: { sections: TaskSection[] }) {
  const router = useRouter();
  const trpc = useTRPC();
  const cancel = useMutation(trpc.tasks.cancel.mutationOptions());
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkPending, setBulkPending] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const itemRefs = useRef<Array<HTMLAnchorElement | null>>([]);

  const visible = useMemo(() => {
    const out: Array<TaskSection & { open: boolean; start: number }> = [];
    let start = 0;
    for (const s of sections) {
      const open = !s.collapsed || historyOpen;
      out.push({ ...s, open, start });
      if (open) start += s.rows.length;
    }
    return out;
  }, [sections, historyOpen]);
  const flat = useMemo(() => visible.flatMap((s) => (s.open ? s.rows : [])), [visible]);
  const [activeIndex, setActiveIndex] = useState<number>(flat.length > 0 ? 0 : -1);

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  useEffect(() => {
    if (flat.length === 0) {
      setActiveIndex(-1);
      return;
    }
    setActiveIndex((prev) => Math.min(Math.max(prev, 0), flat.length - 1));
  }, [flat.length]);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (flat.length === 0) return;

      if (e.key === "j" || e.key === "J") {
        e.preventDefault();
        setActiveIndex((i) => {
          const next = i < 0 ? 0 : Math.min(i + 1, flat.length - 1);
          itemRefs.current[next]?.scrollIntoView({ block: "nearest" });
          return next;
        });
      } else if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        setActiveIndex((i) => {
          const next = Math.max(i - 1, 0);
          itemRefs.current[next]?.scrollIntoView({ block: "nearest" });
          return next;
        });
      } else if (e.key === "x" || e.key === "X") {
        const row = flat[activeIndex];
        if (row) {
          e.preventDefault();
          toggleSelect(row.id);
        }
      } else if (e.key === "Enter") {
        const row = flat[activeIndex];
        if (row) {
          e.preventDefault();
          router.push(`/dashboard/tasks/${row.id}`);
        }
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeIndex, flat, router, toggleSelect]);

  const inFlightSelected = flat.filter((r) => selected.has(r.id) && r.inFlight);
  const notInFlight = selected.size - inFlightSelected.length;

  async function handleBulkCancel() {
    if (inFlightSelected.length === 0 || bulkPending) return;
    if (
      !confirm(
        `Cancel ${inFlightSelected.length} in-flight ${inFlightSelected.length === 1 ? "job" : "jobs"}? Filed and finished rows are skipped.`,
      )
    ) {
      return;
    }
    setBulkPending(true);
    setBulkError(null);
    let failures = 0;
    for (const row of inFlightSelected) {
      try {
        await cancel.mutateAsync({ taskId: row.id });
      } catch (err) {
        failures++;
        console.error("[bulk cancel] failed for", row.id, err);
      }
    }
    setBulkPending(false);
    if (failures > 0) {
      setBulkError(`Cancelled ${inFlightSelected.length - failures} of ${inFlightSelected.length}. ${failures} failed.`);
    }
    setSelected(new Set());
    router.refresh();
  }

  return (
    <div className="mt-3">
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-3">
        <p className="spec-label hidden sm:block">
          <Kbd>J</Kbd>/<Kbd>K</Kbd> walk · <Kbd>X</Kbd> select · <Kbd>Enter</Kbd> open
        </p>
        {selected.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="spec text-ink-secondary">
              {selected.size} selected
              {notInFlight > 0 && <span className="text-ink-muted"> · {notInFlight} not in flight</span>}
            </span>
            <button
              onClick={() => setSelected(new Set())}
              disabled={bulkPending}
              className={cn("btn-ghost disabled:opacity-50", FOCUS)}
            >
              Clear
            </button>
            <button
              onClick={handleBulkCancel}
              disabled={bulkPending || inFlightSelected.length === 0}
              className={cn(
                "inline-flex items-center rounded-[2px] border border-hairline bg-bg px-4 py-[9px] text-[13.5px] leading-none font-semibold text-state-failed transition-colors hover:border-state-failed disabled:opacity-50",
                FOCUS,
              )}
            >
              {bulkPending ? "Cancelling..." : `Cancel ${inFlightSelected.length}`}
            </button>
          </div>
        )}
      </div>

      {bulkError && <p className="spec mt-1 text-state-failed">{bulkError}</p>}

      <div className="mt-1 space-y-5">
        {visible.map((section) => {
          const { open, start } = section;
          return (
            <section key={section.key} aria-label={section.title}>
              <div className="rule-t flex items-baseline justify-between pt-2.5">
                <h2 className="text-[15px] font-semibold">
                  {section.title}
                  <span className="spec ml-2 font-normal text-ink-muted">{section.count}</span>
                </h2>
                {section.collapsed && section.rows.length > 0 && (
                  <button
                    onClick={() => setHistoryOpen((v) => !v)}
                    aria-expanded={historyOpen}
                    className={cn("spec-label transition-colors hover:text-ink", FOCUS)}
                  >
                    {historyOpen ? "Collapse" : `Show ${section.count}`}
                  </button>
                )}
              </div>
              {!open ? null : section.rows.length === 0 ? (
                <p className="mt-2.5 text-[13px] text-ink-muted">{section.teach}</p>
              ) : (
                <ul className="mt-1">
                  {section.rows.map((row, i) => {
                    const index = start + i;
                    const active = index === activeIndex;
                    const isSelected = selected.has(row.id);
                    return (
                      <li key={row.id} className="hairline-b last:border-b-0">
                        <div
                          className={cn(
                            "flex items-center gap-1",
                            active && "bg-panel shadow-[inset_2px_0_0_0_var(--color-ink)]",
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => toggleSelect(row.id)}
                            aria-label={isSelected ? `Deselect ${row.title}` : `Select ${row.title}`}
                            aria-pressed={isSelected}
                            className={cn("flex h-9 w-7 shrink-0 items-center justify-center", FOCUS)}
                          >
                            <span
                              className={cn(
                                "flex h-3.5 w-3.5 items-center justify-center rounded-[2px] border transition-colors",
                                isSelected
                                  ? "border-ink bg-ink text-white"
                                  : "border-hairline bg-bg hover:border-ink",
                              )}
                            >
                              {isSelected && (
                                <svg width="9" height="9" viewBox="0 0 12 12" fill="none" aria-hidden>
                                  <path d="M2 6.5L5 9.5L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )}
                            </span>
                          </button>
                          <Link
                            href={`/dashboard/tasks/${row.id}`}
                            ref={(el) => {
                              itemRefs.current[index] = el;
                            }}
                            onMouseEnter={() => setActiveIndex(index)}
                            className={cn(
                              "flex min-w-0 flex-1 flex-col gap-1.5 py-2.5 pr-1 transition-colors hover:bg-panel sm:flex-row sm:items-center sm:gap-3",
                              FOCUS,
                            )}
                          >
                            <span className="flex min-w-0 items-center gap-3 sm:flex-1">
                              <Monogram name={row.employeeName} roleType={row.employeeRole} size="sm" />
                              <span className="min-w-0 flex-1">
                                <span className="line-clamp-2 text-[13.5px] leading-tight font-medium sm:line-clamp-1">
                                  {row.title}
                                </span>
                                <span className="spec-label">
                                  {row.employeeName} · {row.taskType}
                                </span>
                              </span>
                            </span>
                            <span className="flex shrink-0 items-center gap-3 pl-9 sm:pl-0">
                              {row.live && <ProvenanceTag kind="live" />}
                              <StateChip status={row.status} />
                              <span className="spec w-12 text-right text-ink-muted">
                                {row.when}
                              </span>
                            </span>
                          </Link>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-[2px] border border-hairline bg-bg px-1 py-0.5 font-mono text-[10px] text-ink-secondary">
      {children}
    </kbd>
  );
}
