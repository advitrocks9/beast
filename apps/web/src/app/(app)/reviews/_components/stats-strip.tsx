"use client";

import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import { statusMeta } from "@/lib/colors";

export function StatsStrip() {
  const trpc = useTRPC();
  const stats = useQuery(trpc.reviews.stats.queryOptions());

  if (!stats.data) return null;

  const { pendingCount, approvedThisWeek, publishedThisWeek, rejectedThisWeek } = stats.data;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <Stat label="Pending" value={pendingCount} status="pending" />
      <Stat label="Approved (7d)" value={approvedThisWeek} status="approved" />
      <Stat label="Published (7d)" value={publishedThisWeek} status="published" />
      <Stat label="Rejected (7d)" value={rejectedThisWeek} status="rejected" />
    </div>
  );
}

function Stat({ label, value, status }: { label: string; value: number; status: string }) {
  const m = statusMeta(status);
  return (
    <div
      className="rounded-xl border px-4 py-3"
      style={{ borderColor: `${m.dot}30`, backgroundColor: m.bg }}
    >
      <p className="text-2xl font-semibold" style={{ color: m.fg }}>
        {value}
      </p>
      <p className="text-xs text-text-secondary mt-0.5">{label}</p>
    </div>
  );
}
