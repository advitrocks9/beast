import type Anthropic from "@anthropic-ai/sdk";
import type { Citation } from "@beast/shared";
import type {
  AgentConfig,
  AgentTask,
  AgentEventHandler,
  AppliedRule,
  RetrievedMemory,
  RunResult,
  ToolCallTrace,
  ModelTier,
} from "./types";
import { getClient, getModelId, getMaxTokens, selectModel } from "./models";
import { assembleContext } from "./context";
import { ToolRegistry } from "./tools";
import { Scratchpad } from "./scratchpad";
import { AgentEventEmitter } from "./streaming";

const DEFAULT_MAX_ITERATIONS = 50;
const DEFAULT_MAX_DURATION_MS = 60 * 60 * 1000; // 60 min

const PROGRESS_TOOL: Anthropic.Tool = {
  name: "update_progress",
  description:
    "Mark a scratchpad step in_progress, done, or blocked as you work, so the progress list stays accurate. Use the step id (#N) shown in the scratchpad.",
  input_schema: {
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
    appliedRules?: AppliedRule[];
  };
  planSteps?: string[];
  onEvent?: AgentEventHandler;
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
  const appliedRules: AppliedRule[] = memories.appliedRules ?? [];

  const maxIterations = config.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const maxDurationMs = config.maxDurationMs ?? DEFAULT_MAX_DURATION_MS;
  const model: ModelTier = config.model ?? selectModel(task.taskType);
  const client = getClient();
  const emitter = new AgentEventEmitter();
  if (onEvent) emitter.on(onEvent);

  const scratchpad = new Scratchpad();
  if (planSteps?.length) {
    scratchpad.init(planSteps);
  } else if (task.acceptanceCriteria?.length) {
    scratchpad.init(task.acceptanceCriteria);
  }

  // Assemble initial context
  const ctx = assembleContext({
    config,
    task,
    episodicMemories: memories.episodic,
    semanticMemories: memories.semantic,
    proceduralMemories: memories.procedural,
    scratchpad: scratchpad.getItems(),
  });

  const messages: Anthropic.MessageParam[] = [...ctx.messages];
  const baseTools = tools.getAnthropicTools();
  const anthropicTools =
    scratchpad.getItems().length > 0 ? [...baseTools, PROGRESS_TOOL] : baseTools;
  const toolCallLog: ToolCallTrace[] = [];
  const citationsById = new Map<string, Citation>();
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

  emitter.emit({ type: "run_start", taskId: task.taskId, agentName: config.name });

  let loopErrorEmitted = false;
  let lastIteration = 0;
  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    lastIteration = iteration;
    // Timeout check
    if (Date.now() - startTime > maxDurationMs) {
      loopErrorEmitted = true;
      emitter.emit({ type: "error", message: "Max duration exceeded", recoverable: false });
      break;
    }

    // Call Claude with streaming
    const stream = client.messages.stream({
      model: getModelId(model),
      max_tokens: getMaxTokens(model),
      system: ctx.systemPrompt,
      messages,
      tools: anthropicTools.length > 0 ? anthropicTools : undefined,
    });

    // Stream text deltas to the event handler
    stream.on("text", (text) => {
      emitter.emit({ type: "text_delta", text });
    });

    const response = await stream.finalMessage();

    totalInputTokens += response.usage.input_tokens;
    totalOutputTokens += response.usage.output_tokens;

    emitter.emit({
      type: "iteration",
      number: iteration,
      totalTokens: totalInputTokens + totalOutputTokens,
    });

    // Append assistant response to conversation
    messages.push({ role: "assistant", content: response.content });

    // If the model is done (end_turn or max_tokens), we're finished
    if (response.stop_reason === "end_turn" || response.stop_reason === "max_tokens") {
      const output = extractText(response.content);

      const durationMs = Date.now() - startTime;
      emitter.emit({
        type: "run_end",
        output,
        iterations: iteration,
        durationMs,
      });

      return {
        output,
        iterations: iteration,
        durationMs,
        tokensUsed: { input: totalInputTokens, output: totalOutputTokens },
        toolCalls: toolCallLog,
        appliedRules,
        citations: filterCitationsToBody(output, citationsById),
      };
    }

    // Handle tool calls
    if (response.stop_reason === "tool_use") {
      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
      );

      // Defensive: if the model signals tool_use but emits no tool_use
      // blocks (mixed-content edge case), pushing { content: [] } would
      // be rejected by the API on the next turn. Treat as a recoverable
      // error and exit so the partial output still surfaces to the
      // founder via the post-loop block.
      if (toolUseBlocks.length === 0) {
        loopErrorEmitted = true;
        emitter.emit({
          type: "error",
          message: "tool_use stop without any tool_use blocks",
          recoverable: true,
        });
        break;
      }

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolUse of toolUseBlocks) {
        if (toolUse.name === "update_progress") {
          const { stepId, status } = toolUse.input as { stepId?: string; status?: string };
          const id = stepId?.replace(/^#/, "");
          if (id && status === "in_progress") scratchpad.start(id);
          else if (id && status === "done") scratchpad.complete(id);
          else if (id && status === "blocked") scratchpad.block(id);
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: "Progress updated.",
          });
          continue;
        }

        emitter.emit({
          type: "tool_call_start",
          toolName: toolUse.name,
          toolCallId: toolUse.id,
        });

        const startedAt = new Date().toISOString();
        const toolInput = toolUse.input as Record<string, unknown>;

        const { result, citations, durationMs } = await tools.dispatch(toolUse.name, toolInput);

        for (const c of citations) {
          if (!citationsById.has(c.id)) citationsById.set(c.id, c);
        }

        toolCallLog.push({
          toolCallId: toolUse.id,
          name: toolUse.name,
          inputSummary: summarizeToolInput(toolUse.name, toolInput),
          resultSummary: summarizeToolResult(result),
          durationMs,
          startedAt,
        });

        emitter.emit({
          type: "tool_call_end",
          toolName: toolUse.name,
          toolCallId: toolUse.id,
          result: result.length > 200 ? result.slice(0, 200) + "..." : result,
        });

        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: result,
        });
      }

      // Append tool results
      messages.push({ role: "user", content: toolResults });

      // Update scratchpad and inject it so the model stays oriented
      emitter.emit({ type: "scratchpad_update", items: scratchpad.getItems() });

      // Inject scratchpad state as a plain text block alongside the tool_results.
      // Earlier code pushed this as a synthetic tool_result with tool_use_id "scratchpad",
      // which the Anthropic API rejects (every tool_result must reference a real tool_use
      // from the prior assistant turn). Plain text in the same user message is safe.
      const scratchpadText = scratchpad.render();
      if (scratchpadText) {
        const lastIdx = messages.length - 1;
        const lastMsg = messages[lastIdx]!;
        if (Array.isArray(lastMsg.content)) {
          (lastMsg.content as Array<Anthropic.ToolResultBlockParam | Anthropic.TextBlockParam>).push({
            type: "text",
            text: `<scratchpad>\n## Current Progress\n${scratchpadText}\n</scratchpad>`,
          });
        }
      }
    }
  }

  // Exited the loop without an end_turn / max_tokens response. Either the
  // run hit the iteration cap or the timeout check tripped and broke out
  // already (in which case the timeout error has already been emitted).
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

/**
 * Build a human-readable 200-char summary of a tool's input args. Tool-name-aware:
 * web_search emits its query, web_fetch emits its URL. Falls back to a JSON dump
 * for unknown tools. Used by the reasoning trail UI.
 */
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

function extractText(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

function extractTextFromMessages(messages: Anthropic.MessageParam[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]!;
    if (msg.role === "assistant" && typeof msg.content === "string") {
      return msg.content;
    }
    if (msg.role === "assistant" && Array.isArray(msg.content)) {
      const text = msg.content
        .filter((b): b is Anthropic.TextBlock => (b as Anthropic.TextBlock).type === "text")
        .map((b) => (b as Anthropic.TextBlock).text)
        .join("\n");
      if (text) return text;
    }
  }
  return "";
}
