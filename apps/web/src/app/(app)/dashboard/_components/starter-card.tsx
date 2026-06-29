"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import { GlassCard } from "@beast/ui";
import { type OnboardingStarter, formatEta } from "@beast/shared";

interface StarterCardProps {
  starter: OnboardingStarter;
  employeeId: string;
  employeeName: string;
  hex: string;
}

export function StarterCard({ starter, employeeId, employeeName, hex }: StarterCardProps) {
  const trpc = useTRPC();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const create = useMutation(trpc.tasks.createFromStarter.mutationOptions());

  async function handleStart() {
    setError(null);
    try {
      await create.mutateAsync({
        starterId: starter.id,
        aiEmployeeId: employeeId,
      });
      router.push(`/employees/${employeeId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start");
    }
  }

  const isPending = create.isPending;

  return (
    <GlassCard hoverable={false} className="flex h-full flex-col p-5">
      <div className="flex items-center gap-2">
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: hex }}
          aria-hidden
        />
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: hex }}>
          {employeeName}
        </p>
      </div>

      <h3 className="mt-3 font-(--font-display) text-base font-semibold tracking-tight">
        {starter.title}
      </h3>

      <details className="group mt-2">
        <summary className="cursor-pointer list-none text-xs leading-relaxed text-text-secondary line-clamp-2 group-open:line-clamp-none">
          {starter.brief}
        </summary>
      </details>

      <div className="mt-auto flex items-center justify-between pt-4">
        <span className="text-xs text-text-muted">ETA {formatEta(starter)}</span>
        <button
          type="button"
          onClick={handleStart}
          disabled={isPending}
          className="rounded-lg bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {isPending ? "Starting..." : "Start"}
        </button>
      </div>

      {error && (
        <p className="mt-2 text-xs text-[oklch(0.55_0.18_30)]">{error}</p>
      )}
    </GlassCard>
  );
}
