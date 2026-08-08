"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import type { Citation } from "@beast/shared";
import { Monogram } from "@/components/monogram";
import { StateChip } from "@/components/state-chip";
import { ProvenanceTag, type Provenance } from "@/components/provenance-tag";
import { CheckInModal } from "./check-in-modal";
import { ReasoningTrail, type ToolCallTrace } from "./reasoning-trail";
import { AppliedRules, type AppliedRule } from "./applied-rules";
import { CitedBody, unresolvedCitationCount } from "./cited-body";
import { VerdictMoment, type CandidateWire, type DiffSpanWire } from "./verdict-moment";

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
  createdAt: string;
}

const PUBLISHABLE_TYPES = new Set([
  "social_twitter",
  "social_linkedin",
  "blog_post",
  "wordpress_post",
]);

const FEEDBACK_CHIPS = [
  { value: "love_this", label: "Love this" },
  { value: "too_long", label: "Too long" },
  { value: "too_formal", label: "Too formal" },
  { value: "too_casual", label: "Too casual" },
  { value: "make_punchier", label: "Make punchier" },
  { value: "add_data", label: "Add data" },
  { value: "stronger_cta", label: "Stronger CTA" },
  { value: "different_angle", label: "Different angle" },
] as const;

interface Moment {
  verdict: "accepted" | "revising";
  diff: { spans: DiffSpanWire[] } | null;
  candidates: CandidateWire[];
  manualRuleNumber: number | null;
  scheduledFor: string | null;
  checkInId: string | null;
}

interface ReviewShellProps {
  deliverable: DeliverableData;
  employeeName: string;
  employeeRoleType: string;
  taskTitle?: string;
  ruleNumbers: Record<string, string>;
  provenance: Provenance | null;
}

function filedWhen(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "filed now";
  if (m < 60) return `filed ${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `filed ${h}h ago`;
  return `filed ${Math.floor(h / 24)}d ago`;
}

export function ReviewShell({
  deliverable,
  employeeName,
  employeeRoleType,
  taskTitle,
  ruleNumbers,
  provenance,
}: ReviewShellProps) {
  const [selectedChips, setSelectedChips] = useState<Set<string>>(new Set());
  const [feedbackText, setFeedbackText] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [moment, setMoment] = useState<Moment | null>(null);
  const [checkInModalOpen, setCheckInModalOpen] = useState(false);
  const momentRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();
  const trpc = useTRPC();

  const approve = useMutation(trpc.deliverables.approve.mutationOptions());
  const requestRevision = useMutation(trpc.deliverables.requestRevision.mutationOptions());
  const reject = useMutation(trpc.deliverables.reject.mutationOptions());
  const saveEdit = useMutation(trpc.deliverables.saveEdit.mutationOptions());
  const queueAutoPublish = useMutation(trpc.deliverables.queueAutoPublish.mutationOptions());
  const cancelAutoPublish = useMutation(trpc.deliverables.cancelAutoPublish.mutationOptions());

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
  const reviewable = deliverable.status === "in_review" || deliverable.status === "revised";

  useEffect(() => {
    if (moment) momentRef.current?.scrollIntoView({ block: "nearest" });
  }, [moment]);

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
    setActionError(null);
    try {
      await saveEdit.mutateAsync({ deliverableId: deliverable.id, editedText: draftText });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Edit did not save.");
      return;
    }
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

  async function handleAccept() {
    setActionError(null);
    const hasNoEdits = selectedChips.size === 0 && !feedbackText.trim() && !wasEdited;
    let result;
    try {
      result = await approve.mutateAsync({
        deliverableId: deliverable.id,
        chips: Array.from(selectedChips),
        feedbackText: feedbackText.trim() || undefined,
        originalText: originalBody,
        editedText: wasEdited ? mainContent : undefined,
        approvedWithoutEdits: hasNoEdits,
      });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Sign-off did not go through.");
      return;
    }
    if (!result) {
      router.refresh();
      return;
    }
    setMoment({
      verdict: "accepted",
      diff: result.diff,
      candidates: result.candidates,
      manualRuleNumber: result.manualRuleNumber,
      scheduledFor: result.scheduledFor,
      checkInId: result.checkInId ?? null,
    });
    router.refresh();
  }

  async function handleSendBack() {
    setActionError(null);
    let result;
    try {
      result = await requestRevision.mutateAsync({
        deliverableId: deliverable.id,
        chips: Array.from(selectedChips),
        feedbackText: feedbackText.trim() || undefined,
        originalText: originalBody,
        editedText: wasEdited ? mainContent : undefined,
      });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Send-back did not go through.");
      return;
    }
    if (!result) {
      router.refresh();
      return;
    }
    setMoment({
      verdict: "revising",
      diff: result.diff,
      candidates: result.candidates,
      manualRuleNumber: result.manualRuleNumber,
      scheduledFor: null,
      checkInId: null,
    });
    router.refresh();
  }

  const [rejectMode, setRejectMode] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  async function handleReject() {
    setActionError(null);
    try {
      await reject.mutateAsync({
        deliverableId: deliverable.id,
        reason: rejectReason.trim(),
        originalText: mainContent,
      });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Reject did not go through.");
      return;
    }
    router.push("/reviews");
    router.refresh();
  }

  const checkInLine = moment?.scheduledFor
    ? `Check-in ${new Date(moment.scheduledFor).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      })}`
    : null;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="rule-b flex flex-wrap items-end justify-between gap-3 pb-3">
        <div className="min-w-0">
          <p className="spec-label">
            Proofing desk · {deliverable.deliverableType.replace(/_/g, " ")} · v
            {deliverable.version} · {filedWhen(deliverable.createdAt)}
          </p>
          <h1 className="display mt-1.5 text-2xl">{deliverable.title}</h1>
          <p className="mt-1.5 flex items-center gap-2 text-[13px] text-ink-secondary">
            <Monogram name={employeeName} roleType={employeeRoleType} size="sm" />
            <span className="font-medium text-ink">{employeeName}</span>
            {taskTitle && <span className="truncate">· {taskTitle}</span>}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {provenance && <ProvenanceTag kind={provenance} />}
          <StateChip status={moment ? moment.verdict : deliverable.status} />
        </div>
      </header>

      <AppliedRules rules={appliedRules} ruleNumbers={ruleNumbers} />

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
        <div className="border border-state-failed px-3.5 py-2.5">
          <p className="spec-label text-state-failed">
            {unresolved} {unresolved === 1 ? "source" : "sources"} not found
          </p>
          <p className="mt-1 text-[13px] leading-snug text-ink-secondary">
            The body cites markers that are not in the source list. Sign off only after
            verifying the unresolved claims.
          </p>
        </div>
      )}

      <section aria-label="Document" className="panel">
        <div className="hairline-b flex items-center justify-between gap-3 px-4 py-2.5">
          <p className="spec-label">Document</p>
          <div className="flex items-center gap-2">
            {wasEdited && !isEditing && (
              <span className="spec-label border border-identity px-1.5 py-0.5 text-identity-deep">
                Edited by you
              </span>
            )}
            {isEditing && (
              <>
                <button
                  onClick={handleCancelEdit}
                  disabled={saveEdit.isPending}
                  className="btn-ghost px-3 py-1.5 text-[12px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
                >
                  Discard
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={saveEdit.isPending || !hasUnsavedEdit}
                  className="btn-ink px-3 py-1.5 text-[12px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
                >
                  {saveEdit.isPending ? "Saving..." : "Save edit"}
                </button>
              </>
            )}
          </div>
        </div>

        <div className="px-4 py-4 sm:px-5">
          {isEditing ? (
            <textarea
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              rows={Math.max(8, draftText.split("\n").length + 2)}
              className="block w-full resize-y border border-hairline bg-bg px-3.5 py-3 text-[14px] leading-relaxed text-ink outline-none focus-visible:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              autoFocus
            />
          ) : deliverable.deliverableType === "social_twitter" ||
            deliverable.deliverableType === "social_linkedin" ? (
            <SocialPostPreview
              content={mainContent}
              platform={deliverable.deliverableType === "social_twitter" ? "Twitter" : "LinkedIn"}
            />
          ) : (
            <CitedBody body={mainContent} citations={citations} />
          )}
        </div>
      </section>

      <ReasoningTrail trace={trail} employeeName={employeeName} />

      {moment ? (
        <div ref={momentRef}>
          <VerdictMoment
            verdict={moment.verdict}
            diff={moment.diff}
            candidates={moment.candidates}
            manualRuleNumber={moment.manualRuleNumber}
            checkInLine={checkInLine}
            onAdjustCheckIn={moment.checkInId ? () => setCheckInModalOpen(true) : undefined}
            onDone={() => {
              router.push("/reviews");
              router.refresh();
            }}
          />
        </div>
      ) : (
        reviewable && (
          <>
            <section aria-label="Feedback" className="rule-t pt-2.5">
              <h2 className="text-[15px] font-semibold">Mark it up</h2>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {FEEDBACK_CHIPS.map((chip) => {
                  const selected = selectedChips.has(chip.value);
                  return (
                    <button
                      key={chip.value}
                      onClick={() => toggleChip(chip.value)}
                      aria-pressed={selected}
                      className={`rounded-[2px] border px-2.5 py-1.5 text-[12px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
                        selected
                          ? "border-ink bg-ink text-white"
                          : "border-hairline text-ink-secondary hover:border-ink hover:text-ink"
                      }`}
                    >
                      {chip.label}
                    </button>
                  );
                })}
              </div>

              <label htmlFor="signoff-note" className="spec-label mt-4 block">
                Sign-off note (optional)
              </label>
              <textarea
                id="signoff-note"
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder={`What should ${employeeName} repeat, and what should they avoid?`}
                rows={3}
                className="mt-1.5 block w-full resize-none border border-hairline bg-bg px-3.5 py-2.5 text-sm text-ink outline-none placeholder:text-ink-muted focus-visible:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              />
              <p className="spec mt-1 text-ink-muted">
                A sentence here becomes a candidate rule in the operating manual.
              </p>
            </section>

            {rejectMode && (
              <section aria-label="Reject" className="border border-state-failed p-4">
                <label htmlFor="reject-reason" className="spec-label block text-state-failed">
                  Why is this rejected?
                </label>
                <textarea
                  id="reject-reason"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={3}
                  placeholder={`What was wrong with the approach? ${employeeName} files it as an avoid-pattern.`}
                  className="mt-1.5 block w-full resize-none border border-hairline bg-bg px-3.5 py-2.5 text-sm text-ink outline-none placeholder:text-ink-muted focus-visible:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                  autoFocus
                />
                <p className="spec mt-1.5 text-ink-secondary">
                  Rejecting ends the job. The reason becomes a high-signal avoid rule, 10
                  characters minimum.
                </p>
                <div className="mt-2.5 flex gap-2">
                  <button
                    onClick={() => {
                      setRejectMode(false);
                      setRejectReason("");
                    }}
                    disabled={reject.isPending}
                    className="btn-ghost px-3 py-1.5 text-[12px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
                  >
                    Keep reviewing
                  </button>
                  <button
                    onClick={handleReject}
                    disabled={reject.isPending || rejectReason.trim().length < 10}
                    className="btn-ink bg-state-failed px-3 py-1.5 text-[12px] hover:bg-state-failed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-40"
                  >
                    {reject.isPending ? "Rejecting..." : "Confirm reject"}
                  </button>
                </div>
              </section>
            )}

            {actionError && (
              <p className="spec text-state-failed" role="alert">
                {actionError}
              </p>
            )}

            <div className="rule-t flex flex-wrap items-center gap-2 pt-3">
              <button
                onClick={() => setRejectMode((v) => !v)}
                disabled={reject.isPending}
                aria-expanded={rejectMode}
                className="btn-ghost text-state-failed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
              >
                Reject
              </button>
              <button
                onClick={handleSendBack}
                disabled={
                  requestRevision.isPending ||
                  isEditing ||
                  (selectedChips.size === 0 && !feedbackText.trim() && !wasEdited)
                }
                className="btn-ghost focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-40"
              >
                {requestRevision.isPending ? "Sending back..." : "Send back"}
              </button>
              <span className="flex-1" />
              <button
                onClick={() => {
                  setDraftText(mainContent);
                  setIsEditing(true);
                }}
                disabled={isEditing}
                className="btn-ghost focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-40"
              >
                Edit
              </button>
              <button
                onClick={handleAccept}
                disabled={approve.isPending || isEditing}
                className="btn-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
              >
                {approve.isPending ? "Signing off..." : "Accept"}
              </button>
            </div>
          </>
        )
      )}

      <CheckInModal
        open={checkInModalOpen}
        scheduledFor={moment?.scheduledFor ?? null}
        deliverableType={deliverable.deliverableType}
        checkInId={moment?.checkInId}
        employeeName={employeeName}
        onDismiss={() => setCheckInModalOpen(false)}
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
      <div className="flex items-center justify-between gap-3 border border-identity px-3.5 py-2.5">
        <div>
          <p className="spec font-semibold text-identity-deep">Publishing in {left}s</p>
          <p className="spec mt-0.5 text-ink-secondary">
            Cancel here or from the review page to keep it accepted.
          </p>
        </div>
        <button
          onClick={onCancel}
          disabled={cancelPending || left === 0}
          className="btn-ghost px-3 py-1.5 text-[12px] text-state-failed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
        >
          {cancelPending ? "Cancelling..." : "Cancel publish"}
        </button>
      </div>
    );
  }

  if (status === "accepted" && PUBLISHABLE_TYPES.has(deliverableType)) {
    return (
      <div className="panel-tinted flex items-center justify-between gap-3 px-3.5 py-2.5">
        <div>
          <p className="text-[13.5px] font-medium">Accepted. Publish when ready.</p>
          <p className="spec mt-0.5 text-ink-muted">
            Queues with a 60-second cancel window; manual publish lives in Settings.
          </p>
        </div>
        <button
          onClick={onQueue}
          disabled={queuePending}
          className="btn-ink px-3 py-1.5 text-[12px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
        >
          {queuePending ? "Queueing..." : "Publish in 60s"}
        </button>
      </div>
    );
  }

  if (status === "published") {
    return (
      <div className="panel-tinted px-3.5 py-2.5">
        <p className="spec font-semibold text-state-published">Published.</p>
      </div>
    );
  }

  return null;
}

function SocialPostPreview({ content, platform }: { content: string; platform: string }) {
  return (
    <div className="panel-tinted mx-auto max-w-md p-4">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-[2px] bg-ink font-mono text-[12px] uppercase text-white">
          Co
        </span>
        <div>
          <p className="text-[13.5px] leading-tight font-medium">Your company</p>
          <p className="spec-label mt-0.5">{platform} · draft preview</p>
        </div>
      </div>
      <p className="text-[14px] leading-relaxed whitespace-pre-wrap">{content}</p>
    </div>
  );
}
