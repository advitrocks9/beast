"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Check, ChevronDown } from "lucide-react";
import { useTRPC } from "@/trpc/client";
import { DEMO_MODE } from "@/lib/demo";
import { ProvenanceTag } from "@/components/provenance-tag";

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

  const currentLabel = FREQUENCIES.find((f) => f.value === current)?.label ?? current;

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
    <div className="flex items-center gap-2">
      {DEMO_MODE && <ProvenanceTag kind="stub" />}
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={DEMO_MODE}
          title={DEMO_MODE ? "Check-in cadence is product-mode only" : undefined}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="flex items-center gap-2 rounded-[2px] border border-hairline px-3 py-2 transition-colors duration-150 hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50 disabled:hover:border-hairline"
        >
          <span className="spec-label">Check-in</span>
          <span className="text-[13px] leading-none font-semibold">{currentLabel}</span>
          <ChevronDown size={14} strokeWidth={1.5} className="text-ink-muted" />
        </button>
        {open && (
          <ul
            role="listbox"
            aria-label="Check-in frequency"
            className="panel absolute right-0 top-full z-20 mt-1 w-36 p-1"
          >
            {FREQUENCIES.map((f) => {
              const active = f.value === current;
              return (
                <li key={f.value} role="option" aria-selected={active}>
                  <button
                    type="button"
                    onClick={() => pick(f.value)}
                    className={`flex w-full items-center justify-between rounded-[2px] px-2.5 py-1.5 text-left text-[13px] transition-colors hover:bg-panel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
                      active ? "font-semibold text-ink" : "text-ink-secondary"
                    }`}
                  >
                    <span>{f.label}</span>
                    {active && <Check size={14} strokeWidth={1.5} />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
