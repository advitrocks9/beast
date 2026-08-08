"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import { Monogram } from "@/components/monogram";
import { StateChip } from "@/components/state-chip";
import { ProvenanceTag } from "@/components/provenance-tag";

type StatusFilter = "all" | "accepted" | "rejected" | "published";

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "accepted", label: "Accepted" },
  { value: "rejected", label: "Rejected" },
  { value: "published", label: "Published" },
];

function parseStatusFilter(raw: string | null): StatusFilter {
  if (raw === "accepted" || raw === "rejected" || raw === "published") return raw;
  return "all";
}

function parseIdFilter(raw: string | null): string | "all" {
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

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`spec whitespace-nowrap rounded-[2px] border px-2.5 py-1 uppercase tracking-[0.05em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
        active
          ? "border-ink bg-ink text-white"
          : "border-hairline text-ink-secondary hover:border-ink hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

export function HistoryList() {
  const trpc = useTRPC();
  const router = useRouter();
  const searchParams = useSearchParams();
  const statusFilter = parseStatusFilter(searchParams.get("status"));
  const employeeFilter = parseIdFilter(searchParams.get("employee"));
  const typeFilter = parseIdFilter(searchParams.get("type"));
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

  // A stale activeIndex after a filter swap or page turn would make Enter
  // open a row the founder is not looking at.
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

  function setParam(key: string, next: string | "all") {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "all") params.delete(key);
    else params.set(key, next);
    const qs = params.toString();
    router.replace(qs ? `/reviews?${qs}` : "/reviews", { scroll: false });
    setOffset(0);
  }

  const filterChips = (
    <div className="flex items-center gap-1.5">
      {STATUS_FILTERS.map((chip) => (
        <FilterChip
          key={chip.value}
          active={chip.value === statusFilter}
          onClick={() => setParam("status", chip.value)}
        >
          {chip.label}
        </FilterChip>
      ))}
    </div>
  );

  // One type gives the row nothing to narrow; show it from 2 up.
  const typeList = types.data ?? [];
  const typeChips = typeList.length >= 2 ? (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
      <FilterChip active={typeFilter === "all"} onClick={() => setParam("type", "all")}>
        All types
      </FilterChip>
      {typeList.map((t) => (
        <FilterChip
          key={t.deliverableType}
          active={t.deliverableType === typeFilter}
          onClick={() => setParam("type", t.deliverableType)}
        >
          {typeChipLabel(t.deliverableType)} {t.count}
        </FilterChip>
      ))}
    </div>
  ) : null;

  const employeeList = employees.data ?? [];
  const employeeChips = employeeList.length >= 2 ? (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
      <FilterChip active={employeeFilter === "all"} onClick={() => setParam("employee", "all")}>
        Full roster
      </FilterChip>
      {employeeList.map((emp) => (
        <FilterChip
          key={emp.id}
          active={emp.id === employeeFilter}
          onClick={() => setParam("employee", emp.id)}
        >
          {emp.name}
        </FilterChip>
      ))}
    </div>
  ) : null;

  const filterBlock = (
    <div className="mt-2.5 space-y-1.5">
      {employeeChips}
      {typeChips}
      {filterChips}
    </div>
  );

  if (history.isLoading) {
    return (
      <div>
        {filterBlock}
        <div className="mt-3 space-y-2" aria-hidden>
          <div className="h-10 bg-panel" />
          <div className="h-10 bg-panel" />
          <div className="h-10 bg-panel" />
        </div>
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
      <div>
        {filterBlock}
        <p className="mt-3 text-[13px] text-ink-muted">
          {statusFilter === "rejected"
            ? `No rejections on record${scopeSuffix}. A rejection ends the job and files an avoid-pattern in the manual.`
            : statusFilter === "published"
              ? `Nothing published yet${scopeSuffix}. Accepted work can queue for publishing from its review page.`
              : statusFilter === "accepted"
                ? `Nothing accepted yet${scopeSuffix}.`
                : `No completed reviews yet${scopeSuffix}. Every accept, publish, and reject is logged here.`}
        </p>
      </div>
    );
  }

  return (
    <div>
      {filterBlock}
      <ul className="mt-2">
        {items.map((item, i) => {
          const finalisedAt = item.approvedAt ?? item.updatedAt;
          const isActive = i === activeIndex;
          return (
            <li key={item.id} className="hairline-b last:border-b-0">
              <Link
                href={`/review/${item.id}`}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                onMouseEnter={() => setActiveIndex(i)}
                className={`flex items-center gap-3 py-2.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
                  isActive ? "bg-panel" : "hover:bg-panel"
                }`}
              >
                <Monogram name={item.employeeName ?? "?"} roleType={item.employeeRoleType} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] leading-tight font-medium">
                    {item.title}
                  </span>
                  <span className="spec-label mt-0.5 block truncate">
                    {item.deliverableType.replace(/_/g, " ")} · v{item.version}
                    {item.approvalRationale ? ` · "${item.approvalRationale}"` : ""}
                  </span>
                </span>
                {item.demoSessionId && <ProvenanceTag kind="live" />}
                <StateChip status={item.status} />
                <span className="spec w-16 shrink-0 text-right text-ink-muted">
                  {relativeDate(finalisedAt)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="hairline-t mt-1 flex items-center justify-between pt-2.5">
        <button
          onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          disabled={offset === 0 || history.isFetching}
          className="btn-ghost px-3 py-1.5 text-[12px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-40"
        >
          Newer
        </button>
        <p className="spec text-ink-muted">
          {offset + 1}-{offset + items.length}
        </p>
        <button
          onClick={() => setOffset(offset + PAGE_SIZE)}
          disabled={items.length < PAGE_SIZE || history.isFetching}
          className="btn-ghost px-3 py-1.5 text-[12px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-40"
        >
          Older
        </button>
      </div>
    </div>
  );
}
