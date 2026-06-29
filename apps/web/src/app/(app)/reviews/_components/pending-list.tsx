"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import { GlassCard } from "@beast/ui";

export interface PendingItem {
  id: string;
  title: string;
  deliverableType: string;
  version: number;
  createdAt: string;
  employeeName: string;
  employeeInitial: string;
  employeeColor: string;
  taskTitle: string | null;
}

interface PendingListProps {
  items: PendingItem[];
}

export function PendingList({ items }: PendingListProps) {
  const router = useRouter();
  const trpc = useTRPC();
  const approve = useMutation(trpc.deliverables.approve.mutationOptions());
  const [activeIndex, setActiveIndex] = useState<number>(items.length > 0 ? 0 : -1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkPending, setBulkPending] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const itemRefs = useRef<Array<HTMLAnchorElement | null>>([]);

  useEffect(() => {
    if (items.length === 0) {
      setActiveIndex(-1);
      return;
    }
    setActiveIndex((prev) => {
      if (prev < 0) return 0;
      if (prev >= items.length) return items.length - 1;
      return prev;
    });
  }, [items.length]);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (items.length === 0) return;

      if (e.key === "j" || e.key === "J") {
        e.preventDefault();
        setActiveIndex((i) => {
          const next = i < 0 ? 0 : Math.min(i + 1, items.length - 1);
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
        if (activeIndex >= 0 && activeIndex < items.length) {
          e.preventDefault();
          const target = items[activeIndex];
          if (target) toggleSelect(target.id);
        }
      } else if (e.key === "Enter") {
        if (activeIndex >= 0 && activeIndex < items.length) {
          e.preventDefault();
          const target = items[activeIndex];
          if (target) router.push(`/review/${target.id}`);
        }
      }
    }

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeIndex, items, router]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function handleBulkApprove() {
    if (selected.size === 0 || bulkPending) return;
    if (
      !confirm(
        `Approve ${selected.size} ${selected.size === 1 ? "deliverable" : "deliverables"} without edits or rationale? Each will get a post-approval check-in.`,
      )
    ) {
      return;
    }
    setBulkPending(true);
    setBulkError(null);
    const ids = Array.from(selected);
    let failures = 0;
    for (const id of ids) {
      try {
        await approve.mutateAsync({ deliverableId: id, approvedWithoutEdits: true });
      } catch (err) {
        failures++;
        console.error("[bulk approve] failed for", id, err);
      }
    }
    setBulkPending(false);
    if (failures > 0) {
      setBulkError(`Approved ${ids.length - failures} of ${ids.length}. ${failures} failed.`);
    }
    setSelected(new Set());
    router.refresh();
  }

  if (items.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
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
            </span>
            <button
              onClick={() => setSelected(new Set())}
              disabled={bulkPending}
              className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-text-secondary hover:bg-gray-50 disabled:opacity-50"
            >
              Clear
            </button>
            <button
              onClick={handleBulkApprove}
              disabled={bulkPending}
              className="rounded-full bg-[#22C55E] px-3 py-1 text-xs font-medium text-white hover:bg-[#16A34A] disabled:opacity-50"
            >
              {bulkPending ? "Approving..." : `Approve ${selected.size}`}
            </button>
          </div>
        )}
      </div>

      {bulkError && (
        <p className="px-1 text-xs text-error">{bulkError}</p>
      )}

      {items.map((d, i) => {
        const active = i === activeIndex;
        const isSelected = selected.has(d.id);
        return (
          <div key={d.id} className="flex items-stretch gap-2">
            <button
              type="button"
              onClick={() => toggleSelect(d.id)}
              aria-label={isSelected ? `Deselect ${d.title}` : `Select ${d.title}`}
              aria-pressed={isSelected}
              className="flex w-6 shrink-0 items-center justify-center rounded-md hover:bg-gray-100"
            >
              <span
                className={`flex h-4 w-4 items-center justify-center rounded border ${
                  isSelected
                    ? "border-[#16A34A] bg-[#16A34A] text-white"
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
              href={`/review/${d.id}`}
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
                    ? { boxShadow: `0 0 0 2px ${d.employeeColor}55` }
                    : undefined
                }
              >
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-full text-white text-xs font-semibold shrink-0"
                    style={{ backgroundColor: d.employeeColor }}
                  >
                    {d.employeeInitial}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{d.title}</p>
                    <p className="text-xs text-text-secondary truncate">
                      {d.employeeName} &middot; {d.deliverableType.replace(/_/g, " ")}
                      {d.taskTitle ? ` · ${d.taskTitle}` : ""}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-600">
                      v{d.version}
                    </span>
                    <p className="text-[10px] text-text-muted mt-0.5">
                      {new Date(d.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                </div>
              </GlassCard>
            </Link>
          </div>
        );
      })}
    </div>
  );
}
