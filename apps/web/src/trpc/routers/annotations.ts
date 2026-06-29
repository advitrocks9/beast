import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { commentThreads, comments, deliverables } from "@beast/db";
import { createTRPCRouter, protectedProcedure } from "../init";

export const annotationsRouter = createTRPCRouter({
  createThread: protectedProcedure
    .input(z.object({
      deliverableId: z.string().uuid(),
      anchorFrom: z.number(),
      anchorTo: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Defense-in-depth: verify the deliverable belongs to this tenant
      // before tagging the thread with ctx.companyId. Otherwise a request
      // body with another tenant's deliverableId would silently create
      // an orphan thread inside our tenant referencing their deliverable.
      const owns = await ctx.db.query.deliverables.findFirst({
        where: and(
          eq(deliverables.id, input.deliverableId),
          eq(deliverables.companyId, ctx.companyId),
        ),
        columns: { id: true },
      });
      if (!owns) throw new TRPCError({ code: "NOT_FOUND", message: "Deliverable not found" });

      const [thread] = await ctx.db.insert(commentThreads).values({
        companyId: ctx.companyId,
        ...input,
      }).returning();
      return thread;
    }),

  addComment: protectedProcedure
    .input(z.object({
      threadId: z.string().uuid(),
      content: z.string().optional(),
      commentType: z.enum(["text", "chip"]),
      chipValue: z.enum([
        "too_formal", "too_casual", "make_punchier", "add_data",
        "stronger_cta", "love_this", "different_angle", "too_long",
      ]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify thread belongs to this tenant. comments has no companyId
      // column (the thread is the tenant link), so without this check a
      // caller knowing another tenant's threadId could attach comments
      // to it.
      const owns = await ctx.db.query.commentThreads.findFirst({
        where: and(
          eq(commentThreads.id, input.threadId),
          eq(commentThreads.companyId, ctx.companyId),
        ),
        columns: { id: true },
      });
      if (!owns) throw new TRPCError({ code: "NOT_FOUND", message: "Thread not found" });

      const [comment] = await ctx.db.insert(comments).values({
        authorType: "user",
        authorId: ctx.userId,
        content: input.content ?? input.chipValue ?? "",
        ...input,
      }).returning();
      return comment;
    }),

  resolveThread: protectedProcedure
    .input(z.object({ threadId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(commentThreads)
        .set({ resolved: true })
        .where(and(
          eq(commentThreads.id, input.threadId),
          eq(commentThreads.companyId, ctx.companyId),
        ));
    }),
});
