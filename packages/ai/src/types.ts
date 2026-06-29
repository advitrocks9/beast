import type Anthropic from "@anthropic-ai/sdk";
import type { Citation } from "@beast/shared";

// Agent identity and configuration
export interface AgentConfig {
  agentId: string;
  tenantId: string;
  name: string;
  roleType: "marketing" | "sales" | "support";
  persona: string;
  model?: ModelTier;
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

// Model routing tiers
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
  inputSchema: Anthropic.Tool["input_schema"];
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

// Scratchpad item for working memory
export interface ScratchpadItem {
  id: string;
  description: string;
  status: "pending" | "in_progress" | "done" | "blocked";
}

// Events emitted during agent execution
export type AgentEvent =
  | { type: "run_start"; taskId: string; agentName: string }
  | { type: "text_delta"; text: string }
  | { type: "tool_call_start"; toolName: string; toolCallId: string }
  | { type: "tool_call_end"; toolName: string; toolCallId: string; result: string }
  | { type: "scratchpad_update"; items: ScratchpadItem[] }
  | { type: "iteration"; number: number; totalTokens: number }
  | { type: "error"; message: string; recoverable: boolean }
  | { type: "run_end"; output: string; iterations: number; durationMs: number };

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

// Procedural rule that influenced an agent run.
// Persisted on deliverables.content.appliedRules so the review page can render
// the "Alex remembered" panel on the second-and-later teardown.
export interface AppliedRule {
  ruleId: string;
  summary: string;                       // short human-readable rule headline
  evidence: string;                      // descriptive body or example used
  extractedFromDeliverableId: string;    // first source episode id, "" if none
  extractedFromTitle: string;            // resolved at extract time, "" if none
  extractedAt: string;                   // ISO timestamp of rule creation
  confidence: number;                    // 0-1, mirrors signalWeight
}

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
   * Procedural rules that were loaded into the agent's context for this run
   * this run. The current build marks all loaded rules as applied; per-rule
   * attribution from the output is deferred.
   */
  appliedRules: AppliedRule[];
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
  messages: Anthropic.MessageParam[];
  tokenEstimate: number;
}
