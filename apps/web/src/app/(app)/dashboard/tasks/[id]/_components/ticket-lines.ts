import type { AgentRunEvent } from "@beast/shared";

export interface TicketLine {
  key: string;
  label: string;
  detail: string;
  tone: "tool" | "note" | "error" | "end";
  at?: string;
}

export interface TicketRecord {
  lines: TicketLine[];
  draft: string;
  ended: boolean;
  fatal: boolean;
}

export function toTicketLines(
  entries: ReadonlyArray<{ event: AgentRunEvent; at?: string }>,
): TicketRecord {
  const lines: TicketLine[] = [];
  let draft = "";
  let ended = false;
  let fatal = false;
  const openTools = new Map<string, number>();

  entries.forEach(({ event: e, at }, i) => {
    switch (e.type) {
      case "run_start":
        lines.push({ key: `s${i}`, label: "run_start", detail: `${e.agentName} clocked in`, tone: "note", at });
        break;
      case "tool_call_start":
        openTools.set(e.toolCallId, lines.length);
        lines.push({ key: e.toolCallId, label: e.toolName, detail: "…", tone: "tool", at });
        break;
      case "tool_call_end": {
        const idx = openTools.get(e.toolCallId);
        const detail = e.result.length > 110 ? `${e.result.slice(0, 110)}…` : e.result;
        if (idx !== undefined && lines[idx]) lines[idx] = { ...lines[idx], detail };
        else lines.push({ key: e.toolCallId, label: e.toolName, detail, tone: "tool", at });
        break;
      }
      case "scratchpad_update": {
        const current = e.items.find((it) => it.status === "in_progress");
        if (current) lines.push({ key: `p${i}`, label: "plan", detail: current.description, tone: "note", at });
        break;
      }
      case "text_delta":
        draft += e.text;
        break;
      case "error":
        if (!e.recoverable) fatal = true;
        lines.push({ key: `e${i}`, label: "error", detail: e.message, tone: "error", at });
        break;
      case "run_end":
        ended = true;
        lines.push({
          key: `end${i}`,
          label: "filed",
          detail: `deliverable filed for review · ${e.iterations} steps · ${(e.durationMs / 1000).toFixed(0)}s`,
          tone: "end",
          at,
        });
        break;
    }
  });

  return { lines, draft, ended, fatal };
}

export function lineToneClass(tone: TicketLine["tone"]): string {
  if (tone === "error") return "text-state-failed";
  if (tone === "end") return "text-state-accepted";
  return "text-ink";
}
