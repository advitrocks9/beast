import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Drizzle = ReturnType<typeof drizzle<typeof schema>>;

let cached: Drizzle | null = null;

function getDb(): Drizzle {
  if (cached) return cached;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is required");
  }
  // prepare: false keeps this compatible with a pgbouncer transaction-mode
  // pooler (the right choice for serverless), which is the connection a hosted
  // deploy should use. Harmless on a direct/session connection too.
  cached = drizzle(postgres(connectionString, { prepare: false }), { schema });
  return cached;
}

// Lazy proxy: postgres connection is created on first property access, not at
// module-load time. Required so Trigger.dev's task-file indexer can import
// `@beast/db` without DATABASE_URL set in its index environment.
export const db = new Proxy({} as Drizzle, {
  get(_, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
}) as Drizzle;
