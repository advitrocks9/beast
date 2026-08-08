import { env } from "@beast/shared/env";
import type { CompleteOptions, RunProvider } from "./types";
import { createAnthropicProvider } from "./anthropic";
import { createOpenRouterProvider } from "./openrouter";
import { createStubProvider } from "./stub";

export type {
  Tier,
  ProviderEvent,
  ProviderBlock,
  ProviderMessage,
  RunToolDef,
  StreamOptions,
  CompleteOptions,
  RunProvider,
} from "./types";
export { ProviderQuotaError } from "./types";
export { createStubProvider } from "./stub";
export { embed } from "./embeddings";

const providers: Partial<Record<RunProvider["name"], RunProvider>> = {};

function cached(name: RunProvider["name"], create: () => RunProvider): RunProvider {
  return (providers[name] ??= create());
}

export function resolveProvider(): RunProvider {
  if (env.ANTHROPIC_API_KEY) return cached("anthropic", createAnthropicProvider);
  if (env.OPENROUTER_API_KEY) return cached("openrouter", createOpenRouterProvider);
  return cached("stub", createStubProvider);
}

export function complete(opts: CompleteOptions): Promise<string> {
  return resolveProvider().complete(opts);
}
