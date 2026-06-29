import Anthropic from "@anthropic-ai/sdk";
import type { ModelTier } from "./types";

const MODEL_MAP: Record<ModelTier, string> = {
  haiku: "claude-haiku-4-5-20251001",
  sonnet: "claude-sonnet-4-6",
  opus: "claude-opus-4-8",
};

const MAX_TOKENS: Record<ModelTier, number> = {
  haiku: 2048,
  sonnet: 8192,
  opus: 8192,
};

export function getModelId(tier: ModelTier): string {
  return MODEL_MAP[tier];
}

export function getMaxTokens(tier: ModelTier): number {
  return MAX_TOKENS[tier];
}

/**
 * Pick model tier based on task complexity.
 * Haiku: simple extraction, classification, short summaries.
 * Sonnet: default for all content generation.
 * Opus: strategic planning, goal breakdown, complex analysis.
 */
export function selectModel(taskType: string, estimatedOutputTokens?: number): ModelTier {
  if (estimatedOutputTokens && estimatedOutputTokens < 500) {
    return "haiku";
  }

  const opusTasks = ["goal_breakdown", "strategy", "campaign_plan", "competitor_analysis"];
  if (opusTasks.includes(taskType)) {
    return "opus";
  }

  return "sonnet";
}

let _client: Anthropic | null = null;

export function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic();
  }
  return _client;
}
