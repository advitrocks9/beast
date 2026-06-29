"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import { BRAND, statusMeta } from "@/lib/colors";

interface ProgressSliderProps {
  goalId: string;
  initialPct: number;
  size?: "default" | "compact";
}

const COMPLETE = statusMeta("completed").fg;

function pickColor(pct: number): string {
  return pct >= 100 ? COMPLETE : BRAND;
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
          className="progress-range flex-1 cursor-pointer"
          style={{
            background: `linear-gradient(to right, ${color} ${pct}%, oklch(0.9 0.006 264) ${pct}%)`,
            "--thumb-color": color,
          } as React.CSSProperties}
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
