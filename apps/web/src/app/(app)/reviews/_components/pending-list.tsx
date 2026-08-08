"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { useTRPC } from "@/trpc/client";
import { Monogram } from "@/components/monogram";
import { StateChip } from "@/components/state-chip";
import { ProvenanceTag } from "@/components/provenance-tag";

export interface PendingItem {
  id: string;
  title: string;
  deliverableType: string;
  version: number;
  createdAt: string;
  employeeName: string;
  employeeRoleType: string | null;
  taskTitle: string | null;
  isLive: boolean;
}

function relativeTime(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="spec rounded-[2px] border border-hairline bg-bg px-1 py-0.5 text-[10px]">
      {children}
    </kbd>
  );
}

export function PendingList({ items }: { items: PendingItem[] }) {
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

  async function handleBulkAccept() {
    if (selected.size === 0 || bulkPending) return;
    if (
      !confirm(
        `Accept ${selected.size} ${selected.size === 1 ? "deliverable" : "deliverables"} without edits or a sign-off note? Each schedules a check-in.`,
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
        console.error("[bulk accept] failed for", id, err);
      }
    }
    setBulkPending(false);
    if (failures > 0) {
      setBulkError(`Accepted ${ids.length - failures} of ${ids.length}. ${failures} failed.`);
    }
    setSelected(new Set());
    router.refresh();
  }

  if (items.length === 0) return null;

  return (
    <div className="mt-1">
      <div className="flex min-h-8 items-center justify-between gap-3">
        <p className="spec-label">
          <Kbd>J</Kbd> / <Kbd>K</Kbd> walk · <Kbd>X</Kbd> select · <Kbd>↵</Kbd> open
        </p>
        {selected.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="spec text-ink-secondary">{selected.size} selected</span>
            <button
              onClick={() => setSelected(new Set())}
              disabled={bulkPending}
              className="btn-ghost px-3 py-1.5 text-[12px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
            >
              Clear
            </button>
            <button
              onClick={handleBulkAccept}
              disabled={bulkPending}
              className="btn-ink px-3 py-1.5 text-[12px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
            >
              {bulkPending ? "Accepting..." : `Accept ${selected.size}`}
            </button>
          </div>
        )}
      </div>

      {bulkError && <p className="spec mt-1 text-state-failed">{bulkError}</p>}

      <ul className="mt-1">
        {items.map((d, i) => {
          const active = i === activeIndex;
          const isSelected = selected.has(d.id);
          return (
            <li key={d.id} className="hairline-b flex items-stretch gap-1 last:border-b-0">
              <button
                type="button"
                onClick={() => toggleSelect(d.id)}
                aria-label={isSelected ? `Deselect ${d.title}` : `Select ${d.title}`}
                aria-pressed={isSelected}
                className="flex w-7 shrink-0 items-center justify-center transition-colors hover:bg-panel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded-[2px] border ${
                    isSelected ? "border-ink bg-ink text-white" : "border-hairline bg-bg"
                  }`}
                >
                  {isSelected && <Check size={11} strokeWidth={2.5} />}
                </span>
              </button>
              <Link
                href={`/review/${d.id}`}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                onMouseEnter={() => setActiveIndex(i)}
                className={`flex min-w-0 flex-1 items-center gap-3 py-2.5 pr-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
                  active ? "bg-panel" : "hover:bg-panel"
                }`}
              >
                <Monogram name={d.employeeName} roleType={d.employeeRoleType} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] leading-tight font-medium">
                    {d.title}
                  </span>
                  <span className="spec-label mt-0.5 block truncate">
                    {d.deliverableType.replace(/_/g, " ")} · v{d.version}
                    {d.taskTitle ? ` · ${d.taskTitle}` : ""}
                  </span>
                </span>
                {d.isLive && <ProvenanceTag kind="live" />}
                <StateChip status="in_review" />
                <span className="spec w-8 shrink-0 text-right text-ink-muted">
                  {relativeTime(d.createdAt)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
