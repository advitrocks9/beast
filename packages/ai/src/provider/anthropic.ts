import Anthropic from "@anthropic-ai/sdk";
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

export const ANTHROPIC_MODELS: Record<Tier, string> = {
  fast: "claude-haiku-4-5-20251001",
  standard: "claude-sonnet-4-6",
  deep: "claude-opus-4-8",
};

const DEFAULT_MAX_TOKENS: Record<Tier, number> = {
  fast: 2048,
  standard: 8192,
  deep: 8192,
};

let _client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic();
  }
  return _client;
}

function toAnthropicMessages(messages: ProviderMessage[]): Anthropic.MessageParam[] {
  return messages.map((m) => ({
    role: m.role,
    content: m.content.map((block): Anthropic.ContentBlockParam => {
      switch (block.type) {
        case "text":
          return { type: "text", text: block.text };
        case "tool_call":
          return { type: "tool_use", id: block.id, name: block.name, input: block.input };
        case "tool_result":
          return { type: "tool_result", tool_use_id: block.toolCallId, content: block.content };
      }
    }),
  }));
}

function toAnthropicTools(tools: RunToolDef[]): Anthropic.Tool[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema,
  }));
}

function normalizeStop(reason: string | null): "tool_use" | "end_turn" | "max_tokens" {
  if (reason === "tool_use") return "tool_use";
  if (reason === "max_tokens") return "max_tokens";
  return "end_turn";
}

// 429, 5xx (incl. 529 overloaded), and connection failures (status 0) become
// ProviderQuotaError so degrade paths behave identically to openrouter's.
function rethrowAsQuota(err: unknown): never {
  if (err instanceof Anthropic.APIConnectionError) {
    throw new ProviderQuotaError("anthropic", 0);
  }
  if (
    err instanceof Anthropic.APIError &&
    typeof err.status === "number" &&
    (err.status === 429 || err.status >= 500)
  ) {
    throw new ProviderQuotaError("anthropic", err.status);
  }
  throw err;
}

export function createAnthropicProvider(): RunProvider {
  return {
    name: "anthropic",

    async *stream(opts: StreamOptions): AsyncIterable<ProviderEvent> {
      try {
        const client = getAnthropicClient();
        const stream = client.messages.stream({
          model: ANTHROPIC_MODELS[opts.tier],
          max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS[opts.tier],
          system: opts.system,
          messages: toAnthropicMessages(opts.messages),
          tools: opts.tools.length > 0 ? toAnthropicTools(opts.tools) : undefined,
        });

        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            yield { type: "text_delta", text: event.delta.text };
          }
        }

        const final = await stream.finalMessage();
        for (const block of final.content) {
          if (block.type === "tool_use") {
            yield { type: "tool_call", id: block.id, name: block.name, input: block.input };
          }
        }
        yield { type: "message_end", stopReason: normalizeStop(final.stop_reason) };
      } catch (err) {
        rethrowAsQuota(err);
      }
    },

    async complete(opts: CompleteOptions): Promise<string> {
      try {
        const client = getAnthropicClient();
        const response = await client.messages.create({
          model: ANTHROPIC_MODELS[opts.tier],
          max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS[opts.tier],
          system: opts.system,
          messages: [{ role: "user", content: opts.prompt }],
        });
        return response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n");
      } catch (err) {
        rethrowAsQuota(err);
      }
    },
  };
}
