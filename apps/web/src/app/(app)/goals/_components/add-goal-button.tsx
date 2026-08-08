"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { GoalField, INPUT_CLASS } from "./goal-form-fields";

export function AddGoalButton({ first = false }: { first?: boolean }) {
  const router = useRouter();
  const trpc = useTRPC();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetMetric, setTargetMetric] = useState("");
  const [targetDate, setTargetDate] = useState("");

  const create = useMutation({
    ...trpc.goals.create.mutationOptions(),
    onSuccess: () => {
      setOpen(false);
      setTitle("");
      setDescription("");
      setTargetMetric("");
      setTargetDate("");
      router.refresh();
    },
  });

  function handleSave() {
    if (title.trim().length < 3) return;
    create.mutate({
      title: title.trim(),
      description: description.trim() || undefined,
      targetMetric: targetMetric.trim() || undefined,
      targetDate: targetDate || undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className={first ? "btn-identity" : "btn-ink"}>
        {first ? "Set the first target" : "Add a target"}
      </DialogTrigger>
      <DialogContent className="max-w-lg gap-0 p-0 sm:max-w-lg">
        <DialogHeader className="rule-b px-5 py-4">
          <DialogTitle className="text-lg font-bold">New target</DialogTitle>
          <p className="spec-label">Jobs get briefed toward it; progress is yours to mark.</p>
        </DialogHeader>

        <div className="space-y-4 px-5 py-4">
          <GoalField label="Title">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. 50 qualified leads from LinkedIn this quarter"
              className={INPUT_CLASS}
              autoFocus
            />
          </GoalField>
          <GoalField label="Description" optional>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Why this target? Any constraints or context."
              className={`${INPUT_CLASS} resize-none`}
            />
          </GoalField>
          <div className="grid grid-cols-2 gap-3">
            <GoalField label="Target metric" optional>
              <input
                value={targetMetric}
                onChange={(e) => setTargetMetric(e.target.value)}
                placeholder="e.g. 50 leads"
                className={INPUT_CLASS}
              />
            </GoalField>
            <GoalField label="Target date" optional>
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className={INPUT_CLASS}
              />
            </GoalField>
          </div>
          {create.error && (
            <p className="border border-state-failed/40 bg-state-failed/5 px-3 py-2 text-[13px] text-state-failed">
              {create.error.message}
            </p>
          )}
        </div>

        <footer className="hairline-t flex items-center justify-end gap-2 px-5 py-3.5">
          <button
            onClick={() => setOpen(false)}
            disabled={create.isPending}
            className="btn-ghost disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={create.isPending || title.trim().length < 3}
            className="btn-ink disabled:opacity-50"
          >
            {create.isPending ? "Saving…" : "Set target"}
          </button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
