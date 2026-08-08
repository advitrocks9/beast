"use client";

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";

const DELIVERABLE_TYPE_LABEL: Record<string, string> = {
  competitive_teardown: "competitive teardown",
  "competitive-teardown": "competitive teardown",
  blog: "blog post",
  social_linkedin: "LinkedIn post",
  social_twitter: "tweet",
  social: "social post",
  email: "email draft",
  newsletter: "newsletter",
  faq: "FAQ article",
  custom: "deliverable",
};

interface CheckInModalProps {
  open: boolean;
  scheduledFor: string | null;
  deliverableType: string;
  checkInId?: string | null;
  employeeName: string;
  onDismiss: () => void;
}

export function CheckInModal({
  open,
  scheduledFor,
  deliverableType,
  checkInId,
  employeeName,
  onDismiss,
}: CheckInModalProps) {
  const [editReminderOpen, setEditReminderOpen] = useState(false);
  const [currentScheduled, setCurrentScheduled] = useState<string | null>(scheduledFor);
  const [pickerValue, setPickerValue] = useState<string>("");
  const [pickerError, setPickerError] = useState<string | null>(null);
  const trpc = useTRPC();
  const reschedule = useMutation(trpc.checkIns.reschedule.mutationOptions());

  useEffect(() => {
    if (open) {
      setEditReminderOpen(false);
      setCurrentScheduled(scheduledFor);
      setPickerValue(toLocalInputValue(scheduledFor));
      setPickerError(null);
    }
  }, [open, scheduledFor]);

  async function handleReschedule() {
    if (!checkInId) {
      setPickerError("Reminder not yet ready. Try again in a moment.");
      return;
    }
    if (!pickerValue) {
      setPickerError("Pick a date and time.");
      return;
    }
    setPickerError(null);
    const isoUtc = localInputToIso(pickerValue);
    try {
      const result = await reschedule.mutateAsync({ checkInId, scheduledFor: isoUtc });
      setCurrentScheduled(result.scheduledFor);
      setEditReminderOpen(false);
    } catch (err) {
      setPickerError(err instanceof Error ? err.message : "Could not save the new time.");
    }
  }

  if (!open) return null;

  const typeLabel = DELIVERABLE_TYPE_LABEL[deliverableType] ?? "deliverable";
  const scheduled = currentScheduled ? new Date(currentScheduled) : null;
  const formattedDate = scheduled
    ? scheduled.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })
    : "Monday morning";
  const formattedTime = scheduled
    ? scheduled.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : "9:00am";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4"
      onClick={onDismiss}
    >
      <div
        className="panel w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <p className="spec-label">Check-in scheduled</p>
        <h2 className="mt-2 text-[17px] leading-snug font-semibold">
          {employeeName} will check in on whether you used this {typeLabel}.
        </h2>

        <div className="panel-tinted mt-4 px-3.5 py-2.5">
          <p className="spec-label">Next check-in</p>
          <p className="spec mt-1 text-ink">
            {formattedDate}, {formattedTime}
          </p>
        </div>

        {editReminderOpen && (
          <div className="panel-tinted mt-3 px-3.5 py-2.5">
            <p className="spec-label">Pick a new time</p>
            <input
              type="datetime-local"
              value={pickerValue}
              onChange={(e) => setPickerValue(e.target.value)}
              min={toLocalInputValue(new Date(Date.now() + 60 * 60 * 1000).toISOString())}
              className="spec mt-2 block w-full border border-hairline bg-bg px-3 py-2 text-ink outline-none focus-visible:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            />
            <p className="spec mt-1.5 text-ink-muted">
              Your local time. At least 1 hour from now, within 30 days.
            </p>
            {pickerError && <p className="spec mt-1.5 text-state-failed">{pickerError}</p>}
            <div className="mt-2.5 flex gap-2">
              <button
                type="button"
                onClick={() => setEditReminderOpen(false)}
                className="btn-ghost px-3 py-1.5 text-[12px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReschedule}
                disabled={reschedule.isPending}
                className="btn-ink px-3 py-1.5 text-[12px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
              >
                {reschedule.isPending ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setEditReminderOpen((v) => !v)}
            className="btn-ghost focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            Edit reminder
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="btn-ink flex-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

/** ISO UTC to the native datetime-local format, browser-local. */
function toLocalInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputToIso(value: string): string {
  return new Date(value).toISOString();
}
