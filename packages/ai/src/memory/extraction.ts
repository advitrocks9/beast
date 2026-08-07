import { complete } from "../provider";
import { storeEpisode } from "./episodic";
import { db } from "@beast/db";
import { ruleCandidates } from "@beast/db";
import { eq, and, or, isNull } from "drizzle-orm";
import { diffWords, type WordDiff } from "./diff";
import { upsertProceduralRule } from "./procedural";

const PROMOTION_THRESHOLDS = {
  tone: 3,
  length: 3,
  style: 3,
  content: 3,
  structure: 3,
  pattern: 3,
  positive: 2,
  rationale: 2,
  founder_directive: 0,
} as const;

export type SignalCategory = keyof typeof PROMOTION_THRESHOLDS;

const CONFIDENCE_GATE = 0.6;

export function confidenceFrom(weightSum: number): number {
  return 1 - Math.exp(-weightSum / 2);
}

interface Signal {
  category: SignalCategory;
  direction: string;
  weight: number;
}

const CHIP_TO_SIGNAL: Record<string, Signal> = {
  too_formal: { category: "tone", direction: "make_casual", weight: 1.0 },
  too_casual: { category: "tone", direction: "make_formal", weight: 1.0 },
  too_long: { category: "length", direction: "shorten", weight: 1.0 },
  make_punchier: { category: "style", direction: "punchier", weight: 0.8 },
  add_data: { category: "content", direction: "add_evidence", weight: 0.8 },
  stronger_cta: { category: "structure", direction: "stronger_cta", weight: 0.8 },
  love_this: { category: "positive", direction: "repeat", weight: 1.5 },
  different_angle: { category: "content", direction: "reframe", weight: 0.8 },
};

export interface CandidateResult {
  id: string;
  title: string;
  description: string;
  confidence: number;
  distinctReviewCount: number;
  promotedRuleId: string | null;
}

/** Candidates don't persist their signal category, so displayed thresholds
 * derive from ruleType; rationale-born style rules show 3 despite needing 2. */
export function candidateThreshold(ruleType: string): number {
  return ruleType === "approved_example"
    ? PROMOTION_THRESHOLDS.positive
    : PROMOTION_THRESHOLDS.style;
}

// ── Task Completion Extraction ──

interface TaskCompletionInput {
  agentId: string;
  tenantId: string;
  taskId?: string;
  taskType: string;
  taskTitle: string;
  outputText: string;
  status: "approved" | "revision" | "rejected";
}

/**
 * Extract episodic memories from a completed task.
 * Runs async after task completion - does not block the user.
 */
export async function extractFromTaskCompletion(input: TaskCompletionInput): Promise<string> {
  const raw = await complete({
    tier: "fast",
    purpose: "task_completion_extraction",
    system: "Extract structured learning from a completed AI task. Return JSON only.",
    prompt: `Task type: ${input.taskType}
Task title: ${input.taskTitle}
Approval status: ${input.status}
Output (first 2000 chars): ${input.outputText.slice(0, 2000)}

Extract:
{
  "techniques_used": ["specific techniques in this deliverable"],
  "quality_signals": ["what made this work well or poorly"],
  "reusable_patterns": ["patterns transferable to future tasks (only if approved)"],
  "episode_summary": "One sentence: what happened and the outcome."
}

If status is rejected, focus on what NOT to do. Return empty arrays if nothing significant.`,
  });

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw.replace(/^```json?\s*/i, "").replace(/\s*```$/, ""));
  } catch {
    parsed = { episode_summary: `Completed ${input.taskType}: ${input.taskTitle} - ${input.status}` };
  }

  const summary = (parsed.episode_summary as string) ?? `${input.taskType}: ${input.taskTitle} - ${input.status}`;
  const salience = input.status === "approved" ? 0.6 : input.status === "rejected" ? 0.9 : 0.7;

  return storeEpisode({
    agentId: input.agentId,
    tenantId: input.tenantId,
    episodeType: "task_completed",
    summary,
    content: {
      taskType: input.taskType,
      taskTitle: input.taskTitle,
      finalStatus: input.status,
      techniques: parsed.techniques_used ?? [],
      qualitySignals: parsed.quality_signals ?? [],
      reusablePatterns: parsed.reusable_patterns ?? [],
    },
    taskId: input.taskId,
    salienceScore: salience,
  });
}

// ── Feedback Extraction ──

interface FeedbackInput {
  agentId: string;
  tenantId: string;
  taskId?: string;
  taskType: string;
  originalText: string;
  editedText?: string;
  chips: string[];
  annotationText?: string;
  reviewId: string;
  demoSessionId?: string | null;
}

/**
 * Three-step feedback extraction:
 * 1. Word-level LCS diff (no LLM)
 * 2. Chip → signal mapping (no LLM)
 * 3. Implicit preference extraction via LLM (CIPHER-style)
 */
export async function extractFromFeedback(input: FeedbackInput): Promise<{
  episodeId: string;
  diff: WordDiff | null;
  candidates: CandidateResult[];
}> {
  const signals: Signal[] = [];

  let diff: WordDiff | null = null;
  if (input.editedText && input.editedText !== input.originalText) {
    diff = diffWords(input.originalText, input.editedText);
    const lengthDelta = input.editedText.length - input.originalText.length;
    if (lengthDelta < -50) {
      signals.push({ category: "length", direction: "shorten", weight: 0.5 });
    }
    if (lengthDelta > 100) {
      signals.push({ category: "length", direction: "expand", weight: 0.5 });
    }
  }

  for (const chip of input.chips) {
    const signal = CHIP_TO_SIGNAL[chip];
    if (signal) signals.push(signal);
  }

  let inferredPreference = "";
  if (input.editedText && diff && diff.magnitude > 0.05) {
    inferredPreference = await complete({
      tier: "fast",
      purpose: "edit_preference_inference",
      system: "Analyze user edits to infer implicit preferences. Be specific. One sentence.",
      prompt: `Task type: ${input.taskType}
Chips applied: ${input.chips.join(", ") || "none"}
${input.annotationText ? `Written feedback: ${input.annotationText}` : ""}
Original (first 500): ${input.originalText.slice(0, 500)}
Edited (first 500): ${input.editedText.slice(0, 500)}

What implicit preference does this edit pattern reveal?`,
    });
  }

  const feedbackType = input.editedText ? "edit" : input.chips.length > 0 ? "chip_only" : "annotation";
  const summary = [
    `Feedback on ${input.taskType}: ${feedbackType}.`,
    input.chips.length > 0 ? `Chips: ${input.chips.join(", ")}.` : "",
    inferredPreference ? `Inferred: ${inferredPreference}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const episodeId = await storeEpisode({
    agentId: input.agentId,
    tenantId: input.tenantId,
    episodeType: "feedback_received",
    summary,
    content: {
      feedbackType,
      taskType: input.taskType,
      chips: input.chips,
      annotationText: input.annotationText,
      editMagnitude: diff?.magnitude ?? 0,
      inferredPreference,
      signals,
      reviewId: input.reviewId,
    },
    taskId: input.taskId,
    salienceScore: feedbackType === "edit" ? 0.8 : 0.6,
  });

  const byId = new Map<string, CandidateResult>();
  for (const signal of signals) {
    const result = await accumulateSignal({
      agentId: input.agentId,
      tenantId: input.tenantId,
      category: signal.category,
      ruleType: signal.category === "positive" ? "approved_example" : "style_rule",
      taskScope: [input.taskType],
      title: `${signal.direction} for ${input.taskType}`,
      description: `Signal: ${signal.direction} (${signal.category})`,
      weight: signal.weight,
      reviewId: input.reviewId,
      episodeIds: [episodeId],
      demoSessionId: input.demoSessionId,
    });
    byId.set(result.id, result);
  }

  return { episodeId, diff, candidates: [...byId.values()] };
}

// ── Signal Accumulation ──

export interface AccumulateSignalInput {
  agentId: string;
  tenantId: string;
  category: SignalCategory;
  ruleType: string;
  taskScope: string[];
  title: string;
  description: string;
  weight: number;
  reviewId: string;
  episodeIds?: string[];
  examples?: { good?: string[]; bad?: string[] };
  /** Demo visitor session: seed candidates are cloned into the session
   * (copy-on-write) instead of mutated, and new candidates carry the stamp. */
  demoSessionId?: string | null;
}

/**
 * The single entry point into the learning loop. Every signal lands on a
 * rule candidate; a candidate promotes to procedural memory only when
 * distinctReviewCount >= threshold(category) AND confidence >= 0.6.
 * Nothing else may write procedural_memories.
 */
export async function accumulateSignal(input: AccumulateSignalInput): Promise<CandidateResult> {
  const demoSessionId = input.demoSessionId ?? null;
  const matches = await db.query.ruleCandidates.findMany({
    where: and(
      eq(ruleCandidates.agentId, input.agentId),
      eq(ruleCandidates.tenantId, input.tenantId),
      eq(ruleCandidates.title, input.title),
      demoSessionId
        ? or(isNull(ruleCandidates.demoSessionId), eq(ruleCandidates.demoSessionId, demoSessionId))
        : isNull(ruleCandidates.demoSessionId),
    ),
  });
  const existing = matches.find((m) => m.demoSessionId !== null) ?? matches[0];

  if (existing?.promotedToId) {
    return {
      id: existing.id,
      title: existing.title,
      description: existing.description,
      confidence: existing.confidence,
      distinctReviewCount: existing.distinctReviewCount,
      promotedRuleId: existing.promotedToId,
    };
  }

  const fold = (base: NonNullable<typeof existing>) => {
    const seenReviews = base.sourceReviewIds ?? [];
    const isNewReview = !seenReviews.includes(input.reviewId);
    const signalWeight = base.signalWeight + input.weight;
    return {
      signalCount: base.signalCount + 1,
      signalWeight,
      confidence: confidenceFrom(signalWeight),
      distinctReviewCount: base.distinctReviewCount + (isNewReview ? 1 : 0),
      sourceReviewIds: isNewReview ? [...seenReviews, input.reviewId] : seenReviews,
      sourceEpisodes: [...(base.sourceEpisodes ?? []), ...(input.episodeIds ?? [])],
    };
  };

  let candidate: NonNullable<typeof existing>;
  if (existing && existing.demoSessionId === null && demoSessionId) {
    const [cloned] = await db
      .insert(ruleCandidates)
      .values({
        agentId: existing.agentId,
        tenantId: existing.tenantId,
        ruleType: existing.ruleType,
        taskScope: existing.taskScope,
        title: existing.title,
        description: existing.description,
        demoSessionId,
        ...fold(existing),
      })
      .returning();
    if (!cloned) throw new Error("rule candidate clone returned no row");
    candidate = cloned;
  } else if (existing) {
    const [updated] = await db
      .update(ruleCandidates)
      .set({ ...fold(existing), updatedAt: new Date() })
      .where(eq(ruleCandidates.id, existing.id))
      .returning();
    if (!updated) throw new Error(`rule candidate ${existing.id} vanished mid-update`);
    candidate = updated;
  } else {
    const [inserted] = await db
      .insert(ruleCandidates)
      .values({
        agentId: input.agentId,
        tenantId: input.tenantId,
        ruleType: input.ruleType,
        taskScope: input.taskScope,
        title: input.title,
        description: input.description,
        signalCount: 1,
        signalWeight: input.weight,
        confidence: confidenceFrom(input.weight),
        distinctReviewCount: 1,
        sourceReviewIds: [input.reviewId],
        sourceEpisodes: input.episodeIds ?? [],
        demoSessionId,
      })
      .returning();
    if (!inserted) throw new Error("rule candidate insert returned no row");
    candidate = inserted;
  }

  let promotedRuleId: string | null = null;
  if (
    candidate.distinctReviewCount >= PROMOTION_THRESHOLDS[input.category] &&
    candidate.confidence >= CONFIDENCE_GATE
  ) {
    promotedRuleId = await promoteCandidate(candidate, input.examples);
  }

  return {
    id: candidate.id,
    title: candidate.title,
    description: candidate.description,
    confidence: candidate.confidence,
    distinctReviewCount: candidate.distinctReviewCount,
    promotedRuleId,
  };
}

async function promoteCandidate(
  candidate: {
    id: string;
    agentId: string;
    tenantId: string;
    ruleType: string;
    taskScope: string[] | null;
    title: string;
    description: string;
    sourceEpisodes: string[] | null;
    signalCount: number;
    signalWeight: number;
    confidence: number;
  },
  examples?: { good?: string[]; bad?: string[] },
): Promise<string> {
  const ruleId = await upsertProceduralRule({
    agentId: candidate.agentId,
    tenantId: candidate.tenantId,
    ruleType: candidate.ruleType,
    title: candidate.title,
    description: candidate.description,
    taskScope: candidate.taskScope ?? [],
    examples,
    sourceEpisodes: candidate.sourceEpisodes ?? [],
    signalCount: candidate.signalCount,
    signalWeight: candidate.signalWeight,
    confidence: candidate.confidence,
  });

  await db
    .update(ruleCandidates)
    .set({ promotedToId: ruleId, updatedAt: new Date() })
    .where(eq(ruleCandidates.id, candidate.id));

  return ruleId;
}

// ── Approval Rationale Extraction ──

interface RationaleInput {
  agentId: string;
  tenantId: string;
  taskId?: string;
  taskType: string;
  rationale: string;
  outputText: string;
  episodeId?: string;
  reviewId: string;
  demoSessionId?: string | null;
}

// Lowered from 20 to 10 chars so short founder verdicts ("wrong tone",
// "too pushy") still produce a rule candidate.
const MIN_RATIONALE_CHARS = 10;
const RATIONALE_SIGNAL_WEIGHT = 1.5;

/**
 * Distil a founder's approval/rejection rationale into a single "always" or
 * "never" preference and accumulate it as a high-weight rule candidate.
 */
export async function extractRuleFromRationale(input: RationaleInput): Promise<{
  candidate: CandidateResult;
  ruleType: "do" | "dont";
  ruleText: string;
} | null> {
  if (input.rationale.trim().length < MIN_RATIONALE_CHARS) return null;

  const raw = await complete({
    tier: "fast",
    purpose: "rationale_rule_extraction",
    system: "Distil a founder's approval rationale into a single procedural rule for an AI employee. Return JSON only.",
    prompt: `Task type: ${input.taskType}
Approved output (first 500 chars): ${input.outputText.slice(0, 500)}
Founder rationale: ${input.rationale.slice(0, 800)}

Extract one rule the AI employee should follow on similar tasks.

{
  "rule_type": "do" | "dont",
  "rule_text": "imperative sentence under 20 words",
  "applies_to": "this task type only" | "all output for this employee"
}

Return null fields if no concrete rule can be extracted.`,
  });

  let parsed: { rule_type?: string; rule_text?: string; applies_to?: string };
  try {
    parsed = JSON.parse(raw.replace(/^```json?\s*/i, "").replace(/\s*```$/, ""));
  } catch {
    return null;
  }

  if (!parsed.rule_text || !parsed.rule_type) return null;
  const ruleType = parsed.rule_type === "dont" ? "dont" : "do";
  const ruleText = parsed.rule_text.slice(0, 200);
  const scope = parsed.applies_to === "all output for this employee" ? ["all"] : [input.taskType];

  const candidate = await accumulateSignal({
    agentId: input.agentId,
    tenantId: input.tenantId,
    category: "rationale",
    ruleType: ruleType === "do" ? "style_rule" : "avoid_pattern",
    taskScope: scope,
    title: `${ruleType === "do" ? "Always" : "Never"}: ${ruleText.slice(0, 80)}`,
    description: `Founder rationale: ${ruleText}`,
    weight: RATIONALE_SIGNAL_WEIGHT,
    reviewId: input.reviewId,
    episodeIds: input.episodeId ? [input.episodeId] : [],
    demoSessionId: input.demoSessionId,
  });

  return { candidate, ruleType, ruleText };
}

// ── Approve-without-edits ──

/**
 * A clean approve corroborates the "repeat this" candidate for the task
 * type (same candidate the love_this chip feeds). One approve never
 * promotes; the second distinct review clears the positive threshold.
 */
export async function storeApprovedExample(input: {
  agentId: string;
  tenantId: string;
  taskType: string;
  taskTitle: string;
  outputText: string;
  taskId: string;
  reviewId: string;
  demoSessionId?: string | null;
}): Promise<CandidateResult> {
  return accumulateSignal({
    agentId: input.agentId,
    tenantId: input.tenantId,
    category: "positive",
    ruleType: "approved_example",
    taskScope: [input.taskType],
    title: `repeat for ${input.taskType}`,
    description: `Approved without edits; use as reference for ${input.taskType} quality and style.`,
    weight: 2.0,
    reviewId: input.reviewId,
    examples: { good: [input.outputText.slice(0, 2000)] },
    demoSessionId: input.demoSessionId,
  });
}

// ── Founder-authored rules ──

/**
 * Explicit founder intent (manual rule, hiring brief) needs no
 * corroboration: category founder_directive has threshold 0, so the
 * candidate promotes through the standard gate on creation.
 */
export async function seedFounderRule(input: {
  agentId: string;
  tenantId: string;
  ruleType: string;
  title: string;
  description: string;
  taskScope: string[];
  weight?: number;
  examples?: { good?: string[]; bad?: string[] };
}): Promise<{ candidateId: string; ruleId: string }> {
  const result = await accumulateSignal({
    agentId: input.agentId,
    tenantId: input.tenantId,
    category: "founder_directive",
    ruleType: input.ruleType,
    taskScope: input.taskScope,
    title: input.title,
    description: input.description,
    weight: input.weight ?? 2.0,
    reviewId: crypto.randomUUID(),
    examples: input.examples,
  });
  // weight >= 2.0 puts confidence at >= 0.63, past the 0.6 gate
  if (!result.promotedRuleId) throw new Error(`founder rule did not promote: ${result.title}`);
  return { candidateId: result.id, ruleId: result.promotedRuleId };
}
