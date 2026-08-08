"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import { Monogram } from "@/components/monogram";

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

const RESPONSES = [
  { value: "used", label: "Used it", cls: "border-state-accepted text-state-accepted hover:bg-state-accepted hover:text-white" },
  { value: "edited", label: "Edited it", cls: "border-identity-deep text-identity-deep hover:bg-identity-deep hover:text-white" },
  { value: "not_used", label: "Did not use it", cls: "border-state-failed text-state-failed hover:bg-state-failed hover:text-white" },
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
    <section aria-label="Check-ins" className="panel p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[15px] font-semibold">Check-ins</h2>
        <Link href="/checkins" className="spec-label transition-colors hover:text-ink">
          View all
        </Link>
      </div>

      <ul className="mt-1">
        {visible.map((c) => {
          const emp = employeeById.get(c.aiEmployeeId);
          const scheduledLabel = formatScheduled(c.scheduledFor);
          const isOverdue =
            c.scheduledFor !== null && new Date(c.scheduledFor).getTime() < Date.now();

          return (
            <li key={c.id} className="hairline-b py-3 last:border-b-0 last:pb-1">
              <div className="flex items-start gap-2.5">
                <Monogram name={emp?.name ?? "?"} roleType={emp?.roleType} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] leading-snug font-medium">
                    Did you use {emp?.name ? `${emp.name}'s` : "this"} draft
                    {c.deliverableTitle ? `, “${c.deliverableTitle}”` : ""}?
                  </p>
                  <p className="spec mt-0.5 text-[10px] text-ink-muted">
                    {c.deliverableType ? `${c.deliverableType.replace(/_/g, " ")} · ` : ""}
                    <span className={isOverdue ? "text-identity-deep" : undefined}>
                      {scheduledLabel}
                    </span>
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {RESPONSES.map((btn) => (
                      <button
                        key={btn.value}
                        onClick={() => {
                          setDismissed((prev) => ({ ...prev, [c.id]: btn.value }));
                          acknowledge.mutate({ checkInId: c.id, response: btn.value });
                        }}
                        disabled={acknowledge.isPending}
                        className={`rounded-[2px] border bg-bg px-2.5 py-1 text-[12px] font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50 ${btn.cls}`}
                      >
                        {btn.label}
                      </button>
                    ))}
                    <Link
                      href={`/checkins/${c.id}`}
                      className="rounded-[2px] border border-hairline px-2.5 py-1 text-[12px] font-medium text-ink-secondary transition-colors duration-150 hover:border-ink hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                    >
                      Add note
                    </Link>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {Object.keys(dismissed).length > 0 && (
        <p className="spec mt-2 text-[10px] text-ink-muted">
          {Object.keys(dismissed).length} answered. The ledger records it.
        </p>
      )}
    </section>
  );
}

function formatScheduled(raw: string | null): string {
  if (!raw) return "unscheduled";
  const d = new Date(raw);
  const diff = d.getTime() - Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  if (diff < -dayMs) return `${Math.round(-diff / dayMs)}d overdue`;
  if (diff < 0) return "overdue today";
  if (diff < dayMs) {
    const hours = Math.round(diff / (60 * 60 * 1000));
    return hours <= 1 ? "due within the hour" : `due in ${hours}h`;
  }
  if (diff < 7 * dayMs) return `due ${d.toLocaleDateString("en-US", { weekday: "long" })}`;
  return `due ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}
