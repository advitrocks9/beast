"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import { GlassCard } from "@beast/ui";
import { Plus, X } from "lucide-react";

export function AddGoalButton({ variant = "header" }: { variant?: "header" | "block" }) {
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

  const triggerLabel = variant === "block" ? "Set your first goal" : "Add a goal";

  function close() {
    setOpen(false);
  }

  async function handleSave() {
    if (title.trim().length < 3) return;
    create.mutate({
      title: title.trim(),
      description: description.trim() || undefined,
      targetMetric: targetMetric.trim() || undefined,
      targetDate: targetDate || undefined,
    });
  }

  const trigger = variant === "block" ? (
    <button
      onClick={() => setOpen(true)}
      className="inline-block rounded-xl bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800"
    >
      {triggerLabel}
    </button>
  ) : (
    <button
      onClick={() => setOpen(true)}
      className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-black hover:bg-gray-50"
    >
      {triggerLabel}
    </button>
  );

  return (
    <>
      {trigger}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
          onClick={close}
        >
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg">
            <GlassCard hoverable={false} className="p-6 bg-white">
              <div className="flex items-start justify-between mb-4">
                <h3 className="font-(--font-display) text-lg font-bold tracking-tight">
                  New goal
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
                    placeholder="e.g. 50 qualified leads from LinkedIn this quarter"
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                    autoFocus
                  />
                </Field>

                <Field label="Description" optional>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    placeholder="Why this goal? Any constraints or context."
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent resize-none"
                  />
                </Field>

                <Field label="Target metric" optional>
                  <input
                    value={targetMetric}
                    onChange={(e) => setTargetMetric(e.target.value)}
                    placeholder="e.g. 50 leads"
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                  />
                </Field>

                <Field label="Target date" optional>
                  <input
                    type="date"
                    value={targetDate}
                    onChange={(e) => setTargetDate(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                  />
                </Field>
              </div>

              <div className="mt-6 flex justify-end gap-2">
                <button
                  onClick={close}
                  disabled={create.isPending}
                  className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-text-secondary hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={create.isPending || title.trim().length < 3}
                  className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                >
                  {create.isPending ? "Saving..." : "Save goal"}
                </button>
              </div>

              {create.error && (
                <p className="mt-2 text-xs text-error">{create.error.message}</p>
              )}
            </GlassCard>
          </div>
        </div>
      )}

      {variant === "block" && (
        <p className="mt-3 text-xs text-text-muted">
          Or run the <Plus size={11} className="inline" /> 90-second interview from /onboarding to capture three goals at once.
        </p>
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
