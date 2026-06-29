import type Anthropic from "@anthropic-ai/sdk";
import type { Citation } from "@beast/shared";
import type { ToolDefinition, ToolExecuteResult } from "./types";

interface DispatchOutcome {
  result: string;
  citations: Citation[];
  durationMs: number;
}

function normalize(raw: ToolExecuteResult): { text: string; citations: Citation[] } {
  if (typeof raw === "string") return { text: raw, citations: [] };
  return { text: raw.text, citations: raw.citations ?? [] };
}

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  registerAll(tools: ToolDefinition[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  getAnthropicTools(): Anthropic.Tool[] {
    return Array.from(this.tools.values()).map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema,
    }));
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  async dispatch(
    name: string,
    input: Record<string, unknown>,
  ): Promise<DispatchOutcome> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { result: `Error: unknown tool "${name}"`, citations: [], durationMs: 0 };
    }

    const start = Date.now();
    const maxRetries = 3;
    const backoff = [1000, 3000, 9000];

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const raw = await tool.execute(input);
        const normalized = normalize(raw);
        return { result: normalized.text, citations: normalized.citations, durationMs: Date.now() - start };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);

        if (isRateLimitError(err) && attempt < maxRetries - 1) {
          await sleep(backoff[attempt]!);
          continue;
        }

        return {
          result: `Error calling ${name}: ${message}`,
          citations: [],
          durationMs: Date.now() - start,
        };
      }
    }

    return {
      result: `Error: ${name} failed after ${maxRetries} retries`,
      citations: [],
      durationMs: Date.now() - start,
    };
  }
}

function isRateLimitError(err: unknown): boolean {
  if (err instanceof Error) {
    return err.message.includes("429") || err.message.toLowerCase().includes("rate limit");
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
