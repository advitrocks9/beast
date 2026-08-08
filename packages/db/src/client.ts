import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@beast/shared/env";
import * as schema from "./schema";

type Drizzle = ReturnType<typeof drizzle<typeof schema>>;

// Dev HMR re-evaluates this module per compilation; a module-level cache leaks
// one pool per rebuild until postgres hits max_connections.
const globalCache = globalThis as { __beastDb?: Drizzle };

function getDb(): Drizzle {
  if (globalCache.__beastDb) return globalCache.__beastDb;
  // prepare: false keeps this compatible with a pgbouncer transaction-mode
  // pooler (the right choice for serverless), which is the connection a hosted
  // deploy should use. Harmless on a direct/session connection too.
  globalCache.__beastDb = drizzle(postgres(env.DATABASE_URL, { prepare: false }), { schema });
  return globalCache.__beastDb;
}

// Lazy proxy: postgres connection is created on first property access, not at
// module-load time. Required so Trigger.dev's task-file indexer can import
// `@beast/db` without DATABASE_URL set in its index environment.
export const db = new Proxy({} as Drizzle, {
  get(_, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
}) as Drizzle;
