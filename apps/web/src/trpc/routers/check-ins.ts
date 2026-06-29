import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and } from "drizzle-orm";
import { checkIns } from "@beast/db";
import { createTRPCRouter, protectedProcedure } from "../init";

const ONE_HOUR_MS = 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export const checkInsRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({
      employeeId: z.string().uuid().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const conditions = [eq(checkIns.companyId, ctx.companyId)];
      if (input.employeeId) {
        conditions.push(eq(checkIns.aiEmployeeId, input.employeeId));
      }
      return ctx.db.query.checkIns.findMany({
        where: and(...conditions),
        orderBy: (c, { desc }) => [desc(c.createdAt)],
      });
    }),

  acknowledge: protectedProcedure
    .input(z.object({
      checkInId: z.string().uuid(),
      response: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(checkIns)
        .set({ acknowledged: true, response: input.response })
        .where(and(eq(checkIns.id, input.checkInId), eq(checkIns.companyId, ctx.companyId)));
    }),

  /**
   * Reschedule a post-approval check-in. Updates content.scheduledFor in
   * the JSONB column. replaces the placeholder banner from tick
   * 043's modal with a real picker.
   */
  reschedule: protectedProcedure
    .input(z.object({
      checkInId: z.string().uuid(),
      scheduledFor: z.string().datetime(),
    }))
    .mutation(async ({ ctx, input }) => {
      const target = new Date(input.scheduledFor);
      const now = Date.now();
      if (target.getTime() < now + ONE_HOUR_MS) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Pick a time at least 1 hour from now." });
      }
      if (target.getTime() > now + THIRTY_DAYS_MS) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Pick a time within the next 30 days." });
      }

      const existing = await ctx.db.query.checkIns.findFirst({
        where: and(
          eq(checkIns.id, input.checkInId),
          eq(checkIns.companyId, ctx.companyId),
        ),
        columns: { id: true, content: true, acknowledged: true },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Check-in not found" });
      }
      if (existing.acknowledged) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Check-in already acknowledged" });
      }

      const baseContent = (existing.content as Record<string, unknown> | null) ?? {};
      const nextContent = { ...baseContent, scheduledFor: target.toISOString() };

      await ctx.db
        .update(checkIns)
        .set({ content: nextContent, scheduledFor: target })
        .where(and(eq(checkIns.id, existing.id), eq(checkIns.companyId, ctx.companyId)));

      return { scheduledFor: target.toISOString() };
    }),
});
