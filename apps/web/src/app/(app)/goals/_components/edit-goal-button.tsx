"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { useTRPC } from "@/trpc/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { GoalField, INPUT_CLASS } from "./goal-form-fields";

interface GoalEditPayload {
  id: string;
  title: string;
  description: string | null;
  targetMetric: string | null;
  targetDate: string | null;
  status: string;
}

function isoDate(d: string | null): string {
  if (!d) return "";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export function EditGoalButton({ goal }: { goal: GoalEditPayload }) {
  const router = useRouter();
  const trpc = useTRPC();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(goal.title);
  const [description, setDescription] = useState(goal.description ?? "");
  const [targetMetric, setTargetMetric] = useState(goal.targetMetric ?? "");
  const [targetDate, setTargetDate] = useState(isoDate(goal.targetDate));
  const [status, setStatus] = useState(goal.status);

  const update = useMutation(trpc.goals.update.mutationOptions());
  const updateStatus = useMutation(trpc.goals.updateStatus.mutationOptions());

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setTitle(goal.title);
      setDescription(goal.description ?? "");
      setTargetMetric(goal.targetMetric ?? "");
      setTargetDate(isoDate(goal.targetDate));
      setStatus(goal.status);
    }
  }

  async function handleSave() {
    if (!title.trim()) return;
    await update.mutateAsync({
      goalId: goal.id,
      title: title.trim(),
      description: description.trim() || null,
      targetMetric: targetMetric.trim() || null,
      targetDate: targetDate || null,
    });
    if (status !== goal.status) {
      const allowed = ["active", "completed", "paused", "archived"] as const;
      if (allowed.includes(status as (typeof allowed)[number])) {
        await updateStatus.mutateAsync({
          goalId: goal.id,
          status: status as (typeof allowed)[number],
        });
      }
    }
    setOpen(false);
    router.refresh();
  }

  async function handleArchive() {
    await updateStatus.mutateAsync({ goalId: goal.id, status: "archived" });
    setOpen(false);
    router.refresh();
  }

  const isPending = update.isPending || updateStatus.isPending;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        aria-label={`Edit ${goal.title}`}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[2px] text-ink-muted transition-colors hover:bg-panel hover:text-ink"
      >
        <Pencil size={14} strokeWidth={1.5} />
      </DialogTrigger>
      <DialogContent className="max-w-lg gap-0 p-0 sm:max-w-lg">
        <DialogHeader className="rule-b px-5 py-4">
          <DialogTitle className="text-lg font-bold">Edit target</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 px-5 py-4">
          <GoalField label="Title">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={INPUT_CLASS}
            />
          </GoalField>
          <GoalField label="Description" optional>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className={`${INPUT_CLASS} resize-none`}
            />
          </GoalField>
          <GoalField label="Target metric" optional>
            <input
              value={targetMetric}
              onChange={(e) => setTargetMetric(e.target.value)}
              placeholder="e.g. 50 qualified leads / month"
              className={INPUT_CLASS}
            />
          </GoalField>
          <div className="grid grid-cols-2 gap-3">
            <GoalField label="Target date" optional>
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className={INPUT_CLASS}
              />
            </GoalField>
            <GoalField label="Status">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className={INPUT_CLASS}
              >
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="completed">Met</option>
                <option value="archived">Archived</option>
              </select>
            </GoalField>
          </div>
        </div>

        <footer className="hairline-t flex items-center justify-between gap-3 px-5 py-3.5">
          <button
            type="button"
            onClick={handleArchive}
            disabled={isPending}
            className="spec text-state-failed underline underline-offset-2 hover:text-state-failed/80 disabled:opacity-50"
          >
            Archive
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
              className="btn-ghost disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending || !title.trim()}
              className="btn-ink disabled:opacity-50"
            >
              {isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
