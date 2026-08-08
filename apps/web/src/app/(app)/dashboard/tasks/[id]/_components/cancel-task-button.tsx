"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

export function CancelTaskButton({ taskId, taskTitle }: { taskId: string; taskTitle: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const cancel = useMutation(trpc.tasks.cancel.mutationOptions());
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  async function handleCancel(withReason: boolean) {
    await cancel.mutateAsync({
      taskId,
      reason: withReason ? reason.trim() : undefined,
    });
    setOpen(false);
    setReason("");
    router.refresh();
  }

  const reasonReady = reason.trim().length >= 10;

  return (
    <span className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`inline-flex items-center rounded-[2px] border bg-bg px-3 py-1.5 text-[12px] font-semibold text-state-failed transition-colors hover:border-state-failed ${
          open ? "border-state-failed" : "border-hairline"
        } ${FOCUS}`}
      >
        Cancel job
      </button>

      {open && (
        <div className="absolute right-0 top-full z-10 mt-2 w-72 rounded-[2px] border border-ink bg-bg p-4 text-left">
          <p className="text-[13.5px] font-semibold">Cancel &ldquo;{taskTitle}&rdquo;?</p>
          <p className="mt-1 text-[12.5px] leading-snug text-ink-secondary">
            Name what went wrong and it becomes a standing avoid rule for the next run. 10+ characters.
          </p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="e.g. Wrong tone; we never address customers as 'team'."
            className="mt-2.5 w-full resize-none rounded-[2px] border border-hairline bg-bg px-2.5 py-2 text-[13px] outline-none placeholder:text-ink-muted focus-visible:border-ink"
          />
          <div className="mt-2.5 flex flex-wrap gap-2">
            <button
              onClick={() => {
                setOpen(false);
                setReason("");
              }}
              disabled={cancel.isPending}
              className={`btn-ghost disabled:opacity-50 ${FOCUS}`}
            >
              Keep working
            </button>
            <button
              onClick={() => handleCancel(false)}
              disabled={cancel.isPending}
              className={`inline-flex items-center rounded-[2px] border border-hairline bg-bg px-4 py-[9px] text-[13.5px] leading-none font-semibold text-state-failed transition-colors hover:border-state-failed disabled:opacity-50 ${FOCUS}`}
            >
              {cancel.isPending && !reasonReady ? "Cancelling..." : "Cancel without rule"}
            </button>
            <button
              onClick={() => handleCancel(true)}
              disabled={cancel.isPending || !reasonReady}
              className={`btn-ink disabled:opacity-40 ${FOCUS}`}
            >
              {cancel.isPending && reasonReady ? "Saving rule..." : "Cancel and save rule"}
            </button>
          </div>
        </div>
      )}
    </span>
  );
}
