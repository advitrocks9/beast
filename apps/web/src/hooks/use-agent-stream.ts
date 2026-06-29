"use client";

import { useRealtimeRunWithStreams } from "@trigger.dev/react-hooks";
import type { AGUIEvent } from "@beast/shared";

interface AgentStreamResult {
  events: AGUIEvent[];
  textContent: string;
  toolCalls: AGUIEvent[];
  isComplete: boolean;
  error: string | undefined;
  isLoading: boolean;
}

export function useAgentStream(
  runId: string | undefined,
  accessToken: string | undefined,
): AgentStreamResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = useRealtimeRunWithStreams<any, Record<string, AGUIEvent>>(
    runId ?? "",
    {
      accessToken: accessToken ?? "",
      enabled: Boolean(runId && accessToken),
    },
  );

  const events = (result.streams?.["agent-events"] ?? []) as AGUIEvent[];

  const textContent = events
    .filter((e): e is AGUIEvent & { type: "TEXT_MESSAGE_CONTENT" } => e.type === "TEXT_MESSAGE_CONTENT")
    .map((e) => e.delta)
    .join("");

  const toolCalls = events.filter(
    (e): e is AGUIEvent & { type: "TOOL_CALL_START" | "TOOL_CALL_RESULT" } =>
      e.type === "TOOL_CALL_START" || e.type === "TOOL_CALL_RESULT",
  );

  const isComplete = events.some((e) => e.type === "TASK_COMPLETE");
  const errorEvent = events.find((e): e is AGUIEvent & { type: "TASK_ERROR" } => e.type === "TASK_ERROR");

  return {
    events,
    textContent,
    toolCalls,
    isComplete,
    error: errorEvent?.error,
    isLoading: !result.run || result.run.status === "EXECUTING",
  };
}
