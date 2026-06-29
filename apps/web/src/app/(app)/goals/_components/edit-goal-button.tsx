"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import { GlassCard } from "@beast/ui";
import { Pencil, X } from "lucide-react";

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

  function close() {
    setOpen(false);
    setTitle(goal.title);
    setDescription(goal.description ?? "");
    setTargetMetric(goal.targetMetric ?? "");
    setTargetDate(isoDate(goal.targetDate));
    setStatus(goal.status);
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
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-[oklch(0.97_0.005_260/0.5)] hover:text-text"
        aria-label={`Edit ${goal.title}`}
      >
        <Pencil size={14} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
          onClick={close}
        >
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg">
            <GlassCard hoverable={false} className="p-6 bg-white">
              <div className="flex items-start justify-between mb-4">
                <h3 className="font-(--font-display) text-lg font-bold tracking-tight">
                  Edit goal
                </h3>
                <button
                  onClick={close}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted hover:bg-[oklch(0.97_0.005_260/0.5)]"
                  aria-label="Close"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="space-y-3">
                <Field label="Title">
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                  />
                </Field>

                <Field label="Description" optional>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent resize-none"
                  />
                </Field>

                <Field label="Target metric" optional>
                  <input
                    value={targetMetric}
                    onChange={(e) => setTargetMetric(e.target.value)}
                    placeholder="e.g. 50 qualified leads / month"
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                  />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Target date" optional>
                    <input
                      type="date"
                      value={targetDate}
                      onChange={(e) => setTargetDate(e.target.value)}
                      className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                    />
                  </Field>

                  <Field label="Status">
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                      className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                    >
                      <option value="active">Active</option>
                      <option value="paused">Paused</option>
                      <option value="completed">Completed</option>
                      <option value="archived">Archived</option>
                    </select>
                  </Field>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={handleArchive}
                  disabled={isPending}
                  className="text-xs font-medium text-error hover:underline disabled:opacity-50"
                >
                  Archive
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={close}
                    disabled={isPending}
                    className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-text-secondary hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={isPending || !title.trim()}
                    className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                  >
                    {isPending ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            </GlassCard>
          </div>
        </div>
      )}
    </>
  );
}

function Field({ label, optional, children }: { label: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-text-secondary mb-1.5">
        {label}
        {optional && <span className="ml-1 font-normal text-text-muted">(optional)</span>}
      </label>
      {children}
    </div>
  );
}
