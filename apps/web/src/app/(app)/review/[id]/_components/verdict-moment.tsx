"use client";

import { StateChip } from "@/components/state-chip";

export interface DiffSpanWire {
  type: "kept" | "added" | "removed";
  text: string;
}

export interface CandidateWire {
  id: string;
  title: string;
  description: string;
  confidence: number;
  distinctReviewCount: number;
  promotedRuleId: string | null;
}

interface VerdictMomentProps {
  verdict: "accepted" | "revising";
  diff: { spans: DiffSpanWire[] } | null;
  candidates: CandidateWire[];
  manualRuleNumber: number | null;
  checkInLine: string | null;
  onAdjustCheckIn?: () => void;
  onDone: () => void;
}

export function VerdictMoment({
  verdict,
  diff,
  candidates,
  manualRuleNumber,
  checkInLine,
  onAdjustCheckIn,
  onDone,
}: VerdictMomentProps) {
  const promoted = candidates.some((c) => c.promotedRuleId);

  return (
    <section aria-label="Review filed" aria-live="polite" className="panel border-rule">
      <header className="rule-b flex items-center justify-between gap-3 px-4 py-3">
        <div>
          <p className="spec-label">Review filed</p>
          <p className="mt-0.5 text-[15px] font-semibold">
            {verdict === "accepted"
              ? "Signed off. The company keeps what you kept."
              : "Sent back. The edit travels with the job."}
          </p>
        </div>
        <span className="stamp-in">
          <StateChip status={verdict} />
        </span>
      </header>

      <div className="space-y-4 px-4 py-4">
        {diff && diff.spans.length > 0 && (
          <div>
            <p className="spec-label">Your edit, word for word</p>
            <p className="panel-tinted mt-1.5 max-h-56 overflow-y-auto p-3 text-[13.5px] leading-relaxed">
              {diff.spans.map((span, i) =>
                span.type === "added" ? (
                  <span key={i} className="bg-identity-tint text-identity-deep">
                    {span.text}{" "}
                  </span>
                ) : span.type === "removed" ? (
                  <span key={i} className="text-ink-muted line-through decoration-[1px]">
                    {span.text}{" "}
                  </span>
                ) : (
                  <span key={i} className="text-ink-secondary">
                    {span.text}{" "}
                  </span>
                ),
              )}
            </p>
          </div>
        )}

        {candidates.length === 0 ? (
          <p className="text-[13px] text-ink-muted">
            No new signal from this review. The manual stands as written.
          </p>
        ) : (
          <div>
            <p className="spec-label">
              Candidate amendment{candidates.length === 1 ? "" : "s"}
            </p>
            <ul className="mt-1.5 space-y-2.5">
              {candidates.map((c, i) => (
                <li
                  key={c.id}
                  className="panel line-arrive p-3"
                  style={{ animationDelay: `${i * 120}ms` }}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 flex-1 text-[13.5px] leading-snug font-medium">
                      {c.title}
                    </p>
                    <ConfidenceTallies count={c.distinctReviewCount} baseDelayMs={i * 120} />
                  </div>
                  <p className="spec mt-1 text-ink-muted">
                    {c.distinctReviewCount} review{c.distinctReviewCount === 1 ? "" : "s"} ·
                    confidence {c.confidence.toFixed(2)}
                  </p>
                  {c.promotedRuleId ? (
                    <p
                      className="stamp-in mt-2 inline-block border border-identity px-2 py-1"
                      style={{ animationDelay: `${i * 120 + 260}ms` }}
                    >
                      <span className="spec font-semibold tracking-[0.08em] text-identity-deep uppercase">
                        Promoted to the manual
                        {manualRuleNumber !== null
                          ? ` · R-${String(manualRuleNumber).padStart(3, "0")}`
                          : ""}
                      </span>
                    </p>
                  ) : (
                    <p className="spec mt-1.5 text-ink-secondary">
                      Corroborating reviews promote it. One review never does.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {promoted && (
          <p className="text-[13px] leading-snug text-ink-secondary">
            The manual just changed. Every future run on this kind of work loads the new rule
            before its first step.
          </p>
        )}
      </div>

      <footer className="hairline-t flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <p className="spec text-ink-muted">
          {checkInLine ?? ""}
          {checkInLine && onAdjustCheckIn && (
            <>
              {" · "}
              <button
                type="button"
                onClick={onAdjustCheckIn}
                className="font-semibold text-ink underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                adjust
              </button>
            </>
          )}
        </p>
        <button type="button" onClick={onDone} className="btn-ink">
          Back to the tray
        </button>
      </footer>
    </section>
  );
}

function ConfidenceTallies({ count, baseDelayMs }: { count: number; baseDelayMs: number }) {
  return (
    <span aria-hidden className="inline-flex shrink-0 items-end gap-[2px]">
      {Array.from({ length: 3 }, (_, i) => (
        <span
          key={i}
          className={`inline-block h-2.5 w-[3px] ${i < count ? "tally-fill bg-identity" : "bg-hairline"}`}
          style={i < count ? { animationDelay: `${baseDelayMs + i * 90}ms` } : undefined}
        />
      ))}
    </span>
  );
}
