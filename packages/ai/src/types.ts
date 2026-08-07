import type { AgentRunEvent, Citation, RunScratchpadItem } from "@beast/shared";
import type { ProviderMessage, RunToolDef, Tier } from "./provider";

// Agent identity and configuration
export interface AgentConfig {
  agentId: string;
  tenantId: string;
  name: string;
  roleType: "marketing" | "sales" | "support";
  persona: string;
  tier?: Tier;
  maxIterations?: number;
  maxDurationMs?: number;
}

// Task handed to the agent
export interface AgentTask {
  taskId: string;
  title: string;
  objective: string;
  taskType: string;
  brief: Record<string, unknown>;
  acceptanceCriteria?: string[];
}

// Legacy model names kept for the models.ts shim and skill step configs
export type ModelTier = "haiku" | "sonnet" | "opus";

/**
 * What a tool returns. Either a plain string (legacy) or a structured object
 * carrying both the model-facing text and the citations the harness should
 * pass through to the deliverable. Tools that produce sources (web search,
 * KB lookup, competitor scan) use the structured form; tools that produce
 * actions (save_goal, save_knowledge) keep returning strings.
 */
export type ToolExecuteResult = string | { text: string; citations?: Citation[] };

// Tool definition that the agent can call
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: RunToolDef["inputSchema"];
  execute: (input: Record<string, unknown>) => Promise<ToolExecuteResult>;
}

// Memory retrieved at task start
export interface RetrievedMemory {
  type: "episodic" | "semantic" | "procedural";
  content: string;
  score: number;
  /** Source provenance for semantic memories (KB chunks). Used to mint Citations. */
  sourceRef?: {
    chunkId: string;
    knowledgeItemId: string;
    category: string;
    title: string;
  };
}

// Scratchpad item for working memory; canonical shape lives in @beast/shared
// so the web stream consumers never import @beast/ai.
export type ScratchpadItem = RunScratchpadItem;

// Events emitted during agent execution; same union the SSE stream serves.
export type AgentEvent = AgentRunEvent;

// Callback for streaming events
export type AgentEventHandler = (event: AgentEvent) => void;

// Captured tool call for the reasoning trail.
// Persisted on deliverables.content.trail so the review page can render
// "Alex read 8 pages, ran 4 searches" + the click-to-expand source list.
export interface ToolCallTrace {
  toolCallId: string;        // matches the AG-UI streaming event
  name: string;              // e.g. "web_search", "web_fetch"
  inputSummary: string;      // 200-char human-readable summary of input args
  resultSummary: string;     // first 300 chars of the tool result text
  durationMs: number;
  startedAt: string;         // ISO timestamp
}

// Procedural rule injected into an agent run's context. "Active" means
// loaded into the prompt, not proven applied; per-rule attribution from
// output text is deferred. Persisted on deliverables.content.appliedRules
// for the "Alex remembered" panel.
export interface ActiveRule {
  ruleId: string;
  summary: string;                       // short human-readable rule headline
  evidence: string;                      // descriptive body or example used
  extractedFromDeliverableId: string;    // first source episode id, "" if none
  extractedFromTitle: string;            // resolved at extract time, "" if none
  extractedAt: string;                   // ISO timestamp of rule creation
  confidence: number;                    // 0-1, candidate confidence at promotion
}

// agent.ts still consumes the old name; alias until the agent surface is next touched
export type AppliedRule = ActiveRule;

// Result of a completed agent run
export interface RunResult {
  output: string;
  iterations: number;
  durationMs: number;
  tokensUsed: { input: number; output: number };
  /**
   * Tool call trail for the reasoning trail UI.
   * Each entry captures one tool invocation. Replaces the prior shape of
   * `{name, durationMs}[]` with full provenance: id + input + result + timing.
   */
  toolCalls: ToolCallTrace[];
  /**
   * Procedural rules that were loaded into the agent's context for this
   * run. Injection, not proven application; attribution is deferred.
   */
  appliedRules: ActiveRule[];
  /**
   * Citations collected from retrieval tools (KB search, web search,
   * competitor scan). The agent emits `[^id]` markers in body text;
   * parseCitedBody on the review page resolves markers against this list.
   */
  citations: Citation[];
}

// Token budget allocation
export interface TokenBudget {
  persona: number;
  procedural: number;
  episodic: number;
  semantic: number;
  task: number;
  working: number;
  total: number;
}

// Context assembled for a single agent invocation
export interface AssembledContext {
  systemPrompt: string;
  messages: ProviderMessage[];
  tokenEstimate: number;
}
