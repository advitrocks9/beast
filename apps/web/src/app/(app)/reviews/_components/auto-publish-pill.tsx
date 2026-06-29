"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import { GlassCard } from "@beast/ui";
import { Send, X } from "lucide-react";

const WINDOW_SECONDS = 60;

function secondsRemaining(publishAfter: Date | string | null): number {
  if (!publishAfter) return 0;
  const target = new Date(publishAfter).getTime();
  return Math.max(0, Math.round((target - Date.now()) / 1000));
}

export function AutoPublishPill() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [, forceTick] = useState(0);

  const list = useQuery({
    ...trpc.deliverables.pendingAutoPublish.queryOptions(),
    refetchInterval: 15_000,
  });

  const cancel = useMutation({
    ...trpc.deliverables.cancelAutoPublish.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.deliverables.pendingAutoPublish.queryOptions().queryKey,
      });
    },
  });

  useEffect(() => {
    const id = setInterval(() => forceTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const items = list.data ?? [];
  if (items.length === 0) return null;

  return (
    <GlassCard hoverable={false} className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Send size={14} className="text-brand" />
        <p className="text-sm font-medium">
          {items.length} {items.length === 1 ? "deliverable" : "deliverables"} publishing soon
        </p>
        <p className="text-xs text-text-muted">Cancel any time before the window elapses.</p>
      </div>

      <div className="space-y-3">
        {items.map((item) => {
          const left = secondsRemaining(item.publishAfter);
          const pct = Math.max(0, Math.min(100, ((WINDOW_SECONDS - left) / WINDOW_SECONDS) * 100));
          const platform = item.deliverableType.replace("social_", "").replace("_", " ");
          const cancelling = cancel.isPending && cancel.variables?.deliverableId === item.id;
          return (
            <div key={item.id} className="rounded-xl border border-[oklch(0.85_0.01_260/0.4)] bg-white p-3">
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{item.title}</p>
                  <p className="text-[11px] text-text-muted">
                    {platform} · publishing in {left}s
                  </p>
                </div>
                <button
                  onClick={() => cancel.mutate({ deliverableId: item.id })}
                  disabled={cancelling || left === 0}
                  className="flex items-center gap-1 rounded-lg border border-error bg-white px-2.5 py-1 text-xs font-medium text-error hover:bg-[oklch(0.97_0.05_25)] disabled:opacity-50"
                >
                  <X size={12} />
                  {cancelling ? "Cancelling..." : "Cancel"}
                </button>
              </div>
              <div className="h-1 w-full rounded-full bg-[oklch(0.95_0.005_260)] overflow-hidden">
                <div
                  className="h-full bg-brand transition-[width] duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}
