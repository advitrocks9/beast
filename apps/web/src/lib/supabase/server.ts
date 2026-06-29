import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { DEMO_MODE, DEMO_USER_ID, DEMO_USER_EMAIL } from "@/lib/demo";

type ServerClient = ReturnType<typeof createServerClient>;

/**
 * In demo mode (or on a bare clone with no Supabase env) we never talk to
 * Supabase. This stub satisfies the handful of auth methods the app calls:
 * getUser returns the seeded demo founder so every authed page resolves to the
 * demo company; with no env it returns a null user so marketing pages render.
 */
function stubClient(user: { id: string; email: string } | null): ServerClient {
  return {
    auth: {
      async getUser() {
        return { data: { user }, error: null };
      },
      async getSession() {
        return { data: { session: null }, error: null };
      },
      async exchangeCodeForSession() {
        return { data: { session: null }, error: null };
      },
      async signOut() {
        return { error: null };
      },
    },
  } as unknown as ServerClient;
}

export async function createClient() {
  // Touch cookies() so auth-dependent pages stay dynamically rendered, exactly
  // as the real client does. Without this Next would try to statically
  // prerender the dashboard at build time and run its queries against a DB
  // that is not there yet.
  if (DEMO_MODE) {
    await cookies();
    return stubClient({ id: DEMO_USER_ID, email: DEMO_USER_EMAIL });
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    await cookies();
    return stubClient(null);
  }

  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component; safe to ignore, the proxy refreshes sessions.
          }
        },
      },
    },
  );
}
