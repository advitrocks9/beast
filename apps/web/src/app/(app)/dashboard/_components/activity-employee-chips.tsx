"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { roleMeta } from "@/lib/colors";

interface ChipEmployee {
  id: string;
  name: string;
  roleType: string | null;
}

interface ActivityEmployeeChipsProps {
  employees: ChipEmployee[];
  activeEmployeeId: string | null;
}

export function ActivityEmployeeChips({ employees, activeEmployeeId }: ActivityEmployeeChipsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // A single-hire tenant gains nothing from a one-chip filter row.
  if (employees.length < 2) return null;

  function handleChange(next: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === null) params.delete("activityEmployee");
    else params.set("activityEmployee", next);
    const qs = params.toString();
    router.replace(qs ? `/dashboard?${qs}` : "/dashboard", { scroll: false });
  }

  return (
    <div className="mb-2 flex items-center gap-2 overflow-x-auto pb-1">
      <button
        onClick={() => handleChange(null)}
        className="rounded-full border px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap"
        style={{
          borderColor: !activeEmployeeId ? "#111827" : "oklch(0.85 0.01 260 / 0.4)",
          backgroundColor: !activeEmployeeId ? "#11182715" : "transparent",
          color: !activeEmployeeId ? "#111827" : "#6B7280",
        }}
      >
        All hires
      </button>
      {employees.map((emp) => {
        const active = emp.id === activeEmployeeId;
        const m = roleMeta(emp.roleType);
        return (
          <button
            key={emp.id}
            onClick={() => handleChange(emp.id)}
            className="rounded-full border px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap"
            style={{
              borderColor: active ? m.solid : "oklch(0.85 0.01 260 / 0.4)",
              backgroundColor: active ? m.tint : "transparent",
              color: active ? m.text : "#6B7280",
            }}
          >
            {emp.name}
          </button>
        );
      })}
    </div>
  );
}
