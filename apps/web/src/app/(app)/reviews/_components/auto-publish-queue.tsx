"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";

const WINDOW_SECONDS = 60;

function secondsRemaining(publishAfter: Date | string | null): number {
  if (!publishAfter) return 0;
  const target = new Date(publishAfter).getTime();
  return Math.max(0, Math.round((target - Date.now()) / 1000));
}

export function AutoPublishQueue() {
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
    <section aria-label="Publish queue" className="panel-tinted mt-4 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[14px] font-semibold">Publish queue</h2>
        <p className="spec-label">Cancel any time before the window closes</p>
      </div>
      <ul className="mt-2">
        {items.map((item) => {
          const left = secondsRemaining(item.publishAfter);
          const pct = Math.max(0, Math.min(100, ((WINDOW_SECONDS - left) / WINDOW_SECONDS) * 100));
          const platform = item.deliverableType.replace("social_", "").replace("_", " ");
          const cancelling = cancel.isPending && cancel.variables?.deliverableId === item.id;
          return (
            <li key={item.id} className="hairline-t py-2.5 first:border-t-0 first:pt-0">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-medium">{item.title}</p>
                  <p className="spec mt-0.5 text-ink-muted">
                    {platform} · publishing in {left}s
                  </p>
                </div>
                <button
                  onClick={() => cancel.mutate({ deliverableId: item.id })}
                  disabled={cancelling || left === 0}
                  className="btn-ghost px-3 py-1.5 text-[12px] text-state-failed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
                >
                  {cancelling ? "Cancelling..." : "Cancel"}
                </button>
              </div>
              <div className="mt-2 h-[3px] w-full overflow-hidden bg-hairline">
                <div
                  className="h-full bg-identity transition-[width] duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
