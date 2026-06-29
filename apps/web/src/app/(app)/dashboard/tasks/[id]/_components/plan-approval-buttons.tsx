"use client";

import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";

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
        className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-gray-50 disabled:opacity-50"
      >
        Reject plan
      </button>
      <button
        onClick={() => approve.mutate({ taskId, approved: true })}
        disabled={isPending}
        className="rounded-lg bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {isPending ? "Approving..." : "Approve plan"}
      </button>
    </div>
  );
}
