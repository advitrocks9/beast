"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import { statusMeta } from "@/lib/colors";
import { GlassCard } from "@beast/ui";

export interface TaskRow {
  id: string;
  title: string;
  taskType: string;
  status: string;
  statusLabel: string;
  statusColor: string;
  createdAt: string;
  employeeName: string;
  employeeInitial: string;
  employeeColor: string;
  inFlight: boolean;
}

interface TasksListProps {
  rows: TaskRow[];
}

export function TasksList({ rows }: TasksListProps) {
  const router = useRouter();
  const trpc = useTRPC();
  const cancel = useMutation(trpc.tasks.cancel.mutationOptions());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkPending, setBulkPending] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState<number>(rows.length > 0 ? 0 : -1);
  const itemRefs = useRef<Array<HTMLAnchorElement | null>>([]);

  useEffect(() => {
    if (rows.length === 0) {
      setActiveIndex(-1);
      return;
    }
    setActiveIndex((prev) => {
      if (prev < 0) return 0;
      if (prev >= rows.length) return rows.length - 1;
      return prev;
    });
  }, [rows.length]);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (rows.length === 0) return;

      if (e.key === "j" || e.key === "J") {
        e.preventDefault();
        setActiveIndex((i) => {
          const next = i < 0 ? 0 : Math.min(i + 1, rows.length - 1);
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
        if (activeIndex >= 0 && activeIndex < rows.length) {
          e.preventDefault();
          const target = rows[activeIndex];
          if (target) toggleSelect(target.id);
        }
      } else if (e.key === "Enter") {
        if (activeIndex >= 0 && activeIndex < rows.length) {
          e.preventDefault();
          const target = rows[activeIndex];
          if (target) router.push(`/dashboard/tasks/${target.id}`);
        }
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeIndex, rows, router]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const inFlightSelected = rows.filter((r) => selected.has(r.id) && r.inFlight);
  const cannotCancelCount = selected.size - inFlightSelected.length;

  async function handleBulkCancel() {
    if (inFlightSelected.length === 0 || bulkPending) return;
    if (
      !confirm(
        `Cancel ${inFlightSelected.length} in-flight ${inFlightSelected.length === 1 ? "task" : "tasks"}? Already approved or completed rows are skipped.`,
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

  if (rows.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="px-1 text-[11px] text-text-muted">
          Tip: <kbd className="rounded border border-gray-200 bg-white px-1 py-0.5 text-[10px] font-medium">J</kbd> /{" "}
          <kbd className="rounded border border-gray-200 bg-white px-1 py-0.5 text-[10px] font-medium">K</kbd> to walk,{" "}
          <kbd className="rounded border border-gray-200 bg-white px-1 py-0.5 text-[10px] font-medium">X</kbd> to select,{" "}
          <kbd className="rounded border border-gray-200 bg-white px-1 py-0.5 text-[10px] font-medium">Enter</kbd> to open.
        </p>
        {selected.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-secondary">
              {selected.size} selected
              {cannotCancelCount > 0 && (
                <span className="text-text-muted">
                  {" "}({cannotCancelCount} not in flight)
                </span>
              )}
            </span>
            <button
              onClick={() => setSelected(new Set())}
              disabled={bulkPending}
              className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-text-secondary hover:bg-gray-50 disabled:opacity-50"
            >
              Clear
            </button>
            <button
              onClick={handleBulkCancel}
              disabled={bulkPending || inFlightSelected.length === 0}
              className="rounded-full bg-[#DC2626] px-3 py-1 text-xs font-medium text-white hover:bg-[#B91C1C] disabled:opacity-50"
            >
              {bulkPending ? "Cancelling..." : `Cancel ${inFlightSelected.length}`}
            </button>
          </div>
        )}
      </div>

      {bulkError && (
        <p className="px-1 text-xs text-error">{bulkError}</p>
      )}

      {rows.map((t, i) => {
        const active = i === activeIndex;
        const isSelected = selected.has(t.id);
        const status = statusMeta(t.status);
        return (
          <div key={t.id} className="flex items-stretch gap-2">
            <button
              type="button"
              onClick={() => toggleSelect(t.id)}
              aria-label={isSelected ? `Deselect ${t.title}` : `Select ${t.title}`}
              aria-pressed={isSelected}
              className="flex w-6 shrink-0 items-center justify-center rounded-md hover:bg-gray-100"
            >
              <span
                className={`flex h-4 w-4 items-center justify-center rounded border ${
                  isSelected
                    ? "border-[#1F2937] bg-[#1F2937] text-white"
                    : "border-gray-300 bg-white"
                }`}
              >
                {isSelected && (
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6.5L5 9.5L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
            </button>
            <Link
              href={`/dashboard/tasks/${t.id}`}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              onMouseEnter={() => setActiveIndex(i)}
              className="flex-1"
            >
              <GlassCard
                className="p-4 transition-shadow"
                style={
                  active
                    ? { boxShadow: `0 0 0 2px ${t.employeeColor}55` }
                    : undefined
                }
              >
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-full text-white text-xs font-semibold shrink-0"
                    style={{ backgroundColor: t.employeeColor }}
                  >
                    {t.employeeInitial}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{t.title}</p>
                    <p className="text-xs text-text-secondary truncate">
                      {t.employeeName} &middot; {t.taskType.replace(/_/g, " ")} &middot;{" "}
                      {new Date(t.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                  <span
                    className="rounded-full px-2.5 py-0.5 text-xs font-medium shrink-0"
                    style={{ backgroundColor: status.bg, color: status.fg }}
                  >
                    {t.statusLabel}
                  </span>
                </div>
              </GlassCard>
            </Link>
          </div>
        );
      })}
    </div>
  );
}
