import { z } from "zod";

const unset = (v: unknown) => (v === "" ? undefined : v);
const optionalKey = z.preprocess(unset, z.string().optional());
const optionalUrl = z.preprocess(unset, z.string().url().optional());

const schema = z.object({
  DATABASE_URL: z.preprocess(unset, z.string().url()),

  NEXT_PUBLIC_DEMO_MODE: optionalKey,
  NEXT_PUBLIC_APP_URL: optionalUrl,
  APP_URL: optionalUrl,
  CRON_SECRET: optionalKey,
  RUN_MAX_WALL_MS: z.preprocess(unset, z.coerce.number().int().positive().default(240_000)),
  ANTHROPIC_API_KEY: optionalKey,
  OPENROUTER_API_KEY: optionalKey,
  OPENROUTER_MODEL: optionalKey,
  OPENROUTER_MODEL_FAST: optionalKey,
  OPENROUTER_MODEL_STANDARD: optionalKey,
  OPENROUTER_MODEL_DEEP: optionalKey,
  GEMINI_API_KEY: optionalKey,
  SERPER_API_KEY: optionalKey,
  FIRECRAWL_API_KEY: optionalKey,
  UNSTRUCTURED_API_KEY: optionalKey,
  DEMO_RUNS_PER_SESSION: z.preprocess(unset, z.coerce.number().int().positive().default(2)),
  DEMO_RUNS_PER_IP_DAILY: z.preprocess(unset, z.coerce.number().int().positive().default(4)),
  DEMO_DAILY_TOKEN_BUDGET: z.preprocess(unset, z.coerce.number().int().positive().default(200_000)),

  NEXT_PUBLIC_SUPABASE_URL: optionalUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalKey,
  SUPABASE_SERVICE_ROLE_KEY: optionalKey,
  TRIGGER_SECRET_KEY: optionalKey,
  STRIPE_SECRET_KEY: optionalKey,
  STRIPE_WEBHOOK_SECRET: optionalKey,
  STRIPE_PRICE_STARTER: optionalKey,
  STRIPE_PRICE_TEAM: optionalKey,
  STRIPE_PRICE_BUSINESS: optionalKey,
  RESEND_API_KEY: optionalKey,
  EMAIL_FROM: optionalKey,
  R2_ACCOUNT_ID: optionalKey,
  R2_ACCESS_KEY_ID: optionalKey,
  R2_SECRET_ACCESS_KEY: optionalKey,
  R2_BUCKET_NAME: optionalKey,
  CONNECTOR_ENCRYPTION_KEY: z.preprocess(
    unset,
    z.string().regex(/^[0-9a-f]{64}$/i, "must be a 64-char hex string (openssl rand -hex 32)").optional(),
  ),
  SLACK_CLIENT_ID: optionalKey,
  SLACK_CLIENT_SECRET: optionalKey,
  LINKEDIN_CLIENT_ID: optionalKey,
  LINKEDIN_CLIENT_SECRET: optionalKey,
  TWITTER_API_KEY: optionalKey,
  TWITTER_API_SECRET: optionalKey,
  WORDPRESS_CLIENT_ID: optionalKey,
  WORDPRESS_CLIENT_SECRET: optionalKey,
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

function load(): Env {
  if (cached) return cached;
  if (typeof window !== "undefined") {
    throw new Error(
      "@beast/shared/env is server-only; client components read process.env.NEXT_PUBLIC_* inline",
    );
  }
  const result = schema.safeParse(process.env);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`);
    throw new Error(
      `Invalid environment (empty string counts as unset):\n${lines.join("\n")}\nSee .env.example.`,
    );
  }
  cached = result.data;
  return cached;
}

// Validates on first property access, not import, so @beast/db stays importable
// with no env set (Trigger.dev's indexer imports task files without DATABASE_URL).
export const env: Env = new Proxy({} as Env, {
  get: (_, prop) => Reflect.get(load(), prop),
  has: (_, prop) => Reflect.has(load(), prop),
});

export function requireEnv<K extends keyof Env>(name: K): NonNullable<Env[K]> {
  const value = env[name];
  if (value === undefined) {
    throw new Error(`Missing required env var ${String(name)}; see .env.example`);
  }
  return value as NonNullable<Env[K]>;
}
