"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import { GlassCard } from "@beast/ui";
import type { Citation } from "@beast/shared";
import { CheckInModal } from "./check-in-modal";
import { ReasoningTrail } from "./reasoning-trail";
import { MemoryReceipt } from "./memory-receipt";
import { CitedBody, unresolvedCitationCount } from "./cited-body";

interface ToolCallTrace {
  toolCallId: string;
  name: string;
  inputSummary: string;
  resultSummary: string;
  durationMs: number;
  startedAt: string;
}

interface AppliedRule {
  ruleId: string;
  summary: string;
  evidence: string;
  extractedFromDeliverableId: string;
  extractedFromTitle: string;
  extractedAt: string;
  confidence: number;
}

interface DeliverableData {
  id: string;
  title: string;
  deliverableType: string;
  content: Record<string, unknown>;
  status: string;
  version: number;
  aiEmployeeId: string;
  taskId: string;
  publishAfter?: string | null;
}

const PUBLISHABLE_TYPES = new Set([
  "social_twitter",
  "social_linkedin",
  "blog_post",
  "wordpress_post",
]);

const FEEDBACK_CHIPS = [
  { value: "love_this", label: "Love this", color: "#16A34A", bg: "#F0FDF4" },
  { value: "too_long", label: "Too long", color: "#DC2626", bg: "#FEF2F2" },
  { value: "too_formal", label: "Too formal", color: "#DC2626", bg: "#FEF2F2" },
  { value: "too_casual", label: "Too casual", color: "#DC2626", bg: "#FEF2F2" },
  { value: "make_punchier", label: "Make punchier", color: "#7C3AED", bg: "#F5F3FF" },
  { value: "add_data", label: "Add data", color: "#7C3AED", bg: "#F5F3FF" },
  { value: "stronger_cta", label: "Stronger CTA", color: "#7C3AED", bg: "#F5F3FF" },
  { value: "different_angle", label: "Different angle", color: "#7C3AED", bg: "#F5F3FF" },
] as const;

const ROLE_COLORS: Record<string, string> = {
  marketing: "#E87B35",
  sales: "#3B82F6",
  support: "#22C55E",
};

interface ReviewShellProps {
  deliverable: DeliverableData;
  employeeName: string;
  employeeRoleType: string;
  taskTitle?: string;
}

export function ReviewShell({
  deliverable,
  employeeName,
  employeeRoleType,
  taskTitle,
}: ReviewShellProps) {
  const [selectedChips, setSelectedChips] = useState<Set<string>>(new Set());
  const [feedbackText, setFeedbackText] = useState("");
  const [checkInModalOpen, setCheckInModalOpen] = useState(false);
  const [checkInScheduledFor, setCheckInScheduledFor] = useState<string | null>(null);
  const [checkInId, setCheckInId] = useState<string | null>(null);
  const router = useRouter();
  const trpc = useTRPC();

  const approve = useMutation(trpc.deliverables.approve.mutationOptions());
  const requestRevision = useMutation(trpc.deliverables.requestRevision.mutationOptions());
  const reject = useMutation(trpc.deliverables.reject.mutationOptions());
  const saveEdit = useMutation(trpc.deliverables.saveEdit.mutationOptions());
  const queueAutoPublish = useMutation(trpc.deliverables.queueAutoPublish.mutationOptions());
  const cancelAutoPublish = useMutation(trpc.deliverables.cancelAutoPublish.mutationOptions());

  const roleHex = ROLE_COLORS[employeeRoleType] ?? "#9CA3AF";
  const pickString = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
  const originalBody = pickString(deliverable.content.content)
    ?? pickString(deliverable.content.body)
    ?? pickString(deliverable.content.response)
    ?? JSON.stringify(deliverable.content, null, 2);
  const persistedEdit = pickString(deliverable.content.editedText);
  const mainContent = persistedEdit ?? originalBody;
  const [isEditing, setIsEditing] = useState(false);
  const [draftText, setDraftText] = useState(mainContent);
  const trail = deliverable.content.trail as ToolCallTrace[] | undefined;
  const appliedRules = deliverable.content.appliedRules as AppliedRule[] | undefined;
  const rawCitations = deliverable.content.citations as Citation[] | undefined;
  const citations: Citation[] = Array.isArray(rawCitations) ? rawCitations : [];
  const unresolved = unresolvedCitationCount(mainContent, citations);
  const hasUnsavedEdit = isEditing && draftText !== mainContent;
  const wasEdited = persistedEdit !== undefined && persistedEdit !== originalBody;

  function toggleChip(value: string) {
    setSelectedChips((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  async function handleSaveEdit() {
    if (draftText === mainContent) {
      setIsEditing(false);
      return;
    }
    await saveEdit.mutateAsync({ deliverableId: deliverable.id, editedText: draftText });
    setIsEditing(false);
    router.refresh();
  }

  function handleCancelEdit() {
    setDraftText(mainContent);
    setIsEditing(false);
  }

  async function handleQueuePublish() {
    await queueAutoPublish.mutateAsync({ deliverableId: deliverable.id, delaySeconds: 60 });
    router.refresh();
  }

  async function handleCancelQueue() {
    await cancelAutoPublish.mutateAsync({ deliverableId: deliverable.id });
    router.refresh();
  }

  async function handleApprove() {
    const hasNoEdits = selectedChips.size === 0 && !feedbackText.trim() && !wasEdited;
    const result = await approve.mutateAsync({
      deliverableId: deliverable.id,
      chips: Array.from(selectedChips),
      feedbackText: feedbackText.trim() || undefined,
      originalText: originalBody,
      editedText: wasEdited ? mainContent : undefined,
      approvedWithoutEdits: hasNoEdits,
    });
    setCheckInScheduledFor(result?.scheduledFor ?? null);
    setCheckInId(result?.checkInId ?? null);
    setCheckInModalOpen(true);
  }

  function handleDismissCheckInModal() {
    setCheckInModalOpen(false);
    router.back();
    router.refresh();
  }

  async function handleRequestRevision() {
    await requestRevision.mutateAsync({
      deliverableId: deliverable.id,
      chips: Array.from(selectedChips),
      feedbackText: feedbackText.trim() || undefined,
      originalText: mainContent,
    });
    router.back();
    router.refresh();
  }

  const [rejectMode, setRejectMode] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  async function handleReject() {
    await reject.mutateAsync({
      deliverableId: deliverable.id,
      reason: rejectReason.trim(),
      originalText: mainContent,
    });
    router.back();
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-text-muted uppercase tracking-wider">
            Review deliverable · v{deliverable.version}
          </p>
          <h1 className="mt-1 font-(--font-display) text-2xl font-bold tracking-tight">
            {deliverable.title}
          </h1>
          <p className="mt-0.5 text-sm text-text-secondary">
            by <span style={{ color: roleHex }} className="font-medium">{employeeName}</span>
            {taskTitle && <> · {taskTitle}</>}
          </p>
        </div>
        <span className="rounded-full bg-[oklch(0.97_0.005_260/0.5)] px-3 py-1 text-xs font-medium text-text-secondary">
          {deliverable.deliverableType}
        </span>
      </div>

      <MemoryReceipt
        rules={appliedRules}
        scopeKey={deliverable.id}
        employeeName={employeeName}
      />

      <PublishBanner
        status={deliverable.status}
        deliverableType={deliverable.deliverableType}
        publishAfter={deliverable.publishAfter ?? null}
        onQueue={handleQueuePublish}
        onCancel={handleCancelQueue}
        queuePending={queueAutoPublish.isPending}
        cancelPending={cancelAutoPublish.isPending}
      />

      {unresolved > 0 && (
        <div
          className="rounded-xl border px-4 py-3 text-sm"
          style={{
            background: "color-mix(in oklab, var(--color-error) 8%, white)",
            borderColor: "color-mix(in oklab, var(--color-error) 30%, white)",
            color: "var(--color-error)",
          }}
        >
          {unresolved} {unresolved === 1 ? "source" : "sources"} not found.
          The body cites markers that are not in the citation list. Approve only after verifying the unresolved claims.
        </div>
      )}

      {/* Content renderer */}
      <GlassCard hoverable={false} className="p-8">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {wasEdited && !isEditing && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                style={{ backgroundColor: "#FEF3C7", color: "#92400E" }}
              >
                Edited by you
              </span>
            )}
          </div>
          {!isEditing ? (
            <button
              onClick={() => {
                setDraftText(mainContent);
                setIsEditing(true);
              }}
              className="text-xs font-medium text-text-secondary hover:text-text"
            >
              Edit
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={handleCancelEdit}
                disabled={saveEdit.isPending}
                className="text-xs font-medium text-text-secondary hover:text-text disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={saveEdit.isPending || !hasUnsavedEdit}
                className="rounded-lg bg-black px-3 py-1 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {saveEdit.isPending ? "Saving..." : "Save edit"}
              </button>
            </div>
          )}
        </div>

        {isEditing ? (
          <textarea
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            rows={Math.max(8, draftText.split("\n").length + 2)}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm leading-relaxed outline-none focus:border-accent focus:ring-1 focus:ring-accent resize-y"
            autoFocus
          />
        ) : deliverable.deliverableType === "social_twitter" || deliverable.deliverableType === "social_linkedin" ? (
          <SocialPostPreview
            content={mainContent}
            platform={deliverable.deliverableType === "social_twitter" ? "Twitter" : "LinkedIn"}
          />
        ) : (
          <CitedBody body={mainContent} citations={citations} hex={roleHex} />
        )}
      </GlassCard>

      <ReasoningTrail trace={trail} employeeName={employeeName} />

      {/* Quick feedback chips */}
      <div>
        <h3 className="text-sm font-medium mb-2">Quick feedback</h3>
        <div className="flex flex-wrap gap-2">
          {FEEDBACK_CHIPS.map((chip) => {
            const selected = selectedChips.has(chip.value);
            return (
              <button
                key={chip.value}
                onClick={() => toggleChip(chip.value)}
                className="rounded-full px-3.5 py-1.5 text-xs font-medium transition-all"
                style={{
                  backgroundColor: selected ? chip.bg : "oklch(0.97 0.005 260 / 0.4)",
                  color: selected ? chip.color : "#6B7280",
                  outline: selected ? `2px solid ${chip.color}30` : "none",
                }}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Approval rationale */}
      <div>
        <label className="block text-sm font-medium mb-1.5">
          Why did you approve this? <span className="text-text-muted font-normal">(optional)</span>
        </label>
        <textarea
          value={feedbackText}
          onChange={(e) => setFeedbackText(e.target.value)}
          placeholder={`What worked here that ${employeeName} should repeat? What should they avoid next time?`}
          rows={3}
          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent resize-none"
        />
        <p className="mt-1 text-xs text-text-muted">
          One or two sentences becomes a rule {employeeName} applies to similar work.
        </p>
      </div>

      {/* Reject reason panel */}
      {rejectMode && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-2">
          <label className="block text-sm font-medium text-red-900">
            Why is this rejected?
          </label>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
            placeholder={`What was wrong with this approach? ${employeeName} stores this as an avoid-pattern for next time.`}
            className="w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400 resize-none"
            autoFocus
          />
          <p className="text-xs text-red-700">
            Rejecting ends this task. The agent will not retry. The reason becomes a high-signal avoid rule (10-char minimum).
          </p>
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => {
                setRejectMode(false);
                setRejectReason("");
              }}
              disabled={reject.isPending}
              className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleReject}
              disabled={reject.isPending || rejectReason.trim().length < 10}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-30"
            >
              {reject.isPending ? "Rejecting..." : "Confirm reject"}
            </button>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          onClick={() => router.back()}
          className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-medium text-text-secondary hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={() => setRejectMode((v) => !v)}
          disabled={reject.isPending}
          className="rounded-xl border border-red-300 bg-white px-5 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          Reject
        </button>
        <button
          onClick={handleRequestRevision}
          disabled={requestRevision.isPending || (selectedChips.size === 0 && !feedbackText.trim())}
          className="flex-1 rounded-xl border border-red-200 bg-red-50 px-5 py-2.5 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-30"
        >
          {requestRevision.isPending ? "Sending..." : "Request Revision"}
        </button>
        <button
          onClick={handleApprove}
          disabled={approve.isPending}
          className="flex-1 rounded-xl bg-[#22C55E] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#16A34A] disabled:opacity-50"
        >
          {approve.isPending ? "Approving..." : "Approve ✓"}
        </button>
      </div>

      <CheckInModal
        open={checkInModalOpen}
        scheduledFor={checkInScheduledFor}
        deliverableType={deliverable.deliverableType}
        deliverableId={deliverable.id}
        checkInId={checkInId}
        employeeName={employeeName}
        onDismiss={handleDismissCheckInModal}
      />
    </div>
  );
}

interface PublishBannerProps {
  status: string;
  deliverableType: string;
  publishAfter: string | null;
  onQueue: () => void;
  onCancel: () => void;
  queuePending: boolean;
  cancelPending: boolean;
}

function PublishBanner({
  status,
  deliverableType,
  publishAfter,
  onQueue,
  onCancel,
  queuePending,
  cancelPending,
}: PublishBannerProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (status !== "auto_publishing") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [status]);

  if (status === "auto_publishing" && publishAfter) {
    const left = Math.max(0, Math.round((new Date(publishAfter).getTime() - now) / 1000));
    return (
      <div className="rounded-xl border border-accent bg-accent-light px-4 py-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-accent">
            Publishing in {left}s
          </p>
          <p className="text-xs text-text-secondary mt-0.5">
            Cancel here or from /reviews to keep this in approved status.
          </p>
        </div>
        <button
          onClick={onCancel}
          disabled={cancelPending || left === 0}
          className="rounded-lg border border-error bg-white px-3 py-1.5 text-xs font-medium text-error hover:bg-[oklch(0.97_0.05_25)] disabled:opacity-50"
        >
          {cancelPending ? "Cancelling..." : "Cancel publish"}
        </button>
      </div>
    );
  }

  if (status === "approved" && PUBLISHABLE_TYPES.has(deliverableType)) {
    return (
      <div className="rounded-xl border border-[oklch(0.85_0.01_260/0.4)] bg-white px-4 py-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">
            Approved. Publish to platform when ready.
          </p>
          <p className="text-xs text-text-secondary mt-0.5">
            Queue auto-publish with a 60-second cancel window, or publish manually from Settings.
          </p>
        </div>
        <button
          onClick={onQueue}
          disabled={queuePending}
          className="rounded-lg bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {queuePending ? "Queueing..." : "Publish in 60s"}
        </button>
      </div>
    );
  }

  if (status === "published") {
    return (
      <div className="rounded-xl border border-[#22C55E40] bg-[#22C55E10] px-4 py-3">
        <p className="text-sm font-medium text-[#16A34A]">Published.</p>
      </div>
    );
  }

  return null;
}

function SocialPostPreview({ content, platform }: { content: string; platform: string }) {
  return (
    <div className="mx-auto max-w-md rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="h-8 w-8 rounded-full bg-gray-200" />
        <div>
          <p className="text-sm font-medium">Your Company</p>
          <p className="text-xs text-text-muted">{platform}</p>
        </div>
      </div>
      <p className="text-sm leading-relaxed whitespace-pre-wrap">{content}</p>
    </div>
  );
}
