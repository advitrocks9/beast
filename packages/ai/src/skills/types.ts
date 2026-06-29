import type { z } from "zod";
import type { ToolDefinition, ModelTier } from "../types";

export interface SkillStep {
  id: string;
  name: string;
  prompt: string;
  dependsOn?: string[];
  model?: ModelTier;
  humanGate?: boolean;
}

export interface QualityCheck {
  name: string;
  check: (output: string) => { passed: boolean; feedback: string };
}

export interface SkillCalibration {
  exampleOutputs: string[];
  avoidPatterns: string[];
}

export interface Skill<TInput = unknown, TOutput = unknown> {
  id: string;
  name: string;
  employeeType: "marketing" | "sales" | "support";
  inputSchema: z.ZodType<TInput>;
  outputSchema: z.ZodType<TOutput>;
  steps: SkillStep[];
  tools: ToolDefinition[];
  qualityChecks: QualityCheck[];
  calibration: SkillCalibration;
  selfReviewPrompt: string;
  maxSelfRevisions: number;
}

export interface SkillStepResult {
  stepId: string;
  output: string;
  tokensUsed: number;
}

export interface SkillResult<TOutput = unknown> {
  output: TOutput;
  rawOutput: string;
  steps: SkillStepResult[];
  selfReviewPassed: boolean;
  revisionCount: number;
  totalTokens: { input: number; output: number };
  durationMs: number;
}
