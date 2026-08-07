import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { createClient } from "@/lib/supabase/server";
import { DEMO_MODE, demoSessionIdFromHeaders } from "@/lib/demo";
import { db } from "@beast/db";
import { companies, demoSessions } from "@beast/db";
import { eq } from "drizzle-orm";

/**
 * Block a mutation that would spend money or call an external API. The public
 * demo runs read-only against seeded data, so these surface as a friendly
 * error the UI can show instead of silently failing.
 */
export function assertNotDemo(action: string): void {
  if (DEMO_MODE) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `${action} is disabled in the read-only demo. Clone the repo and add your own keys to run it for real.`,
    });
  }
}

export const createTRPCContext = async (opts: { headers: Headers }) => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return {
    db,
    user,
    headers: opts.headers,
    demo: { sessionId: DEMO_MODE ? demoSessionIdFromHeaders(opts.headers) : null },
  };
};

interface Meta {
  demoAllowed?: boolean;
}

const t = initTRPC
  .context<Awaited<ReturnType<typeof createTRPCContext>>>()
  .meta<Meta>()
  .create({
    transformer: superjson,
  });

export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;
export const baseProcedure = t.procedure;

/**
 * Protected procedure: requires auth.
 * Resolves Supabase user -> Beast companyId and injects into context.
 */
export const protectedProcedure = t.procedure.use(async ({ ctx, type, meta, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  // Demo writes are allowlisted: only procedures built from demoAllowedProcedure
  // may mutate, scoped to the visitor's session overlay; everything else stays
  // read-only against the shared seeded company.
  if (DEMO_MODE && type === "mutation" && !meta?.demoAllowed) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This is a read-only demo. Clone the repo and add your own keys to make changes.",
    });
  }

  const company = await ctx.db.query.companies.findFirst({
    where: eq(companies.userId, ctx.user.id),
    columns: { id: true },
  });

  if (!company) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "No company found. Complete onboarding first.",
    });
  }

  return next({
    ctx: {
      ...ctx,
      userId: ctx.user.id,
      companyId: company.id,
    },
  });
});

/**
 * Mutations a demo visitor may run. In demo mode the visitor must carry a live
 * session cookie and ctx.demoSessionId is that session; in product mode it is
 * null, so writes can pass it straight through as the row's demo_session_id.
 */
export const demoAllowedProcedure = protectedProcedure
  .meta({ demoAllowed: true })
  .use(async ({ ctx, next }) => {
    let demoSessionId: string | null = null;
    if (DEMO_MODE) {
      if (!ctx.demo.sessionId) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Demo session missing. Reload the page to start one.",
        });
      }
      const [session] = await ctx.db
        .update(demoSessions)
        .set({ lastSeenAt: new Date() })
        .where(eq(demoSessions.id, ctx.demo.sessionId))
        .returning({ id: demoSessions.id });
      if (!session) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Demo session expired. Reload the page to start a new one.",
        });
      }
      demoSessionId = session.id;
    }
    return next({ ctx: { ...ctx, demoSessionId } });
  });
