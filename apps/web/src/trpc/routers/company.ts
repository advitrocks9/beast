import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { companies } from "@beast/db";
import { ONBOARDING_STATUSES } from "@beast/shared";
import { createTRPCRouter, protectedProcedure, baseProcedure } from "../init";

export const companyRouter = createTRPCRouter({
  get: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.companies.findFirst({
      where: eq(companies.id, ctx.companyId),
    }) ?? null;
  }),

  /**
   * Create or return the company for the current user.
   * Uses baseProcedure (auth only, no company required) since
   * this is called before the company exists.
   */
  ensure: baseProcedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      const existing = await ctx.db.query.companies.findFirst({
        where: eq(companies.userId, ctx.user.id),
      });

      if (existing) return existing;

      // Concurrent ensure calls (founder double-click "Get started" after
      // sign-in, race with the auth callback at apps/web/src/app/auth/
      // callback/route.ts) both see no existing row and both try to insert.
      // companies.userId has a unique constraint so the second would 23505.
      // onConflictDoNothing lets the second call no-op; re-fetch covers
      // that branch.
      const [created] = await ctx.db.insert(companies).values({
        userId: ctx.user.id,
        name: input.name,
        founderEmail: ctx.user.email ?? null,
      })
        .onConflictDoNothing({ target: companies.userId })
        .returning();

      const company = created ?? await ctx.db.query.companies.findFirst({
        where: eq(companies.userId, ctx.user.id),
      });
      if (!company) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to ensure company" });

      return company;
    }),

  updateOnboardingStatus: protectedProcedure
    .input(z.object({
      status: z.enum(ONBOARDING_STATUSES),
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(companies)
        .set({ onboardingStatus: input.status, updatedAt: new Date() })
        .where(eq(companies.id, ctx.companyId));
    }),

  getContextScore: protectedProcedure.query(async ({ ctx }) => {
    const company = await ctx.db.query.companies.findFirst({
      where: eq(companies.id, ctx.companyId),
      columns: { contextScore: true },
    });
    return company?.contextScore ?? 0;
  }),
});
