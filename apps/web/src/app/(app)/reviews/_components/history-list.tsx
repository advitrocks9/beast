"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import { GlassCard } from "@beast/ui";
import { Check, Send, X } from "lucide-react";
import { roleMeta, statusMeta } from "@/lib/colors";

type StatusFilter = "all" | "approved" | "rejected";

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

function parseStatusFilter(raw: string | null): StatusFilter {
  if (raw === "approved" || raw === "rejected") return raw;
  return "all";
}

function parseEmployeeFilter(raw: string | null): string | "all" {
  if (raw && raw.length > 0) return raw;
  return "all";
}

function parseTypeFilter(raw: string | null): string | "all" {
  if (raw && raw.length > 0) return raw;
  return "all";
}

const TYPE_LABELS: Record<string, string> = {
  blog: "Blog",
  social_twitter: "Twitter",
  social_linkedin: "LinkedIn",
  email: "Email",
  faq: "FAQ",
  custom: "Other",
};

function typeChipLabel(t: string): string {
  if (TYPE_LABELS[t]) return TYPE_LABELS[t];
  return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const STATUS_ICONS: Record<string, typeof Check> = {
  approved: Check,
  published: Send,
  rejected: X,
};

const PAGE_SIZE = 30;

function relativeDate(d: Date | string): string {
  const date = new Date(d);
  const diff = Date.now() - date.getTime();
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  if (days < 1) return "today";
  if (days < 2) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function HistoryList() {
  const trpc = useTRPC();
  const router = useRouter();
  const searchParams = useSearchParams();
  const statusFilter = parseStatusFilter(searchParams.get("status"));
  const employeeFilter = parseEmployeeFilter(searchParams.get("employee"));
  const typeFilter = parseTypeFilter(searchParams.get("type"));
  const [offset, setOffset] = useState(0);
  const [activeIndex, setActiveIndex] = useState(-1);
  const itemRefs = useRef<(HTMLAnchorElement | null)[]>([]);

  const employees = useQuery(trpc.employees.list.queryOptions());
  const types = useQuery(trpc.reviews.historyTypes.queryOptions());

  const history = useQuery(
    trpc.reviews.history.queryOptions({
      limit: PAGE_SIZE,
      offset,
      statusFilter,
      employeeId: employeeFilter === "all" ? undefined : employeeFilter,
      typeFilter: typeFilter === "all" ? undefined : typeFilter,
    }),
  );

  const items = history.data ?? [];

  // Reset active index whenever the visible item set changes (filter swap,
  // pagination, fresh fetch). Without this a stale activeIndex pointing at
  // a no-longer-visible row makes Enter route to a deleted page or a row
  // the founder isn't looking at.
  useEffect(() => {
    setActiveIndex(-1);
  }, [statusFilter, employeeFilter, typeFilter, offset]);

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

  function handleFilterChange(next: StatusFilter) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "all") params.delete("status");
    else params.set("status", next);
    const qs = params.toString();
    router.replace(qs ? `/reviews?${qs}` : "/reviews", { scroll: false });
    setOffset(0);
  }

  function handleEmployeeChange(next: string | "all") {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "all") params.delete("employee");
    else params.set("employee", next);
    const qs = params.toString();
    router.replace(qs ? `/reviews?${qs}` : "/reviews", { scroll: false });
    setOffset(0);
  }

  function handleTypeChange(next: string | "all") {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "all") params.delete("type");
    else params.set("type", next);
    const qs = params.toString();
    router.replace(qs ? `/reviews?${qs}` : "/reviews", { scroll: false });
    setOffset(0);
  }

  const filterChips = (
    <div className="flex items-center gap-2">
      {STATUS_FILTERS.map((chip) => {
        const active = chip.value === statusFilter;
        const m = chip.value === "all" ? null : statusMeta(chip.value);
        return (
          <button
            key={chip.value}
            onClick={() => handleFilterChange(chip.value)}
            className="rounded-full border px-3 py-1 text-xs font-medium transition-colors"
            style={{
              borderColor: active ? (m ? m.dot : "#111827") : "oklch(0.85 0.01 260 / 0.4)",
              backgroundColor: active ? (m ? m.bg : "#11182715") : "transparent",
              color: active ? (m ? m.fg : "#111827") : "#6B7280",
            }}
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );

  // A tenant with one deliverable type gets nothing from a one-chip
  // type row; suppress until 2+ types appear in the history.
  const typeList = types.data ?? [];
  const typeChips = typeList.length >= 2 ? (
    <div className="flex items-center gap-2 overflow-x-auto pb-1">
      <button
        onClick={() => handleTypeChange("all")}
        className="rounded-full border px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap"
        style={{
          borderColor: typeFilter === "all" ? "#111827" : "oklch(0.85 0.01 260 / 0.4)",
          backgroundColor: typeFilter === "all" ? "#11182715" : "transparent",
          color: typeFilter === "all" ? "#111827" : "#6B7280",
        }}
      >
        All types
      </button>
      {typeList.map((t) => {
        const active = t.deliverableType === typeFilter;
        return (
          <button
            key={t.deliverableType}
            onClick={() => handleTypeChange(t.deliverableType)}
            className="rounded-full border px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap"
            style={{
              borderColor: active ? "#111827" : "oklch(0.85 0.01 260 / 0.4)",
              backgroundColor: active ? "#11182715" : "transparent",
              color: active ? "#111827" : "#6B7280",
            }}
          >
            {typeChipLabel(t.deliverableType)}
            <span className="ml-1.5 text-[10px] text-text-muted">{t.count}</span>
          </button>
        );
      })}
    </div>
  ) : null;

  // A single-hire tenant doesn't need a filter row; suppress until 2+ exist.
  const employeeList = employees.data ?? [];
  const employeeChips = employeeList.length >= 2 ? (
    <div className="flex items-center gap-2 overflow-x-auto pb-1">
      <button
        onClick={() => handleEmployeeChange("all")}
        className="rounded-full border px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap"
        style={{
          borderColor: employeeFilter === "all" ? "#111827" : "oklch(0.85 0.01 260 / 0.4)",
          backgroundColor: employeeFilter === "all" ? "#11182715" : "transparent",
          color: employeeFilter === "all" ? "#111827" : "#6B7280",
        }}
      >
        All hires
      </button>
      {employeeList.map((emp) => {
        const active = emp.id === employeeFilter;
        const rm = roleMeta(emp.roleType);
        return (
          <button
            key={emp.id}
            onClick={() => handleEmployeeChange(emp.id)}
            className="rounded-full border px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap"
            style={{
              borderColor: active ? rm.solid : "oklch(0.85 0.01 260 / 0.4)",
              backgroundColor: active ? rm.tint : "transparent",
              color: active ? rm.text : "#6B7280",
            }}
          >
            {emp.name}
          </button>
        );
      })}
    </div>
  ) : null;

  if (history.isLoading) {
    return (
      <div className="space-y-3">
        {employeeChips}
        {typeChips}
        {filterChips}
        <p className="text-sm text-text-muted px-1">Loading history...</p>
      </div>
    );
  }

  if (items.length === 0 && offset === 0) {
    const activeEmployee = employeeFilter === "all"
      ? null
      : employeeList.find((e) => e.id === employeeFilter) ?? null;
    const employeePart = activeEmployee ? ` for ${activeEmployee.name}` : "";
    const typePart = typeFilter === "all" ? "" : ` of type ${typeChipLabel(typeFilter)}`;
    const scopeSuffix = `${employeePart}${typePart}`;

    return (
      <div className="space-y-3">
        {employeeChips}
        {typeChips}
        {filterChips}
        <GlassCard hoverable={false} className="p-6">
          <p className="text-sm text-text-muted text-center">
            {statusFilter === "rejected"
              ? `No rejected deliverables yet${scopeSuffix}. Reject from /review/[id] to start an avoid-pattern history.`
              : statusFilter === "approved"
                ? `No approved deliverables yet${scopeSuffix}.`
                : `No completed reviews yet${scopeSuffix}. Approved or rejected deliverables show up here.`}
          </p>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {employeeChips}
      {typeChips}
      <div className="flex items-center justify-between gap-3">
        {filterChips}
        <p className="text-[11px] text-text-muted">
          <kbd className="rounded border border-gray-200 bg-white px-1 py-0.5 text-[10px] font-medium">J</kbd>
          {" / "}
          <kbd className="rounded border border-gray-200 bg-white px-1 py-0.5 text-[10px] font-medium">K</kbd>
          {" walk "}
          <kbd className="rounded border border-gray-200 bg-white px-1 py-0.5 text-[10px] font-medium">↵</kbd>
          {" open"}
        </p>
      </div>
      {items.map((item, i) => {
        const meta = statusMeta(item.status);
        const empColor = roleMeta(item.employeeRoleType).text;
        const finalisedAt = item.approvedAt ?? item.updatedAt;
        const Icon = STATUS_ICONS[item.status] ?? Check;
        const isActive = i === activeIndex;

        return (
          <Link
            key={item.id}
            href={`/review/${item.id}`}
            ref={(el) => {
              itemRefs.current[i] = el;
            }}
            onMouseEnter={() => setActiveIndex(i)}
          >
            <GlassCard
              className="p-4 transition-shadow"
              style={isActive ? { boxShadow: `0 0 0 2px ${meta.dot}40` } : undefined}
            >
              <div className="flex items-start gap-3">
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-full text-white shrink-0"
                  style={{ backgroundColor: meta.fg }}
                  aria-label={meta.label}
                >
                  <Icon size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{item.title}</p>
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0"
                      style={{
                        backgroundColor: meta.bg,
                        color: meta.fg,
                      }}
                    >
                      {meta.label}
                    </span>
                  </div>
                  <p className="text-xs text-text-secondary truncate mt-0.5">
                    <span style={{ color: empColor }} className="font-medium">
                      {item.employeeName ?? "Unknown"}
                    </span>
                    {" "}&middot;{" "}
                    {item.deliverableType.replace(/_/g, " ")}
                    {item.taskTitle ? ` · ${item.taskTitle}` : ""}
                  </p>
                  {item.approvalRationale && (
                    <p className="mt-1 text-xs text-text-muted line-clamp-2">
                      &ldquo;{item.approvalRationale}&rdquo;
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[11px] text-text-muted">
                    {relativeDate(finalisedAt)}
                  </p>
                  <p className="text-[10px] text-text-muted mt-0.5">v{item.version}</p>
                </div>
              </div>
            </GlassCard>
          </Link>
        );
      })}

      <div className="flex items-center justify-between pt-2">
        <button
          onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          disabled={offset === 0 || history.isFetching}
          className="rounded-lg border border-[oklch(0.8_0.01_260/0.2)] px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-[oklch(0.97_0.005_260/0.5)] disabled:opacity-30"
        >
          Newer
        </button>
        <p className="text-[11px] text-text-muted">
          Showing {offset + 1}-{offset + items.length}
        </p>
        <button
          onClick={() => setOffset(offset + PAGE_SIZE)}
          disabled={items.length < PAGE_SIZE || history.isFetching}
          className="rounded-lg border border-[oklch(0.8_0.01_260/0.2)] px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-[oklch(0.97_0.005_260/0.5)] disabled:opacity-30"
        >
          Older
        </button>
      </div>
    </div>
  );
}
