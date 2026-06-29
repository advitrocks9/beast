"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import { GlassCard } from "@beast/ui";
import { OnboardingStepIndicator } from "./step-indicator";

type RoleType = "marketing" | "sales" | "support";

interface FunctionInfo {
  id: string;
  name: string;
  departmentName: string;
  mode: string;
}

interface EmployeeOption {
  roleType: RoleType;
  name: string;
  roleTitle: string;
  description: string;
  color: string;
  functions: FunctionInfo[];
}

interface HireEmployeesShellProps {
  companyName: string;
  employeeOptions: EmployeeOption[];
}

const ROLE_META: Record<RoleType, { icon: string; description: string }> = {
  marketing: {
    icon: "A",
    description: "Writes blog posts, social media content, newsletters. Energetic and data-driven.",
  },
  sales: {
    icon: "J",
    description: "Drafts outreach emails, sequences, proposals. Direct, warm, and consultative.",
  },
  support: {
    icon: "S",
    description: "Handles ticket responses, FAQ articles, KB updates. Calm, empathetic, thorough.",
  },
};

const ROLE_COLORS: Record<RoleType, string> = {
  marketing: "#E87B35",
  sales: "#3B82F6",
  support: "#22C55E",
};

function EmployeeCard({
  option,
  selected,
  onToggle,
}: {
  option: EmployeeOption;
  selected: boolean;
  onToggle: () => void;
}) {
  const aiFunctions = option.functions.filter((f) => f.mode === "ai");

  return (
    <GlassCard
      hoverable
      className={`cursor-pointer p-5 transition-all ${
        selected
          ? "ring-2 ring-accent ring-offset-2"
          : "opacity-75 hover:opacity-100"
      }`}
      onClick={onToggle}
    >
      <div className="flex items-start gap-4">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white text-lg font-bold"
          style={{ backgroundColor: ROLE_COLORS[option.roleType] }}
        >
          {option.name[0]}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold">{option.name}</h3>
            <span className="text-sm text-text-secondary">{option.roleTitle}</span>
          </div>
          <p className="mt-1 text-sm text-text-secondary">
            {option.description}
          </p>

          {aiFunctions.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-medium text-text-muted mb-1.5">
                Will handle:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {aiFunctions.map((fn) => (
                  <span
                    key={fn.id}
                    className="rounded-full bg-accent-light px-2.5 py-0.5 text-xs font-medium text-accent"
                  >
                    {fn.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Selection indicator */}
        <div
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
            selected
              ? "border-accent bg-accent text-white"
              : "border-gray-300"
          }`}
        >
          {selected && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </div>
      </div>
    </GlassCard>
  );
}

export function HireEmployeesShell({ companyName, employeeOptions }: HireEmployeesShellProps) {
  // Pre-select employees that have AI functions assigned
  const [selectedRoles, setSelectedRoles] = useState<Set<RoleType>>(() => {
    const initial = new Set<RoleType>();
    for (const opt of employeeOptions) {
      if (opt.functions.some((f) => f.mode === "ai")) {
        initial.add(opt.roleType);
      }
    }
    return initial;
  });

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
    try {
      for (const role of selectedRoles) {
        const option = employeeOptions.find((o) => o.roleType === role);
        if (!option) continue;

        const functionIds = option.functions
          .filter((f) => f.mode === "ai")
          .map((f) => f.id);

        await hireEmployee.mutateAsync({
          roleType: role,
          functionIds,
        });
        setHired((prev) => new Set([...prev, role]));
      }

      await completeHiring.mutateAsync();
      window.location.href = "/dashboard";
    } catch (err) {
      setHiring(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#FAFBFF]">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-[oklch(0.8_0.01_260/0.15)] px-8 py-4">
        <div>
          <h1 className="font-(--font-display) text-xl font-bold tracking-tight">
            Hire your team
          </h1>
          <p className="mt-0.5 text-sm text-text-secondary">
            Choose which AI employees to bring on at {companyName}.
            Based on the functions you set to AI, we recommend hiring these roles.
          </p>
          <div className="mt-2">
            <OnboardingStepIndicator currentStep={3} />
          </div>
        </div>
        <button
          onClick={handleHire}
          disabled={selectedRoles.size === 0 || hiring}
          className="rounded-full bg-black px-5 py-2 text-sm font-medium text-white transition-opacity hover:bg-gray-800 disabled:opacity-50"
        >
          {hiring
            ? `Hiring ${hired.size}/${selectedRoles.size}...`
            : `Hire ${selectedRoles.size} employee${selectedRoles.size !== 1 ? "s" : ""} →`}
        </button>
      </header>

      {/* Employee cards */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="mx-auto max-w-3xl space-y-4">
          {employeeOptions.map((option) => (
            <EmployeeCard
              key={option.roleType}
              option={option}
              selected={selectedRoles.has(option.roleType)}
              onToggle={() => toggleRole(option.roleType)}
            />
          ))}
        </div>

        {selectedRoles.size > 0 && (
          <div className="mx-auto mt-8 max-w-3xl rounded-xl bg-accent-light/50 p-4 text-center">
            <p className="text-sm text-text-secondary">
              Your employees start in <strong>draft mode</strong> - they'll create content for your review before anything goes live.
              You can increase their autonomy over time as you build trust.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
