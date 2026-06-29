import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { createClient } from "@/lib/supabase/server";
import { DEMO_MODE } from "@/lib/demo";
import { db } from "@beast/db";
import { companies } from "@beast/db";
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
  };
};

const t = initTRPC
  .context<Awaited<ReturnType<typeof createTRPCContext>>>()
  .create({
    transformer: superjson,
  });

export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;
export const baseProcedure = t.procedure;

/**
 * Public procedure: no auth required, no company scoping.
 * For routes like /share/[slug] that are deliberately unauthenticated.
 */
export const publicProcedure = t.procedure;

/**
 * Protected procedure: requires auth.
 * Resolves Supabase user -> Beast companyId and injects into context.
 */
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
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
