import { createBrowserClient } from "@supabase/ssr";
import { DEMO_MODE } from "@/lib/demo";

type BrowserClient = ReturnType<typeof createBrowserClient>;

export function createClient() {
  if (DEMO_MODE) {
    return {
      auth: {
        async signInWithPassword() {
          return { data: { session: null, user: null }, error: null };
        },
        async signUp() {
          return { data: { session: null, user: null }, error: null };
        },
        async signOut() {
          return { error: null };
        },
        async resend() {
          return { data: {}, error: null };
        },
      },
    } as unknown as BrowserClient;
  }
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
