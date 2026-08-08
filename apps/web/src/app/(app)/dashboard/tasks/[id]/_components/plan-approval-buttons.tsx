"use client";

import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

export function PlanApprovalButtons({ taskId }: { taskId: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const approve = useMutation({
    ...trpc.tasks.approvePlan.mutationOptions(),
    onSuccess: () => router.refresh(),
  });

  const isPending = approve.isPending;

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => approve.mutate({ taskId, approved: false })}
        disabled={isPending}
        className={`btn-ghost disabled:opacity-50 ${FOCUS}`}
      >
        Reject plan
      </button>
      <button
        onClick={() => approve.mutate({ taskId, approved: true })}
        disabled={isPending}
        className={`btn-ink disabled:opacity-50 ${FOCUS}`}
      >
        {isPending ? "Approving..." : "Approve plan"}
      </button>
    </div>
  );
}
