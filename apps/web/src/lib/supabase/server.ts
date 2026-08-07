import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { AuthError, type User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { env, requireEnv } from "@beast/shared/env";
import { DEMO_MODE, DEMO_USER_ID, DEMO_USER_EMAIL } from "@/lib/demo";

type ServerClient = ReturnType<typeof createServerClient>;
type StubbedAuth = Pick<
  ServerClient["auth"],
  "getUser" | "getSession" | "exchangeCodeForSession" | "signOut"
>;

/**
 * In demo mode (or on a bare clone with no Supabase env) we never talk to
 * Supabase. This stub satisfies the handful of auth methods the app calls:
 * getUser returns the seeded demo founder so every authed page resolves to the
 * demo company; with no env it returns a null user so marketing pages render.
 */
function stubClient(user: { id: string; email: string } | null): ServerClient {
  const stubUser: User | null = user && {
    id: user.id,
    email: user.email,
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: new Date(0).toISOString(),
  };
  const auth: StubbedAuth = {
    async getUser() {
      if (!stubUser) {
        return { data: { user: null }, error: new AuthError("Supabase is not configured") };
      }
      return { data: { user: stubUser }, error: null };
    },
    async getSession() {
      return { data: { session: null }, error: null };
    },
    async exchangeCodeForSession() {
      return {
        data: { user: null, session: null },
        error: new AuthError("Supabase is not configured"),
      };
    },
    async signOut() {
      return { error: null };
    },
  };
  // structural subset of ServerClient: only the auth methods the app calls exist
  return { auth } as ServerClient;
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
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    await cookies();
    return stubClient(null);
  }

  const cookieStore = await cookies();

  return createServerClient(
    supabaseUrl,
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
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
            // server components cannot write cookies; the proxy refreshes sessions
          }
        },
      },
    },
  );
}
