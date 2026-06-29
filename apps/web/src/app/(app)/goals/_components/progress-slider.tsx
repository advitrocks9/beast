"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";

interface ProgressSliderProps {
  goalId: string;
  initialPct: number;
  size?: "default" | "compact";
}

function pickColor(pct: number): string {
  if (pct >= 75) return "#22C55E";
  if (pct >= 40) return "#F59E0B";
  return "#3B82F6";
}

export function ProgressSlider({
  goalId,
  initialPct,
  size = "default",
}: ProgressSliderProps) {
  const trpc = useTRPC();
  const router = useRouter();
  const update = useMutation(trpc.goals.updateProgress.mutationOptions());
  const [pct, setPct] = useState(clamp(initialPct));
  const [savedPct, setSavedPct] = useState(clamp(initialPct));
  const color = pickColor(pct);

  const isCompact = size === "compact";

  function commit(value: number) {
    if (value === savedPct) return;
    update.mutate(
      { goalId, progressPct: value },
      {
        onSuccess: () => {
          setSavedPct(value);
          router.refresh();
        },
        onError: () => {
          setPct(savedPct);
        },
      },
    );
  }

  return (
    <div className={isCompact ? "" : "mt-1"}>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={pct}
          onInput={(e) => setPct(Number((e.target as HTMLInputElement).value))}
          onChange={(e) => commit(Number((e.target as HTMLInputElement).value))}
          aria-label="Goal progress"
          className="flex-1 cursor-pointer"
          style={{ accentColor: color }}
          disabled={update.isPending}
        />
        <span
          className={
            isCompact
              ? "shrink-0 text-xs font-medium tabular-nums"
              : "shrink-0 text-sm font-bold tabular-nums"
          }
          style={{ color }}
        >
          {pct}%
        </span>
      </div>
    </div>
  );
}

function clamp(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}
