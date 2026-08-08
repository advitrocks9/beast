"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import { cn } from "@/lib/utils";

interface ProgressSliderProps {
  goalId: string;
  initialPct: number;
  size?: "default" | "compact";
}

const THUMB =
  "[&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-[3px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-none [&::-webkit-slider-thumb]:bg-ink " +
  "[&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-[3px] [&::-moz-range-thumb]:rounded-none [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-ink";

export function ProgressSlider({ goalId, initialPct, size = "default" }: ProgressSliderProps) {
  const trpc = useTRPC();
  const router = useRouter();
  const update = useMutation(trpc.goals.updateProgress.mutationOptions());
  const [pct, setPct] = useState(clamp(initialPct));
  const [savedPct, setSavedPct] = useState(clamp(initialPct));

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
        disabled={update.isPending}
        className={cn(
          "h-3.5 flex-1 cursor-pointer appearance-none bg-transparent",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
          "disabled:cursor-default disabled:opacity-50",
          THUMB,
        )}
        style={{
          background: `linear-gradient(to right, var(--color-ink) ${pct}%, var(--color-hairline) ${pct}%) left center / 100% 2px no-repeat`,
        }}
      />
      <span
        className={cn(
          "spec shrink-0 text-right text-ink",
          size === "compact" ? "w-8" : "w-10",
        )}
      >
        {pct}%
      </span>
    </div>
  );
}

function clamp(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}
