"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import { GlassCard } from "@beast/ui";

const FREQUENCIES: Array<{ value: "daily" | "weekly" | "per_task"; label: string }> = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "per_task", label: "Per task" },
];

interface Props {
  employeeId: string;
  initialFrequency: "daily" | "weekly" | "per_task";
}

export function CheckInFrequencyPicker({ employeeId, initialFrequency }: Props) {
  const router = useRouter();
  const trpc = useTRPC();
  const update = useMutation(trpc.employees.updateCheckInFrequency.mutationOptions());
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(initialFrequency);

  const currentLabel =
    FREQUENCIES.find((f) => f.value === current)?.label ?? current;

  function pick(value: typeof current) {
    if (value === current) {
      setOpen(false);
      return;
    }
    const previous = current;
    setCurrent(value);
    setOpen(false);
    update.mutate(
      { employeeId, frequency: value },
      {
        onError: () => {
          setCurrent(previous);
        },
        onSuccess: () => router.refresh(),
      },
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="block w-full text-center"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <GlassCard hoverable={false} className="p-4 transition-colors hover:bg-gray-50">
          <p className="font-(--font-display) text-2xl font-bold tracking-tight">
            {currentLabel}
          </p>
          <p className="mt-0.5 text-xs text-text-secondary">Check-in</p>
        </GlassCard>
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute left-1/2 top-full z-20 mt-1 w-40 -translate-x-1/2 rounded-xl border border-gray-200 bg-white py-1 shadow-md"
        >
          {FREQUENCIES.map((f) => {
            const active = f.value === current;
            return (
              <li key={f.value} role="option" aria-selected={active}>
                <button
                  type="button"
                  onClick={() => pick(f.value)}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                    active ? "font-medium text-text" : "text-text-secondary"
                  }`}
                >
                  <span>{f.label}</span>
                  {active && (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6.5L5 9.5L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
