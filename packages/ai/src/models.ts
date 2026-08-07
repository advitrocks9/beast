import type Anthropic from "@anthropic-ai/sdk";
import type { Tier } from "./provider";
import { ANTHROPIC_MODELS, getAnthropicClient } from "./provider/anthropic";
import type { ModelTier } from "./types";

// Temporary shim for the onboarding router's tool-use flow; new code uses resolveProvider().
const LEGACY_TIER: Record<ModelTier, Tier> = {
  haiku: "fast",
  sonnet: "standard",
  opus: "deep",
};

export function getModelId(tier: ModelTier): string {
  return ANTHROPIC_MODELS[LEGACY_TIER[tier]];
}

export function getClient(): Anthropic {
  return getAnthropicClient();
}
