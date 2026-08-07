import { createClient } from "@supabase/supabase-js";
import { requireEnv } from "@beast/shared/env";

/**
 * Admin client using the service role key. NEVER import this from a
 * client component. Server-side use only (route handlers, server
 * actions, server components that don't render to the client).
 */
export function createAdminClient() {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
}
