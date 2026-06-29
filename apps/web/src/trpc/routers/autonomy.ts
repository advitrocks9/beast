import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import { autonomySuggestions, aiEmployees, deliverables } from "@beast/db";
import { escalateAutonomy } from "@beast/ai";
import { createTRPCRouter, protectedProcedure } from "../init";
import { trackEvent } from "@/lib/events/track";

const SUGGESTION_STATES = ["queued", "shown", "snoozed"] as const;

export const autonomyRouter = createTRPCRouter({
  // Active suggestions for the current company. Joined with employee
  // identity so the banner can render role color and name without a
  // second roundtrip.
  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        id: autonomySuggestions.id,
        aiEmployeeId: autonomySuggestions.aiEmployeeId,
        action: autonomySuggestions.action,
        consecutiveApprovals: autonomySuggestions.consecutiveApprovals,
        message: autonomySuggestions.message,
        state: autonomySuggestions.state,
        snoozeUntil: autonomySuggestions.snoozeUntil,
        createdAt: autonomySuggestions.createdAt,
        employeeName: aiEmployees.name,
        employeeRoleType: aiEmployees.roleType,
      })
      .from(autonomySuggestions)
      .innerJoin(
        aiEmployees,
        eq(aiEmployees.id, autonomySuggestions.aiEmployeeId),
      )
      .where(
        and(
          eq(autonomySuggestions.companyId, ctx.companyId),
          inArray(autonomySuggestions.state, [...SUGGESTION_STATES]),
        ),
      )
      .orderBy(desc(autonomySuggestions.createdAt));

    return rows;
  }),

  markShown: protectedProcedure
    .input(z.object({ suggestionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(autonomySuggestions)
        .set({ state: "shown", shownAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(autonomySuggestions.id, input.suggestionId),
            eq(autonomySuggestions.companyId, ctx.companyId),
            eq(autonomySuggestions.state, "queued"),
          ),
        );
      await trackEvent({
        companyId: ctx.companyId,
        userId: ctx.userId,
        eventName: "autonomy_suggestion_shown",
        properties: { suggestionId: input.suggestionId },
      });
    }),

  accept: protectedProcedure
    .input(z.object({ suggestionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const suggestion = await ctx.db.query.autonomySuggestions.findFirst({
        where: and(
          eq(autonomySuggestions.id, input.suggestionId),
          eq(autonomySuggestions.companyId, ctx.companyId),
        ),
      });
      if (!suggestion) {
        throw new Error("Suggestion not found");
      }
      if (suggestion.state === "accepted" || suggestion.state === "dismissed") {
        return { state: suggestion.state };
      }

      // Atomic so a partial commit can't leave autonomy escalated on the
      // employee while the suggestion still reads "queued" on the dashboard
      // (founder clicks Accept again -> escalateAutonomy is idempotent via
      // jsonb_set, but writes a duplicate activity_log row each time).
      await ctx.db.transaction(async (tx) => {
        await escalateAutonomy(tx, {
          employeeId: suggestion.aiEmployeeId,
          companyId: ctx.companyId,
          action: suggestion.action,
        });

        await tx
          .update(autonomySuggestions)
          .set({
            state: "accepted",
            decidedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(autonomySuggestions.id, input.suggestionId));
      });

      await trackEvent({
        companyId: ctx.companyId,
        userId: ctx.userId,
        eventName: "autonomy_suggestion_accepted",
        properties: {
          suggestionId: input.suggestionId,
          action: suggestion.action,
        },
      });

      return { state: "accepted" as const };
    }),

  snooze: protectedProcedure
    .input(z.object({
      suggestionId: z.string().uuid(),
      days: z.number().int().min(1).max(90).default(14),
    }))
    .mutation(async ({ ctx, input }) => {
      const until = new Date(Date.now() + input.days * 24 * 60 * 60 * 1000);
      await ctx.db
        .update(autonomySuggestions)
        .set({
          state: "snoozed",
          snoozeUntil: until,
          decidedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(autonomySuggestions.id, input.suggestionId),
            eq(autonomySuggestions.companyId, ctx.companyId),
          ),
        );
      await trackEvent({
        companyId: ctx.companyId,
        userId: ctx.userId,
        eventName: "autonomy_suggestion_snoozed",
        properties: { suggestionId: input.suggestionId, days: input.days },
      });
      return { snoozeUntil: until };
    }),

  dismiss: protectedProcedure
    .input(z.object({ suggestionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(autonomySuggestions)
        .set({
          state: "dismissed",
          decidedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(autonomySuggestions.id, input.suggestionId),
            eq(autonomySuggestions.companyId, ctx.companyId),
          ),
        );
      await trackEvent({
        companyId: ctx.companyId,
        userId: ctx.userId,
        eventName: "autonomy_suggestion_dismissed",
        properties: { suggestionId: input.suggestionId },
      });
    }),

  // Last N approved deliverables that fed the streak. Powers the
  // "See last 8" panel rendered next to the banner.
  lastApproved: protectedProcedure
    .input(z.object({
      aiEmployeeId: z.string().uuid(),
      limit: z.number().int().min(1).max(20).default(8),
    }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.query.deliverables.findMany({
        where: and(
          eq(deliverables.aiEmployeeId, input.aiEmployeeId),
          eq(deliverables.companyId, ctx.companyId),
          eq(deliverables.status, "approved"),
        ),
        columns: {
          id: true,
          title: true,
          deliverableType: true,
          version: true,
          createdAt: true,
        },
        orderBy: (d, { desc }) => [desc(d.createdAt)],
        limit: input.limit,
      });
      return rows;
    }),
});
