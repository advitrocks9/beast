import { eq, and } from "drizzle-orm";
import { deliverables, checkIns, collaborationProposals } from "@beast/db";
import { createTRPCRouter, protectedProcedure } from "../init";

export const reviewQueueRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    const [pendingDeliverables, pendingCheckIns, pendingProposals] = await Promise.all([
      ctx.db.query.deliverables.findMany({
        where: and(eq(deliverables.companyId, ctx.companyId), eq(deliverables.status, "review")),
        orderBy: (d, { desc }) => [desc(d.createdAt)],
      }),
      ctx.db.query.checkIns.findMany({
        where: and(eq(checkIns.companyId, ctx.companyId), eq(checkIns.acknowledged, false)),
        orderBy: (c, { desc }) => [desc(c.createdAt)],
      }),
      ctx.db.query.collaborationProposals.findMany({
        where: and(
          eq(collaborationProposals.companyId, ctx.companyId),
          eq(collaborationProposals.status, "pending"),
        ),
        orderBy: (p, { desc }) => [desc(p.createdAt)],
      }),
    ]);

    return { pendingDeliverables, pendingCheckIns, pendingProposals };
  }),

  count: protectedProcedure.query(async ({ ctx }) => {
    const [deliverableCount, checkInCount, proposalCount] = await Promise.all([
      ctx.db.query.deliverables.findMany({
        where: and(eq(deliverables.companyId, ctx.companyId), eq(deliverables.status, "review")),
        columns: { id: true },
      }),
      ctx.db.query.checkIns.findMany({
        where: and(eq(checkIns.companyId, ctx.companyId), eq(checkIns.acknowledged, false)),
        columns: { id: true },
      }),
      ctx.db.query.collaborationProposals.findMany({
        where: and(
          eq(collaborationProposals.companyId, ctx.companyId),
          eq(collaborationProposals.status, "pending"),
        ),
        columns: { id: true },
      }),
    ]);

    return deliverableCount.length + checkInCount.length + proposalCount.length;
  }),
});
