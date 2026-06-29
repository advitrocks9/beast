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
  deliverableId: string;
  checkInId?: string | null;
  employeeName: string;
  onDismiss: () => void;
}

export function CheckInModal({
  open,
  scheduledFor,
  deliverableType,
  deliverableId,
  checkInId,
  employeeName,
  onDismiss,
}: CheckInModalProps) {
  const [editReminderOpen, setEditReminderOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [currentScheduled, setCurrentScheduled] = useState<string | null>(scheduledFor);
  const [pickerValue, setPickerValue] = useState<string>("");
  const [pickerError, setPickerError] = useState<string | null>(null);
  const trpc = useTRPC();
  const share = useMutation(trpc.deliverables.share.mutationOptions());
  const reschedule = useMutation(trpc.checkIns.reschedule.mutationOptions());

  useEffect(() => {
    if (open) {
      setEditReminderOpen(false);
      setShareUrl(null);
      setCopied(false);
      setCurrentScheduled(scheduledFor);
      setPickerValue(toLocalInputValue(scheduledFor));
      setPickerError(null);
    }
  }, [open, scheduledFor]);

  async function handleReschedule() {
    if (!checkInId) {
      setPickerError("Reminder not yet ready - try again in a moment.");
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

  async function handleShare() {
    const result = await share.mutateAsync({ deliverableId });
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/share/${result.shareSlug}?ref=${encodeURIComponent(result.referralCode)}`;
    setShareUrl(url);
  }

  async function handleCopy() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard refused; user can select+copy manually
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
      onClick={onDismiss}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-7 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <p className="text-xs font-medium uppercase tracking-wider text-[oklch(0.55_0.15_140)]">
          Approved
        </p>
        <h2 className="mt-2 font-(--font-display) text-xl font-bold tracking-tight leading-tight">
          {employeeName} will check in with you Monday morning on whether you used this {typeLabel}.
        </h2>

        <div className="mt-5 rounded-xl bg-[oklch(0.97_0.01_260)] px-4 py-3">
          <p className="text-xs uppercase tracking-wider text-text-secondary">
            Next check-in
          </p>
          <p className="mt-0.5 text-sm font-medium text-text">
            {formattedDate}, {formattedTime}
          </p>
        </div>

        {editReminderOpen && (
          <div className="mt-4 rounded-xl border border-gray-200 bg-[oklch(0.97_0.01_260)] px-4 py-3">
            <p className="text-xs uppercase tracking-wider text-text-secondary">
              Pick a new time
            </p>
            <input
              type="datetime-local"
              value={pickerValue}
              onChange={(e) => setPickerValue(e.target.value)}
              min={toLocalInputValue(new Date(Date.now() + 60 * 60 * 1000).toISOString())}
              className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
            <p className="mt-2 text-xs text-text-muted">
              Your local time. Must be at least 1 hour from now and within 30 days.
            </p>
            {pickerError && (
              <p className="mt-2 text-xs text-red-600">{pickerError}</p>
            )}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setEditReminderOpen(false)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReschedule}
                disabled={reschedule.isPending}
                className="rounded-lg bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {reschedule.isPending ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        )}

        {shareUrl && (
          <div className="mt-4 rounded-xl border border-gray-200 bg-[oklch(0.97_0.01_260)] px-4 py-3">
            <p className="text-xs uppercase tracking-wider text-text-secondary">
              Share link
            </p>
            <p className="mt-0.5 break-all font-mono text-xs text-text-secondary">
              {shareUrl}
            </p>
            <p className="mt-2 text-xs text-text-muted">
              Read-only. Friend gets a 14-day skip-paywall; if they upgrade, you
              get one free month.
            </p>
            <button
              type="button"
              onClick={handleCopy}
              className="mt-3 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-gray-50"
            >
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setEditReminderOpen((v) => !v)}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-text-secondary hover:bg-gray-50"
          >
            Edit reminder
          </button>
          <button
            type="button"
            onClick={handleShare}
            disabled={share.isPending}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-text-secondary hover:bg-gray-50 disabled:opacity-50"
          >
            {share.isPending ? "Generating..." : shareUrl ? "Regenerate link" : "Share with a friend"}
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="flex-1 rounded-xl bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Convert an ISO UTC string to a value the native datetime-local input
 * accepts (`YYYY-MM-DDTHH:mm`, in the browser's local time).
 */
function toLocalInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Convert the datetime-local input's value (browser-local time) to an
 * ISO UTC string suitable for the reschedule mutation.
 */
function localInputToIso(value: string): string {
  return new Date(value).toISOString();
}
