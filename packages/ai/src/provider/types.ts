export type Tier = "fast" | "standard" | "deep";

export type ProviderEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_call"; id: string; name: string; input: unknown }
  | { type: "message_end"; stopReason: "tool_use" | "end_turn" | "max_tokens" };

export type ProviderBlock =
  | { type: "text"; text: string }
  | { type: "tool_call"; id: string; name: string; input: unknown }
  | { type: "tool_result"; toolCallId: string; content: string };

export interface ProviderMessage {
  role: "user" | "assistant";
  content: ProviderBlock[];
}

export interface RunToolDef {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

export interface StreamOptions {
  tier: Tier;
  system: string;
  messages: ProviderMessage[];
  tools: RunToolDef[];
  maxTokens?: number;
}

export interface CompleteOptions {
  tier: Tier;
  system: string;
  prompt: string;
  maxTokens?: number;
  purpose?: string;
}

export interface RunProvider {
  name: "anthropic" | "openrouter" | "stub";
  stream(opts: StreamOptions): AsyncIterable<ProviderEvent>;
  complete(opts: CompleteOptions): Promise<string>;
}

export class ProviderQuotaError extends Error {
  constructor(
    readonly provider: string,
    readonly status: number,
  ) {
    super(`${provider} returned ${status}; degrade to simulated instead of erroring the run`);
    this.name = "ProviderQuotaError";
  }
}
