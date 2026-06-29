"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import { GlassCard } from "@beast/ui";

interface InlineCheckIn {
  id: string;
  aiEmployeeId: string;
  scheduledFor: string | null;
  deliverableTitle: string | null;
  deliverableType: string | null;
}

interface InlineEmployee {
  id: string;
  name: string;
  roleType: string;
}

interface CheckInsInlineProps {
  checkIns: InlineCheckIn[];
  employees: InlineEmployee[];
}

const ROLE_COLORS: Record<string, string> = {
  marketing: "#E87B35",
  sales: "#3B82F6",
  support: "#22C55E",
};

const RESPONSE_BUTTONS = [
  { value: "used", label: "Used it", color: "#166534", bg: "#dcfce7" },
  { value: "edited", label: "Edited it", color: "#92400e", bg: "#fef3c7" },
  { value: "not_used", label: "Did not use it", color: "#991b1b", bg: "#fee2e2" },
];

export function CheckInsInline({ checkIns, employees }: CheckInsInlineProps) {
  const [dismissed, setDismissed] = useState<Record<string, string>>({});
  const trpc = useTRPC();
  const acknowledge = useMutation(trpc.checkIns.acknowledge.mutationOptions());

  const employeeById = new Map(employees.map((e) => [e.id, e]));
  const visible = checkIns.filter((c) => !dismissed[c.id]);

  if (visible.length === 0 && Object.keys(dismissed).length === 0) {
    return null;
  }

  return (
    <section>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="heading-gradient text-lg font-semibold">Check-ins</h2>
        <Link
          href="/checkins"
          className="text-xs font-medium text-text-secondary hover:text-foreground"
        >
          View all &rarr;
        </Link>
      </div>

      <div className="space-y-2">
        {visible.map((c) => {
          const emp = employeeById.get(c.aiEmployeeId);
          const roleHex = emp ? ROLE_COLORS[emp.roleType] ?? "#9CA3AF" : "#9CA3AF";
          const scheduledLabel = formatScheduled(c.scheduledFor);
          const isOverdue =
            c.scheduledFor !== null &&
            new Date(c.scheduledFor).getTime() < Date.now();

          return (
            <GlassCard key={c.id} hoverable={false} className="p-4">
              <div className="flex items-start gap-3">
                <span
                  className="mt-1 h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: roleHex }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {c.deliverableTitle ?? "Check-in"}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-text-muted">
                    {emp && <span>{emp.name}</span>}
                    {c.deliverableType && (
                      <span>{c.deliverableType.replace(/_/g, " ")}</span>
                    )}
                    <span style={{ color: isOverdue ? "#B45309" : undefined }}>
                      {scheduledLabel}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-text-secondary">
                    Did you end up using {emp?.name ? `${emp.name}'s` : "this"} draft?
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {RESPONSE_BUTTONS.map((btn) => (
                      <button
                        key={btn.value}
                        onClick={() => {
                          setDismissed((prev) => ({ ...prev, [c.id]: btn.value }));
                          acknowledge.mutate({
                            checkInId: c.id,
                            response: btn.value,
                          });
                        }}
                        disabled={acknowledge.isPending}
                        className="rounded-full border px-3 py-1 text-xs font-medium transition-colors hover:opacity-90"
                        style={{
                          borderColor: btn.color,
                          color: btn.color,
                          backgroundColor: btn.bg,
                        }}
                      >
                        {btn.label}
                      </button>
                    ))}
                    <Link
                      href={`/checkins/${c.id}`}
                      className="rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-text-secondary hover:bg-gray-50"
                    >
                      Add note
                    </Link>
                  </div>
                </div>
              </div>
            </GlassCard>
          );
        })}

        {Object.keys(dismissed).length > 0 && (
          <p className="px-1 text-[11px] text-text-muted">
            {Object.keys(dismissed).length} answered just now. Refresh to update
            the count.
          </p>
        )}
      </div>
    </section>
  );
}

function formatScheduled(raw: string | null): string {
  if (!raw) return "Unscheduled";
  const d = new Date(raw);
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  if (diff < -dayMs) {
    const days = Math.round(-diff / dayMs);
    return `${days}d overdue`;
  }
  if (diff < 0) return "Overdue today";
  if (diff < dayMs) {
    const hours = Math.round(diff / (60 * 60 * 1000));
    if (hours <= 1) return "Due in under an hour";
    return `Due in ${hours}h`;
  }
  if (diff < 7 * dayMs) {
    return `Due ${d.toLocaleDateString("en-US", { weekday: "long" })}`;
  }
  return `Due ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}
