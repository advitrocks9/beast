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
  cached = drizzle(postgres(connectionString), { schema });
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
