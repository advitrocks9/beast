/**
 * AG-UI event types streamed from agent tasks to the frontend.
 * These map to the AgentEvent union in @beast/ai but are defined
 * here so the frontend can consume them without importing @beast/ai.
 */
export interface AGUITextDelta {
  type: "TEXT_MESSAGE_CONTENT";
  delta: string;
}

export interface AGUIToolCallStart {
  type: "TOOL_CALL_START";
  toolName: string;
  toolCallId: string;
}

export interface AGUIToolCallResult {
  type: "TOOL_CALL_RESULT";
  toolCallId: string;
  toolName: string;
  result: string;
}

export interface AGUIScratchpadUpdate {
  type: "SCRATCHPAD_UPDATE";
  items: { id: string; description: string; status: string }[];
}

export interface AGUIIteration {
  type: "ITERATION";
  number: number;
  totalTokens: number;
}

export interface AGUITaskComplete {
  type: "TASK_COMPLETE";
  output: string;
  iterations: number;
  durationMs: number;
}

export interface AGUITaskError {
  type: "TASK_ERROR";
  error: string;
  recoverable: boolean;
}

export interface AGUIRunStart {
  type: "RUN_START";
  taskId: string;
  agentName: string;
}

export type AGUIEvent =
  | AGUITextDelta
  | AGUIToolCallStart
  | AGUIToolCallResult
  | AGUIScratchpadUpdate
  | AGUIIteration
  | AGUITaskComplete
  | AGUITaskError
  | AGUIRunStart;
