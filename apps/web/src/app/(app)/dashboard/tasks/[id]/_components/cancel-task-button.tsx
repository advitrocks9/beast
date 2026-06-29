"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";

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

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-full border border-red-200 bg-white px-3 py-1 text-[11px] font-medium text-red-700 hover:bg-red-50"
      >
        Cancel task
      </button>
    );
  }

  const reasonReady = reason.trim().length >= 10;

  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-2 text-left">
      <p className="text-sm font-medium text-red-900">
        Cancel &ldquo;{taskTitle}&rdquo;?
      </p>
      <p className="text-xs text-red-700">
        Optional: name what went wrong. 10+ characters becomes a high-signal avoid rule
        for the agent next time.
      </p>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        placeholder="e.g. Used the wrong tone; we never address customers as 'team'."
        className="w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400 resize-none"
      />
      <div className="flex flex-wrap gap-2 pt-1">
        <button
          onClick={() => {
            setOpen(false);
            setReason("");
          }}
          disabled={cancel.isPending}
          className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
        >
          Keep working
        </button>
        <button
          onClick={() => handleCancel(false)}
          disabled={cancel.isPending}
          className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
        >
          {cancel.isPending && !reasonReady ? "Cancelling..." : "Cancel without rule"}
        </button>
        <button
          onClick={() => handleCancel(true)}
          disabled={cancel.isPending || !reasonReady}
          className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-30"
        >
          {cancel.isPending && reasonReady ? "Saving rule..." : "Cancel and save rule"}
        </button>
      </div>
    </div>
  );
}
