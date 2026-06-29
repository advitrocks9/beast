"use client";

import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";

const STAT_BG: Record<string, string> = {
  pending: "#F59E0B",
  approved: "#22C55E",
  published: "#3B82F6",
  rejected: "#DC2626",
};

export function StatsStrip() {
  const trpc = useTRPC();
  const stats = useQuery(trpc.reviews.stats.queryOptions());

  if (!stats.data) return null;

  const { pendingCount, approvedThisWeek, publishedThisWeek, rejectedThisWeek } = stats.data;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <Stat label="Pending" value={pendingCount} hex={STAT_BG.pending!} />
      <Stat label="Approved (7d)" value={approvedThisWeek} hex={STAT_BG.approved!} />
      <Stat label="Published (7d)" value={publishedThisWeek} hex={STAT_BG.published!} />
      <Stat label="Rejected (7d)" value={rejectedThisWeek} hex={STAT_BG.rejected!} />
    </div>
  );
}

function Stat({ label, value, hex }: { label: string; value: number; hex: string }) {
  return (
    <div
      className="rounded-xl border px-4 py-3"
      style={{ borderColor: `${hex}30`, backgroundColor: `${hex}08` }}
    >
      <p className="text-2xl font-semibold" style={{ color: hex }}>
        {value}
      </p>
      <p className="text-xs text-text-secondary mt-0.5">{label}</p>
    </div>
  );
}
