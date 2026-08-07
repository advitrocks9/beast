"use client";

import { useEffect, useState } from "react";
import type { AgentRunEvent, RunStreamEvent, RunStreamKind } from "@beast/shared";

export type RunStreamStatus = "idle" | "connecting" | "streaming" | "done" | "error";

export interface RunStreamState {
  events: AgentRunEvent[];
  status: RunStreamStatus;
  kind: RunStreamKind | null;
}

export function useRunStream(taskId: string | undefined): RunStreamState {
  const [state, setState] = useState<RunStreamState>({
    events: [],
    status: taskId ? "connecting" : "idle",
    kind: null,
  });

  useEffect(() => {
    if (!taskId) return;
    setState({ events: [], status: "connecting", kind: null });

    const source = new EventSource(`/api/runs/${taskId}/stream`);

    source.onmessage = (msg) => {
      const { kind, event } = JSON.parse(msg.data) as RunStreamEvent;
      setState((prev) => ({ events: [...prev.events, event], status: "streaming", kind }));
    };

    source.addEventListener("done", () => {
      source.close();
      setState((prev) => ({ ...prev, status: "done" }));
    });

    // Close instead of letting EventSource auto-reconnect: the endpoint
    // replays catch-up on every connect, which would duplicate the feed.
    source.onerror = () => {
      source.close();
      setState((prev) => ({ ...prev, status: prev.events.length > 0 ? "done" : "error" }));
    };

    return () => source.close();
  }, [taskId]);

  return state;
}
