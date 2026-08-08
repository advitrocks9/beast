"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { CANNED_JOBS } from "@beast/shared";
import { useTRPC } from "@/trpc/client";
import { cn } from "@/lib/utils";
import { Monogram } from "@/components/monogram";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const ROLE_EMPLOYEE: Record<string, string> = {
  marketing: "Alex",
  sales: "Jordan",
  support: "Sam",
};

export function CommissionDialog({ demoMode }: { demoMode: boolean }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(CANNED_JOBS[0]!.id);
  const [replayNotice, setReplayNotice] = useState<string | null>(null);
  const router = useRouter();
  const trpc = useTRPC();

  const commission = useMutation(
    trpc.tasks.commission.mutationOptions({
      onSuccess: (res) => {
        if (res.mode === "live") {
          setOpen(false);
          router.push(`/dashboard/tasks/${res.taskId}?fresh=1`);
          router.refresh();
        } else {
          setReplayNotice(res.message);
        }
      },
    }),
  );

  const replayTaskId =
    commission.data?.mode === "replay" ? commission.data.taskId : null;

  async function handleCommission() {
    setReplayNotice(null);
    if (demoMode) {
      await fetch("/api/demo/session", { method: "POST" });
    }
    commission.mutate({ cannedJobId: selected });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="btn-identity">
        Commission a job
        <ArrowRight size={14} strokeWidth={2} />
      </DialogTrigger>
      <DialogContent className="max-w-lg gap-0 p-0">
        <DialogHeader className="rule-b px-5 py-4">
          <DialogTitle className="text-lg font-bold">Commission a job</DialogTitle>
          <p className="spec-label">
            {demoMode
              ? "Runs end to end against the model tier this deploy carries. Labelled, capped, honest."
              : "Runs against your configured provider."}
          </p>
        </DialogHeader>

        <div role="radiogroup" aria-label="Canned briefs" className="px-5 py-4">
          {CANNED_JOBS.map((job) => (
            <button
              key={job.id}
              role="radio"
              aria-checked={selected === job.id}
              onClick={() => setSelected(job.id)}
              className={cn(
                "hairline-b flex w-full items-start gap-3 px-1 py-3 text-left transition-colors last:border-b-0",
                selected === job.id ? "bg-panel" : "hover:bg-panel/60",
              )}
            >
              <Monogram name={ROLE_EMPLOYEE[job.role] ?? job.role} roleType={job.role} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] leading-tight font-semibold">{job.title}</span>
                <span className="mt-0.5 block text-[12px] leading-snug text-ink-secondary">
                  {job.brief}
                </span>
              </span>
              <span className="spec mt-0.5 shrink-0 text-ink-muted">~{job.estSeconds}s</span>
            </button>
          ))}
        </div>

        {commission.error && (
          <p className="mx-5 mb-3 border border-state-failed/40 bg-state-failed/5 px-3 py-2 text-[13px] text-state-failed">
            {commission.error.message}
          </p>
        )}

        {replayNotice && (
          <div className="mx-5 mb-3 border border-hairline bg-panel px-3 py-2.5">
            <p className="text-[13px] text-ink">{replayNotice}</p>
            {replayTaskId && (
              <button
                onClick={() => {
                  setOpen(false);
                  router.push(`/dashboard/tasks/${replayTaskId}`);
                }}
                className="mt-1.5 text-[13px] font-semibold text-ink underline underline-offset-2"
              >
                Watch a recorded run instead
              </button>
            )}
          </div>
        )}

        <footer className="hairline-t flex items-center justify-between px-5 py-3.5">
          <span className="spec-label">
            {demoMode ? "2 live runs per visit" : "Metered by your plan"}
          </span>
          <button
            onClick={handleCommission}
            disabled={commission.isPending}
            className="btn-ink disabled:opacity-60"
          >
            {commission.isPending ? "Dispatching…" : "Run it"}
          </button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
