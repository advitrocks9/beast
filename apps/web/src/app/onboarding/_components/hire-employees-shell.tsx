"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { useTRPC } from "@/trpc/client";
import { cn } from "@/lib/utils";
import { Monogram } from "@/components/monogram";
import { OnboardingStepIndicator } from "./step-indicator";

type RoleType = "marketing" | "sales" | "support";

interface EmployeeOption {
  roleType: RoleType;
  name: string;
  roleTitle: string;
  description: string;
}

interface HireEmployeesShellProps {
  companyName: string;
  employeeOptions: EmployeeOption[];
}

export function HireEmployeesShell({ companyName, employeeOptions }: HireEmployeesShellProps) {
  const [selectedRoles, setSelectedRoles] = useState<Set<RoleType>>(
    () => new Set(employeeOptions.map((o) => o.roleType)),
  );
  const [error, setError] = useState<string | null>(null);

  const trpc = useTRPC();
  const hireEmployee = useMutation(trpc.employees.hire.mutationOptions());
  const completeHiring = useMutation(trpc.onboarding.completeHiring.mutationOptions());
  const [hiring, setHiring] = useState(false);
  const [hired, setHired] = useState<Set<RoleType>>(new Set());

  function toggleRole(role: RoleType) {
    setSelectedRoles((prev) => {
      const next = new Set(prev);
      if (next.has(role)) {
        next.delete(role);
      } else {
        next.add(role);
      }
      return next;
    });
  }

  async function handleHire() {
    setHiring(true);
    setError(null);
    try {
      for (const role of selectedRoles) {
        await hireEmployee.mutateAsync({ roleType: role });
        setHired((prev) => new Set([...prev, role]));
      }

      await completeHiring.mutateAsync();
      window.location.href = "/dashboard";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Hiring failed. Try again.");
      setHiring(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="rule-b flex flex-wrap items-end justify-between gap-3 px-6 pt-5 pb-4">
        <div>
          <p className="spec-label">Beast · founding paperwork</p>
          <h1 className="display-caps mt-1 text-2xl">Founding roster</h1>
          <p className="spec mt-1.5 text-ink-muted">
            {companyName} · {selectedRoles.size} selected
          </p>
          <div className="mt-2.5">
            <OnboardingStepIndicator currentStep={2} />
          </div>
        </div>
        <button
          onClick={handleHire}
          disabled={selectedRoles.size === 0 || hiring}
          className="btn-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:pointer-events-none disabled:opacity-50"
        >
          {hiring
            ? `Hiring ${hired.size}/${selectedRoles.size}…`
            : `Hire ${selectedRoles.size} employee${selectedRoles.size !== 1 ? "s" : ""}`}
        </button>
      </header>

      <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-6">
        <p className="text-[13.5px] text-ink-secondary">
          Three employees are on offer. Pick who joins on day one; the roster can grow later.
        </p>

        {error && (
          <p className="mt-3 border border-state-failed/40 bg-state-failed/5 px-3.5 py-2.5 text-sm text-state-failed">
            {error}
          </p>
        )}

        <div role="group" aria-label="Roster candidates" className="mt-4 space-y-3">
          {employeeOptions.map((option) => {
            const selected = selectedRoles.has(option.roleType);
            return (
              <button
                key={option.roleType}
                type="button"
                role="checkbox"
                aria-checked={selected}
                onClick={() => toggleRole(option.roleType)}
                className={cn(
                  "flex w-full items-start gap-4 rounded-[2px] border p-4 text-left transition-colors duration-150",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
                  selected ? "border-ink bg-bg" : "border-hairline bg-bg hover:bg-panel",
                )}
              >
                <Monogram name={option.name} roleType={option.roleType} size="xl" />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[15px] leading-tight font-semibold">{option.name}</span>
                    <span className="spec-label">{option.roleTitle}</span>
                  </span>
                  <span className="mt-1 block text-[13px] leading-snug text-ink-secondary">
                    {option.description}
                  </span>
                </span>
                <span
                  aria-hidden
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-[2px] border transition-colors duration-150",
                    selected ? "border-ink bg-ink text-white" : "border-hairline",
                  )}
                >
                  {selected && <Check size={13} strokeWidth={2.5} />}
                </span>
              </button>
            );
          })}
        </div>

        <p className="hairline-t mt-6 pt-3 text-[13px] leading-snug text-ink-secondary">
          Every employee starts on draft duty: everything they produce lands in your review tray
          before it ships. Autonomy is earned through your sign-offs.
        </p>
      </div>
    </div>
  );
}
