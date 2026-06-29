import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { DEMO_MODE } from "@/lib/demo";

const PUBLIC_PREFIXES = [
  "/sign-in",
  "/sign-up",
  "/auth/callback",
  "/pricing",
  "/api/auth/auto-confirm",
  "/share/", // public deliverable share route
  "/vs/", // public marketing comparison pages (e.g. /vs/sintra)
];
// Exact-match public paths. Listed separately so "/" does not accidentally
// match every route via startsWith.
const PUBLIC_EXACT = [
  "/",
  "/sitemap.xml",
  "/robots.txt",
  "/opengraph-image",
  "/twitter-image",
  "/favicon.ico",
];
// Routes that require auth but not a company record
const AUTH_ONLY_ROUTES = ["/onboarding"];

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Demo mode treats every visitor as the seeded founder. Send the auth pages
  // straight to the dashboard and let everything else through unguarded.
  if (DEMO_MODE) {
    if (path === "/sign-in" || path === "/sign-up") {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
    return NextResponse.next({ request });
  }

  // No Supabase env (a bare clone): skip auth so marketing pages still render.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();

  const isPublic =
    PUBLIC_EXACT.includes(path) ||
    PUBLIC_PREFIXES.some((route) => path.startsWith(route));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    return NextResponse.redirect(url);
  }

  if (user && (request.nextUrl.pathname === "/sign-in" || request.nextUrl.pathname === "/sign-up")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
