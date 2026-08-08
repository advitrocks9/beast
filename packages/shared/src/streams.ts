export type RunStreamKind = "live" | "replay" | "simulated";

export interface RunScratchpadItem {
  id: string;
  description: string;
  status: "pending" | "in_progress" | "done" | "blocked";
}

export type AgentRunEvent =
  | { type: "run_start"; taskId: string; agentName: string; provider?: string }
  | { type: "text_delta"; text: string }
  | { type: "tool_call_start"; toolName: string; toolCallId: string }
  | { type: "tool_call_end"; toolName: string; toolCallId: string; result: string }
  | { type: "scratchpad_update"; items: RunScratchpadItem[] }
  | { type: "iteration"; number: number; totalTokens: number }
  | { type: "error"; message: string; recoverable: boolean }
  | { type: "run_end"; output: string; iterations: number; durationMs: number };

export interface RunStreamEvent {
  kind: RunStreamKind;
  event: AgentRunEvent;
}
