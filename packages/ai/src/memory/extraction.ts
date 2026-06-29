import { getClient, getModelId } from "../models";
import { storeEpisode } from "./episodic";
import { db } from "@beast/db";
import { ruleCandidates } from "@beast/db";
import { eq, and, sql } from "drizzle-orm";
import { embed } from "./embeddings";

// ── Chip-to-signal mapping ──

interface Signal {
  type: string;
  direction: string;
  weight: number;
}

const CHIP_TO_SIGNAL: Record<string, Signal> = {
  too_formal: { type: "tone", direction: "make_casual", weight: 1.0 },
  too_casual: { type: "tone", direction: "make_formal", weight: 1.0 },
  too_long: { type: "length", direction: "shorten", weight: 1.0 },
  make_punchier: { type: "style", direction: "punchier", weight: 0.8 },
  add_data: { type: "content", direction: "add_evidence", weight: 0.8 },
  stronger_cta: { type: "structure", direction: "stronger_cta", weight: 0.8 },
  love_this: { type: "positive", direction: "repeat", weight: 1.5 },
  different_angle: { type: "content", direction: "reframe", weight: 0.8 },
};

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
  const client = getClient();
  const completion = await client.messages.create({
    model: getModelId("haiku"),
    max_tokens: 512,
    system: "Extract structured learning from a completed AI task. Return JSON only.",
    messages: [
      {
        role: "user",
        content: `Task type: ${input.taskType}
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
      },
    ],
  });

  const raw = completion.content[0]?.type === "text" ? completion.content[0].text : "{}";
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
}

/**
 * Three-step feedback extraction:
 * 1. Diff analysis (no LLM)
 * 2. Chip → signal mapping (no LLM)
 * 3. Implicit preference extraction via LLM (CIPHER-style)
 */
export async function extractFromFeedback(input: FeedbackInput): Promise<{
  episodeId: string;
  signals: Signal[];
}> {
  const signals: Signal[] = [];

  // Step 1: Diff analysis
  let diffSummary = "";
  let editDistance = 0;
  if (input.editedText && input.editedText !== input.originalText) {
    editDistance = normalizedEditDistance(input.originalText, input.editedText);
    const lengthDelta = input.editedText.length - input.originalText.length;
    diffSummary = `Edit distance: ${(editDistance * 100).toFixed(0)}%. Length ${lengthDelta > 0 ? "increased" : "decreased"} by ${Math.abs(lengthDelta)} chars.`;

    if (lengthDelta < -50) {
      signals.push({ type: "length", direction: "shorten", weight: 0.5 });
    }
    if (lengthDelta > 100) {
      signals.push({ type: "length", direction: "expand", weight: 0.5 });
    }
  }

  // Step 2: Chip → signal
  for (const chip of input.chips) {
    const signal = CHIP_TO_SIGNAL[chip];
    if (signal) signals.push(signal);
  }

  // Step 3: Implicit preference extraction (LLM)
  let inferredPreference = "";
  if (input.editedText && editDistance > 0.05) {
    const client = getClient();
    const completion = await client.messages.create({
      model: getModelId("haiku"),
      max_tokens: 256,
      system: "Analyze user edits to infer implicit preferences. Be specific. One sentence.",
      messages: [
        {
          role: "user",
          content: `Task type: ${input.taskType}
Chips applied: ${input.chips.join(", ") || "none"}
${input.annotationText ? `Written feedback: ${input.annotationText}` : ""}
Original (first 500): ${input.originalText.slice(0, 500)}
Edited (first 500): ${input.editedText.slice(0, 500)}

What implicit preference does this edit pattern reveal?`,
        },
      ],
    });
    inferredPreference = completion.content[0]?.type === "text" ? completion.content[0].text : "";
  }

  // Store as episodic memory
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
      diffSummary,
      editDistance,
      inferredPreference,
      signals,
    },
    taskId: input.taskId,
    salienceScore: feedbackType === "edit" ? 0.8 : 0.6,
  });

  for (const signal of signals) {
    await accumulateSignal({
      agentId: input.agentId,
      tenantId: input.tenantId,
      signal,
      taskType: input.taskType,
      episodeId,
    });
  }

  return { episodeId, signals };
}

// ── Signal Accumulation ──

const PROMOTION_THRESHOLDS: Record<string, number> = {
  tone: 3,
  length: 3,
  style: 3,
  content: 3,
  structure: 3,
  brand: 1,
  positive: 2,
};

interface AccumulateInput {
  agentId: string;
  tenantId: string;
  signal: Signal;
  taskType: string;
  episodeId: string;
}

/**
 * Accumulate a signal into rule_candidates.
 * When threshold is met, promotes to procedural memory.
 */
async function accumulateSignal(input: AccumulateInput): Promise<void> {
  const candidateTitle = `${input.signal.direction} for ${input.taskType}`;

  // Check if a matching candidate exists
  const existing = await db.query.ruleCandidates.findFirst({
    where: and(
      eq(ruleCandidates.agentId, input.agentId),
      eq(ruleCandidates.tenantId, input.tenantId),
      eq(ruleCandidates.title, candidateTitle),
    ),
  });

  if (existing && !existing.promotedToId) {
    // Increment signal count
    const newCount = (existing.signalCount ?? 0) + 1;
    const newWeight = (existing.signalWeight ?? 0) + input.signal.weight;
    const episodes = [...((existing.sourceEpisodes as string[]) ?? []), input.episodeId];

    await db
      .update(ruleCandidates)
      .set({
        signalCount: newCount,
        signalWeight: newWeight,
        sourceEpisodes: episodes,
        updatedAt: new Date(),
      })
      .where(eq(ruleCandidates.id, existing.id));

    // Check if threshold is met for promotion
    const threshold = PROMOTION_THRESHOLDS[input.signal.type] ?? 3;
    if (newCount >= threshold) {
      await promoteToProceduralMemory({
        candidateId: existing.id,
        agentId: input.agentId,
        tenantId: input.tenantId,
        title: candidateTitle,
        description: `Auto-promoted rule: ${input.signal.direction}. Accumulated ${newCount} signals from feedback.`,
        ruleType: input.signal.type === "positive" ? "approved_example" : "style_rule",
        taskScope: [input.taskType],
        sourceEpisodes: episodes,
        signalCount: newCount,
        signalWeight: newWeight,
      });
    }
  } else if (!existing) {
    // Create new candidate
    await db.insert(ruleCandidates).values({
      agentId: input.agentId,
      tenantId: input.tenantId,
      ruleType: input.signal.type === "positive" ? "approved_example" : "style_rule",
      taskScope: [input.taskType],
      title: candidateTitle,
      description: `Signal: ${input.signal.direction} (${input.signal.type})`,
      signalCount: 1,
      signalWeight: input.signal.weight,
      sourceEpisodes: [input.episodeId],
    });
  }
}

// ── Promotion to Procedural Memory ──

interface PromoteInput {
  candidateId: string;
  agentId: string;
  tenantId: string;
  title: string;
  description: string;
  ruleType: string;
  taskScope: string[];
  sourceEpisodes: string[];
  signalCount: number;
  signalWeight: number;
}

async function promoteToProceduralMemory(input: PromoteInput): Promise<void> {
  const { upsertProceduralRule } = await import("./procedural");

  const ruleId = await upsertProceduralRule({
    agentId: input.agentId,
    tenantId: input.tenantId,
    ruleType: input.ruleType,
    title: input.title,
    description: input.description,
    taskScope: input.taskScope,
    sourceEpisodes: input.sourceEpisodes,
    signalCount: input.signalCount,
    signalWeight: input.signalWeight,
  });

  // Mark candidate as promoted
  await db
    .update(ruleCandidates)
    .set({ promotedToId: ruleId, updatedAt: new Date() })
    .where(eq(ruleCandidates.id, input.candidateId));
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
}

// Lowered from 20 to 10 chars so short founder verdicts ("wrong tone",
// "too pushy", "off-brand voice") still produce a procedural rule. The
// downstream Haiku call distils into a 20-word imperative regardless of
// input length, so a short rationale yields a clean rule.
const MIN_RATIONALE_CHARS = 10;
const RATIONALE_SIGNAL_WEIGHT = 1.5;

/**
 * Founder writes a rationale explaining why they approved a deliverable.
 * Run that text through Haiku to extract a single "always do" or "never do"
 * preference, then upsert it as a rule candidate with high signal weight
 * (explicit founder intent ranks higher than diff-inferred preferences).
 */
export async function extractRuleFromRationale(input: RationaleInput): Promise<{
  candidateId: string | null;
  ruleType: "do" | "dont";
  ruleText: string;
} | null> {
  if (input.rationale.trim().length < MIN_RATIONALE_CHARS) return null;

  const client = getClient();
  const completion = await client.messages.create({
    model: getModelId("haiku"),
    max_tokens: 256,
    system: "Distil a founder's approval rationale into a single procedural rule for an AI employee. Return JSON only.",
    messages: [
      {
        role: "user",
        content: `Task type: ${input.taskType}
Approved output (first 500 chars): ${input.outputText.slice(0, 500)}
Founder rationale: ${input.rationale.slice(0, 800)}

Extract one rule the AI employee should follow on similar tasks.

{
  "rule_type": "do" | "dont",
  "rule_text": "imperative sentence under 20 words",
  "applies_to": "this task type only" | "all output for this employee"
}

Return null fields if no concrete rule can be extracted.`,
      },
    ],
  });

  const raw = completion.content[0]?.type === "text" ? completion.content[0].text : "{}";
  let parsed: { rule_type?: string; rule_text?: string; applies_to?: string };
  try {
    parsed = JSON.parse(raw.replace(/^```json?\s*/i, "").replace(/\s*```$/, ""));
  } catch {
    return null;
  }

  if (!parsed.rule_text || !parsed.rule_type) return null;
  const ruleType = parsed.rule_type === "dont" ? "dont" : "do";
  const ruleText = parsed.rule_text.slice(0, 200);
  const scope = parsed.applies_to === "all output for this employee"
    ? ["all"]
    : [input.taskType];

  const candidateTitle = `${ruleType === "do" ? "Always" : "Never"}: ${ruleText.slice(0, 80)}`;
  const sourceEpisodes = input.episodeId ? [input.episodeId] : [];

  const existing = await db.query.ruleCandidates.findFirst({
    where: and(
      eq(ruleCandidates.agentId, input.agentId),
      eq(ruleCandidates.tenantId, input.tenantId),
      eq(ruleCandidates.title, candidateTitle),
    ),
  });

  if (existing && !existing.promotedToId) {
    const newCount = (existing.signalCount ?? 0) + 1;
    const newWeight = (existing.signalWeight ?? 0) + RATIONALE_SIGNAL_WEIGHT;
    const episodes = [...((existing.sourceEpisodes as string[]) ?? []), ...sourceEpisodes];
    await db
      .update(ruleCandidates)
      .set({ signalCount: newCount, signalWeight: newWeight, sourceEpisodes: episodes, updatedAt: new Date() })
      .where(eq(ruleCandidates.id, existing.id));

    if (newCount >= 2) {
      const { upsertProceduralRule } = await import("./procedural");
      const ruleId = await upsertProceduralRule({
        agentId: input.agentId,
        tenantId: input.tenantId,
        ruleType: ruleType === "do" ? "style_rule" : "avoid_pattern",
        title: candidateTitle,
        description: `Founder rationale: ${ruleText}`,
        taskScope: scope,
        sourceEpisodes: episodes,
        signalCount: newCount,
        signalWeight: newWeight,
      });
      await db
        .update(ruleCandidates)
        .set({ promotedToId: ruleId, updatedAt: new Date() })
        .where(eq(ruleCandidates.id, existing.id));
    }
    return { candidateId: existing.id, ruleType, ruleText };
  }

  if (!existing) {
    const inserted = await db
      .insert(ruleCandidates)
      .values({
        agentId: input.agentId,
        tenantId: input.tenantId,
        ruleType: ruleType === "do" ? "style_rule" : "avoid_pattern",
        taskScope: scope,
        title: candidateTitle,
        description: `Founder rationale: ${ruleText}`,
        signalCount: 1,
        signalWeight: RATIONALE_SIGNAL_WEIGHT,
        sourceEpisodes,
      })
      .returning({ id: ruleCandidates.id });
    return { candidateId: inserted[0]?.id ?? null, ruleType, ruleText };
  }

  return { candidateId: existing.id, ruleType, ruleText };
}

// ── Few-shot Calibration ──

/**
 * Store an approved deliverable as a canonical example for its task type.
 */
export async function storeApprovedExample(input: {
  agentId: string;
  tenantId: string;
  taskType: string;
  taskTitle: string;
  outputText: string;
  taskId: string;
}): Promise<void> {
  const { upsertProceduralRule } = await import("./procedural");

  await upsertProceduralRule({
    agentId: input.agentId,
    tenantId: input.tenantId,
    ruleType: "approved_example",
    title: `Approved: ${input.taskTitle}`,
    description: `This ${input.taskType} was approved without edits. Use as reference for quality and style.`,
    taskScope: [input.taskType],
    examples: {
      good: [input.outputText.slice(0, 2000)],
    },
    sourceEpisodes: [],
    signalCount: 1,
    signalWeight: 2.0,
  });
}

// ── Utility: Normalized edit distance ──

function normalizedEditDistance(a: string, b: string): number {
  if (a === b) return 0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 0;

  // Simple length-based approximation for performance
  // Full Levenshtein is expensive for long texts
  const lenDiff = Math.abs(a.length - b.length);
  const charOverlap = countCharOverlap(a, b);
  return 1 - charOverlap / maxLen + lenDiff / maxLen / 2;
}

function countCharOverlap(a: string, b: string): number {
  const aChars = new Map<string, number>();
  for (const c of a) {
    aChars.set(c, (aChars.get(c) ?? 0) + 1);
  }
  let overlap = 0;
  for (const c of b) {
    const count = aChars.get(c);
    if (count && count > 0) {
      overlap++;
      aChars.set(c, count - 1);
    }
  }
  return overlap;
}
