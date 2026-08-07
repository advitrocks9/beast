import type { Citation } from "@beast/shared";
import type {
  AgentConfig,
  AgentTask,
  AgentEventHandler,
  ActiveRule,
  RetrievedMemory,
  RunResult,
  ToolCallTrace,
} from "./types";
import {
  resolveProvider,
  type ProviderBlock,
  type ProviderMessage,
  type RunProvider,
  type RunToolDef,
} from "./provider";
import { assembleContext, estimateTokens } from "./context";
import { ToolRegistry } from "./tools";
import { Scratchpad } from "./scratchpad";
import { AgentEventEmitter } from "./streaming";

const DEFAULT_MAX_ITERATIONS = 50;
const DEFAULT_MAX_DURATION_MS = 60 * 60 * 1000; // 60 min

const PROGRESS_TOOL: RunToolDef = {
  name: "update_progress",
  description:
    "Mark a scratchpad step in_progress, done, or blocked as you work, so the progress list stays accurate. Use the step id (#N) shown in the scratchpad.",
  inputSchema: {
    type: "object",
    properties: {
      stepId: { type: "string", description: "Step id from the scratchpad, without the # prefix" },
      status: { type: "string", enum: ["in_progress", "done", "blocked"] },
    },
    required: ["stepId", "status"],
  },
};

export interface RunOptions {
  config: AgentConfig;
  task: AgentTask;
  tools?: ToolRegistry;
  memories?: {
    episodic: RetrievedMemory[];
    semantic: RetrievedMemory[];
    procedural: RetrievedMemory[];
    appliedRules?: ActiveRule[];
  };
  planSteps?: string[];
  onEvent?: AgentEventHandler;
  /** Overrides env resolution; the runner passes the stub here on quota degrade. */
  provider?: RunProvider;
}

export async function run(opts: RunOptions): Promise<RunResult> {
  const {
    config,
    task,
    tools = new ToolRegistry(),
    memories = { episodic: [], semantic: [], procedural: [], appliedRules: [] },
    planSteps,
    onEvent,
  } = opts;
  const appliedRules: ActiveRule[] = memories.appliedRules ?? [];

  const maxIterations = config.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const maxDurationMs = config.maxDurationMs ?? DEFAULT_MAX_DURATION_MS;
  const tier = config.tier ?? "standard";
  const provider = opts.provider ?? resolveProvider();
  const emitter = new AgentEventEmitter();
  if (onEvent) emitter.on(onEvent);

  const scratchpad = new Scratchpad();
  if (planSteps?.length) {
    scratchpad.init(planSteps);
  } else if (task.acceptanceCriteria?.length) {
    scratchpad.init(task.acceptanceCriteria);
  }

  const ctx = assembleContext({
    config,
    task,
    episodicMemories: memories.episodic,
    semanticMemories: memories.semantic,
    proceduralMemories: memories.procedural,
    scratchpad: scratchpad.getItems(),
  });

  const messages: ProviderMessage[] = [...ctx.messages];
  const baseTools = tools.getToolDefs();
  const runTools = scratchpad.getItems().length > 0 ? [...baseTools, PROGRESS_TOOL] : baseTools;
  const toolCallLog: ToolCallTrace[] = [];
  const citationsById = new Map<string, Citation>();
  // Providers stream deltas without usage payloads, so token counts are ~4 chars/token estimates.
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const startTime = Date.now();

  // Seed citations from semantic memories preloaded into context. The model
  // can reference these as [^kb-...] markers without needing to call the
  // KB tool again.
  for (const m of memories.semantic) {
    const ref = m.sourceRef;
    if (!ref) continue;
    const id = `kb-${ref.chunkId.slice(0, 8)}`;
    if (citationsById.has(id)) continue;
    citationsById.set(id, {
      id,
      type: "kb",
      title: `${ref.category}/${ref.title}`,
      snippet: m.content.slice(0, 240),
      toolName: "search_company_kb",
    });
  }

  emitter.emit({
    type: "run_start",
    taskId: task.taskId,
    agentName: config.name,
    provider: provider.name,
  });

  let loopErrorEmitted = false;
  let lastIteration = 0;
  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    lastIteration = iteration;
    if (Date.now() - startTime > maxDurationMs) {
      loopErrorEmitted = true;
      emitter.emit({ type: "error", message: "Max duration exceeded", recoverable: false });
      break;
    }

    let text = "";
    const toolCalls: Array<{ id: string; name: string; input: unknown }> = [];
    let stopReason: "tool_use" | "end_turn" | "max_tokens" = "end_turn";

    for await (const event of provider.stream({
      tier,
      system: ctx.systemPrompt,
      messages,
      tools: runTools,
    })) {
      if (event.type === "text_delta") {
        text += event.text;
        emitter.emit({ type: "text_delta", text: event.text });
      } else if (event.type === "tool_call") {
        toolCalls.push({ id: event.id, name: event.name, input: event.input });
      } else {
        stopReason = event.stopReason;
      }
    }

    totalInputTokens += estimateTokens(ctx.systemPrompt) + estimateTokens(JSON.stringify(messages));
    totalOutputTokens += estimateTokens(text) + estimateTokens(JSON.stringify(toolCalls));

    emitter.emit({
      type: "iteration",
      number: iteration,
      totalTokens: totalInputTokens + totalOutputTokens,
    });

    const assistantBlocks: ProviderBlock[] = [];
    if (text) assistantBlocks.push({ type: "text", text });
    for (const call of toolCalls) {
      assistantBlocks.push({ type: "tool_call", id: call.id, name: call.name, input: call.input });
    }
    messages.push({
      role: "assistant",
      content: assistantBlocks.length > 0 ? assistantBlocks : [{ type: "text", text: "" }],
    });

    if (stopReason === "end_turn" || stopReason === "max_tokens") {
      const durationMs = Date.now() - startTime;
      emitter.emit({ type: "run_end", output: text, iterations: iteration, durationMs });

      return {
        output: text,
        iterations: iteration,
        durationMs,
        tokensUsed: { input: totalInputTokens, output: totalOutputTokens },
        toolCalls: toolCallLog,
        appliedRules,
        citations: filterCitationsToBody(text, citationsById),
      };
    }

    // A tool_use stop with no tool calls would make the next request invalid
    // (a tool_result must answer a real tool call). Recoverable exit so the
    // partial output still surfaces via the post-loop block.
    if (toolCalls.length === 0) {
      loopErrorEmitted = true;
      emitter.emit({
        type: "error",
        message: "tool_use stop without any tool calls",
        recoverable: true,
      });
      break;
    }

    const resultBlocks: ProviderBlock[] = [];

    for (const call of toolCalls) {
      if (call.name === "update_progress") {
        const { stepId, status } = call.input as { stepId?: string; status?: string };
        const id = stepId?.replace(/^#/, "");
        if (id && status === "in_progress") scratchpad.start(id);
        else if (id && status === "done") scratchpad.complete(id);
        else if (id && status === "blocked") scratchpad.block(id);
        resultBlocks.push({ type: "tool_result", toolCallId: call.id, content: "Progress updated." });
        continue;
      }

      emitter.emit({ type: "tool_call_start", toolName: call.name, toolCallId: call.id });

      const startedAt = new Date().toISOString();
      const toolInput = call.input as Record<string, unknown>;

      const { result, citations, durationMs } = await tools.dispatch(call.name, toolInput);

      for (const c of citations) {
        if (!citationsById.has(c.id)) citationsById.set(c.id, c);
      }

      toolCallLog.push({
        toolCallId: call.id,
        name: call.name,
        inputSummary: summarizeToolInput(call.name, toolInput),
        resultSummary: summarizeToolResult(result),
        durationMs,
        startedAt,
      });

      emitter.emit({
        type: "tool_call_end",
        toolName: call.name,
        toolCallId: call.id,
        result: result.length > 200 ? result.slice(0, 200) + "..." : result,
      });

      resultBlocks.push({ type: "tool_result", toolCallId: call.id, content: result });
    }

    emitter.emit({ type: "scratchpad_update", items: scratchpad.getItems() });

    // Scratchpad state rides as a plain text block alongside the tool results;
    // a synthetic tool_result would be rejected upstream.
    const scratchpadText = scratchpad.render();
    if (scratchpadText) {
      resultBlocks.push({
        type: "text",
        text: `<scratchpad>\n## Current Progress\n${scratchpadText}\n</scratchpad>`,
      });
    }

    messages.push({ role: "user", content: resultBlocks });
  }

  // Exited the loop without an end_turn / max_tokens stop. Either the run hit
  // the iteration cap or the timeout/no-tool-call check broke out already.
  const output = extractTextFromMessages(messages);
  const durationMs = Date.now() - startTime;

  if (!loopErrorEmitted) {
    emitter.emit({ type: "error", message: "Max iterations reached", recoverable: false });
  }
  emitter.emit({ type: "run_end", output, iterations: lastIteration, durationMs });

  return {
    output,
    iterations: lastIteration,
    durationMs,
    tokensUsed: { input: totalInputTokens, output: totalOutputTokens },
    toolCalls: toolCallLog,
    appliedRules,
    citations: filterCitationsToBody(output, citationsById),
  };
}

/**
 * Keep only the citations whose [^id] markers actually appear in the body.
 * If the agent never referenced a tool result, dropping it keeps the right
 * rail clean. The id sweep is regex-based to match parseCitedBody's
 * MARKER_RE on the read side.
 */
function filterCitationsToBody(body: string, all: Map<string, Citation>): Citation[] {
  const referenced = new Set<string>();
  const re = /\[\^([A-Za-z0-9_-]+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    referenced.add(m[1]!);
  }
  if (referenced.size === 0) return [];
  return Array.from(all.values()).filter((c) => referenced.has(c.id));
}

// Tool-name-aware 200-char input summary for the reasoning trail UI.
function summarizeToolInput(name: string, input: Record<string, unknown>): string {
  const trim = (s: string): string => (s.length > 200 ? s.slice(0, 197) + "..." : s);
  if (name === "web_search" && typeof input.query === "string") return trim(input.query);
  if (name === "web_fetch" && typeof input.url === "string") return trim(input.url);
  if (name === "save_knowledge" && typeof input.content === "string") return trim(input.content);
  if (name === "save_goal" && typeof input.title === "string") return trim(input.title);
  try {
    return trim(JSON.stringify(input));
  } catch {
    return trim(String(input));
  }
}

/** First 300 chars of the tool's result, single-line normalized. */
function summarizeToolResult(result: string): string {
  const flat = result.replace(/\s+/g, " ").trim();
  return flat.length > 300 ? flat.slice(0, 297) + "..." : flat;
}

function extractTextFromMessages(messages: ProviderMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]!;
    if (msg.role !== "assistant") continue;
    const text = msg.content
      .filter((b): b is Extract<ProviderBlock, { type: "text" }> => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    if (text) return text;
  }
  return "";
}
