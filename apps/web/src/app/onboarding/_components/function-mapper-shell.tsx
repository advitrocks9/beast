"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import { GlassCard } from "@beast/ui";
import { OnboardingStepIndicator } from "./step-indicator";

type FunctionMode = "ai" | "ai_human" | "human";

interface FunctionItem {
  name: string;
  mode: FunctionMode;
}

interface DepartmentConfig {
  name: string;
  functions: FunctionItem[];
}

const PRESET_DEPARTMENTS: DepartmentConfig[] = [
  {
    name: "Marketing",
    functions: [
      { name: "Content Writing", mode: "ai" },
      { name: "Social Media", mode: "ai" },
      { name: "Email Marketing", mode: "ai" },
      { name: "SEO", mode: "ai" },
      { name: "Analytics & Reporting", mode: "ai" },
    ],
  },
  {
    name: "Sales",
    functions: [
      { name: "Lead Generation", mode: "ai" },
      { name: "Cold Outreach", mode: "ai" },
      { name: "Follow-up Sequences", mode: "ai" },
      { name: "Proposal Writing", mode: "ai" },
      { name: "Pipeline Management", mode: "human" },
    ],
  },
  {
    name: "Support",
    functions: [
      { name: "Customer Support", mode: "ai" },
      { name: "FAQ Management", mode: "ai" },
      { name: "Ticket Triage", mode: "ai" },
      { name: "Knowledge Base Updates", mode: "ai" },
      { name: "Customer Feedback", mode: "human" },
    ],
  },
];

const MODE_LABELS: Record<FunctionMode, string> = {
  ai: "Full AI",
  ai_human: "AI + Human",
  human: "Human",
};

const MODE_COLORS: Record<FunctionMode, { bg: string; text: string; ring: string }> = {
  ai: { bg: "bg-blue-50", text: "text-blue-700", ring: "ring-blue-200" },
  ai_human: { bg: "bg-purple-50", text: "text-purple-700", ring: "ring-purple-200" },
  human: { bg: "bg-gray-50", text: "text-gray-600", ring: "ring-gray-200" },
};

function ModeToggle({
  mode,
  onChange,
}: {
  mode: FunctionMode;
  onChange: (mode: FunctionMode) => void;
}) {
  const modes: FunctionMode[] = ["ai", "ai_human", "human"];

  return (
    <div className="flex gap-1">
      {modes.map((m) => {
        const active = mode === m;
        const colors = MODE_COLORS[m];
        return (
          <button
            key={m}
            onClick={() => onChange(m)}
            className={`relative rounded-full px-2.5 py-1 text-xs font-medium transition-all ${
              active
                ? `${colors.bg} ${colors.text} ring-1 ${colors.ring}`
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            {MODE_LABELS[m]}
            {m === "ai_human" && (
              <span className="ml-1 rounded bg-purple-200 px-1 py-0.5 text-[10px] font-semibold text-purple-700">
                V2
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function DepartmentColumn({
  department,
  onUpdateFunction,
  onAddFunction,
  onRemoveFunction,
}: {
  department: DepartmentConfig;
  onUpdateFunction: (fnIndex: number, mode: FunctionMode) => void;
  onAddFunction: () => void;
  onRemoveFunction: (fnIndex: number) => void;
}) {
  const aiCount = department.functions.filter((f) => f.mode === "ai").length;

  return (
    <GlassCard hoverable={false} className="flex flex-col p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-(--font-display) text-lg font-bold tracking-tight">
          {department.name}
        </h3>
        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">
          {aiCount} AI
        </span>
      </div>

      <div className="flex-1 space-y-2">
        {department.functions.map((fn, i) => (
          <div
            key={i}
            className="group flex items-center justify-between rounded-xl border border-[oklch(0.8_0.01_260/0.1)] bg-white px-3 py-2.5"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{fn.name}</span>
              <button
                onClick={() => onRemoveFunction(i)}
                className="hidden text-text-muted hover:text-red-500 group-hover:inline-flex"
                title="Remove function"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <ModeToggle mode={fn.mode} onChange={(mode) => onUpdateFunction(i, mode)} />
          </div>
        ))}
      </div>

      <button
        onClick={onAddFunction}
        className="mt-3 flex items-center gap-1.5 rounded-lg border border-dashed border-[oklch(0.8_0.01_260/0.2)] px-3 py-2 text-xs font-medium text-text-secondary transition-colors hover:border-accent hover:text-accent"
      >
        <span>+</span> Add function
      </button>
    </GlassCard>
  );
}

interface FunctionMapperShellProps {
  companyName: string;
}

export function FunctionMapperShell({ companyName }: FunctionMapperShellProps) {
  const [depts, setDepts] = useState<DepartmentConfig[]>(
    PRESET_DEPARTMENTS.map((d) => ({
      ...d,
      functions: d.functions.map((f) => ({ ...f })),
    })),
  );
  const [addingTo, setAddingTo] = useState<number | null>(null);
  const [newFnName, setNewFnName] = useState("");

  const trpc = useTRPC();
  const saveFunctions = useMutation(trpc.onboarding.saveFunctions.mutationOptions());

  function updateFunctionMode(deptIndex: number, fnIndex: number, mode: FunctionMode) {
    setDepts((prev) => {
      const next = prev.map((d) => ({ ...d, functions: d.functions.map((f) => ({ ...f })) }));
      next[deptIndex]!.functions[fnIndex]!.mode = mode;
      return next;
    });
  }

  function removeFunction(deptIndex: number, fnIndex: number) {
    setDepts((prev) => {
      const next = prev.map((d) => ({ ...d, functions: [...d.functions] }));
      next[deptIndex]!.functions.splice(fnIndex, 1);
      return next;
    });
  }

  function addFunction(deptIndex: number) {
    if (addingTo === deptIndex && newFnName.trim()) {
      setDepts((prev) => {
        const next = prev.map((d) => ({ ...d, functions: [...d.functions] }));
        next[deptIndex]!.functions.push({ name: newFnName.trim(), mode: "ai" });
        return next;
      });
      setNewFnName("");
      setAddingTo(null);
    } else {
      setAddingTo(deptIndex);
      setNewFnName("");
    }
  }

  async function handleContinue() {
    await saveFunctions.mutateAsync({ departments: depts });
    window.location.href = "/onboarding";
  }

  const totalAi = depts.reduce(
    (sum, d) => sum + d.functions.filter((f) => f.mode === "ai").length,
    0,
  );
  const totalFunctions = depts.reduce((sum, d) => sum + d.functions.length, 0);

  return (
    <div className="flex min-h-screen flex-col bg-bg-warm">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-[oklch(0.8_0.01_260/0.15)] px-8 py-4">
        <div>
          <h1 className="font-(--font-display) text-xl font-bold tracking-tight">
            Map your functions
          </h1>
          <p className="mt-0.5 text-sm text-text-secondary">
            Choose which functions Beast should handle for {companyName}.
            You can change these anytime.
          </p>
          <div className="mt-2">
            <OnboardingStepIndicator currentStep={2} />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-text-secondary">
            <span className="font-semibold text-accent">{totalAi}</span>/{totalFunctions} set to AI
          </span>
          <button
            onClick={handleContinue}
            disabled={saveFunctions.isPending}
            className="rounded-full bg-black px-5 py-2 text-sm font-medium text-white transition-opacity hover:bg-gray-800 disabled:opacity-50"
          >
            {saveFunctions.isPending ? "Saving..." : "Continue →"}
          </button>
        </div>
      </header>

      {/* Department grid */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 lg:grid-cols-3">
          {depts.map((dept, deptIdx) => (
            <div key={deptIdx}>
              <DepartmentColumn
                department={dept}
                onUpdateFunction={(fnIdx, mode) => updateFunctionMode(deptIdx, fnIdx, mode)}
                onAddFunction={() => addFunction(deptIdx)}
                onRemoveFunction={(fnIdx) => removeFunction(deptIdx, fnIdx)}
              />

              {/* Inline add function input */}
              {addingTo === deptIdx && (
                <div className="mt-2 flex items-center gap-2 px-1">
                  <input
                    autoFocus
                    value={newFnName}
                    onChange={(e) => setNewFnName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newFnName.trim()) addFunction(deptIdx);
                      if (e.key === "Escape") setAddingTo(null);
                    }}
                    placeholder="Function name..."
                    className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                  />
                  <button
                    onClick={() => addFunction(deptIdx)}
                    disabled={!newFnName.trim()}
                    className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-30"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => setAddingTo(null)}
                    className="text-xs text-text-muted hover:text-text"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="mx-auto mt-8 max-w-6xl">
          <div className="flex items-center justify-center gap-6 text-xs text-text-secondary">
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
              <span><strong>Full AI</strong> - Beast handles this entirely</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-purple-500" />
              <span><strong>AI + Human</strong> - collaborative mode <span className="rounded bg-purple-100 px-1 py-0.5 text-[10px] font-semibold text-purple-600">V2</span></span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-gray-400" />
              <span><strong>Human</strong> - your team handles this</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
