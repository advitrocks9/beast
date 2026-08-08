import type {
  CompleteOptions,
  ProviderEvent,
  ProviderMessage,
  RunProvider,
  RunToolDef,
  StreamOptions,
  Tier,
} from "./types";
import { ProviderQuotaError } from "./types";
import { env, requireEnv } from "@beast/shared/env";

const API_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "nvidia/nemotron-3-super-120b-a12b:free";
const DEFAULT_FAST_MODEL = "nvidia/nemotron-3-nano-30b-a3b:free";

const DEFAULT_MAX_TOKENS: Record<Tier, number> = {
  fast: 2048,
  standard: 8192,
  deep: 8192,
};

function modelFor(tier: Tier): string {
  const perTier: Record<Tier, string | undefined> = {
    fast: env.OPENROUTER_MODEL_FAST,
    standard: env.OPENROUTER_MODEL_STANDARD,
    deep: env.OPENROUTER_MODEL_DEEP,
  };
  return (
    perTier[tier] ?? env.OPENROUTER_MODEL ?? (tier === "fast" ? DEFAULT_FAST_MODEL : DEFAULT_MODEL)
  );
}

type OpenAiToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

type OpenAiMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: OpenAiToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

interface StreamChunk {
  choices?: Array<{
    delta?: {
      content?: string | null;
      tool_calls?: Array<{
        index: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason?: string | null;
  }>;
}

interface CompletionResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
}

function toOpenAiMessages(system: string, messages: ProviderMessage[]): OpenAiMessage[] {
  const out: OpenAiMessage[] = [{ role: "system", content: system }];
  for (const m of messages) {
    const text = m.content
      .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    if (m.role === "assistant") {
      const calls = m.content.filter(
        (b): b is Extract<typeof b, { type: "tool_call" }> => b.type === "tool_call",
      );
      if (calls.length > 0) {
        out.push({
          role: "assistant",
          content: text || null,
          tool_calls: calls.map((c) => ({
            id: c.id,
            type: "function",
            function: { name: c.name, arguments: JSON.stringify(c.input) },
          })),
        });
      } else {
        out.push({ role: "assistant", content: text });
      }
      continue;
    }

    for (const b of m.content) {
      if (b.type === "tool_result") {
        out.push({ role: "tool", tool_call_id: b.toolCallId, content: b.content });
      }
    }
    if (text) {
      out.push({ role: "user", content: text });
    }
  }
  return out;
}

function toOpenAiTools(tools: RunToolDef[]): Array<Record<string, unknown>> {
  return tools.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.inputSchema },
  }));
}

async function request(body: Record<string, unknown>): Promise<Response> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireEnv("OPENROUTER_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (res.status === 429 || res.status >= 500) {
    throw new ProviderQuotaError("openrouter", res.status);
  }
  if (!res.ok) {
    throw new Error(`openrouter ${res.status}: ${await res.text()}`);
  }
  return res;
}

function mapFinish(reason: string | null | undefined): "tool_use" | "end_turn" | "max_tokens" {
  if (reason === "tool_calls") return "tool_use";
  if (reason === "length") return "max_tokens";
  return "end_turn";
}

export function createOpenRouterProvider(): RunProvider {
  return {
    name: "openrouter",

    async *stream(opts: StreamOptions): AsyncIterable<ProviderEvent> {
      const res = await request({
        model: modelFor(opts.tier),
        max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS[opts.tier],
        messages: toOpenAiMessages(opts.system, opts.messages),
        tools: opts.tools.length > 0 ? toOpenAiTools(opts.tools) : undefined,
        stream: true,
      });
      if (!res.body) throw new Error("openrouter: empty stream body");

      const toolCalls = new Map<number, { id: string; name: string; args: string }>();
      let finishReason: string | null = null;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newline: number;
        while ((newline = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6);
          if (payload === "[DONE]") continue;

          const chunk = JSON.parse(payload) as StreamChunk;
          const choice = chunk.choices?.[0];
          if (!choice) continue;
          if (choice.finish_reason) finishReason = choice.finish_reason;
          if (choice.delta?.content) {
            yield { type: "text_delta", text: choice.delta.content };
          }
          for (const tc of choice.delta?.tool_calls ?? []) {
            const entry = toolCalls.get(tc.index) ?? { id: "", name: "", args: "" };
            if (tc.id) entry.id = tc.id;
            if (tc.function?.name) entry.name = tc.function.name;
            if (tc.function?.arguments) entry.args += tc.function.arguments;
            toolCalls.set(tc.index, entry);
          }
        }
      }

      for (const [index, call] of [...toolCalls.entries()].sort(([a], [b]) => a - b)) {
        yield {
          type: "tool_call",
          id: call.id || `openrouter-tool-${index}`,
          name: call.name,
          input: JSON.parse(call.args || "{}") as unknown,
        };
      }
      yield { type: "message_end", stopReason: mapFinish(finishReason) };
    },

    async complete(opts: CompleteOptions): Promise<string> {
      const res = await request({
        model: modelFor(opts.tier),
        max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS[opts.tier],
        messages: toOpenAiMessages(opts.system, [
          { role: "user", content: [{ type: "text", text: opts.prompt }] },
        ]),
      });
      const data = (await res.json()) as CompletionResponse;
      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== "string") {
        throw new Error("openrouter: completion returned no content");
      }
      return content;
    },
  };
}
