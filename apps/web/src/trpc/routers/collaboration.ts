import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { collaborationProposals, activityLog } from "@beast/db";
import { createCollaborationTask } from "@beast/ai";
import { createTRPCRouter, protectedProcedure } from "../init";

export const collaborationRouter = createTRPCRouter({
  listProposals: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.collaborationProposals.findMany({
      where: and(
        eq(collaborationProposals.companyId, ctx.companyId),
        eq(collaborationProposals.status, "pending"),
      ),
      orderBy: (p, { desc }) => [desc(p.createdAt)],
    });
  }),

  respond: protectedProcedure
    .input(z.object({
      proposalId: z.string().uuid(),
      approved: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      const proposal = await ctx.db.query.collaborationProposals.findFirst({
        where: and(
          eq(collaborationProposals.id, input.proposalId),
          eq(collaborationProposals.companyId, ctx.companyId),
        ),
        columns: {
          id: true,
          fromEmployeeId: true,
          toEmployeeId: true,
          proposal: true,
          sourceDeliverableId: true,
        },
      });
      if (!proposal) throw new Error("Proposal not found");

      // All four writes (status flip, task insert, proposal.resultingTaskId
      // backlink, activity log) commit atomically. Prior to this, a failure
      // between the status flip and createCollaborationTask left a proposal
      // marked "approved" with no task created, and a failure before the
      // activity log left the dashboard ActivityFeed missing the event.
      const taskId = await ctx.db.transaction(async (tx) => {
        await tx
          .update(collaborationProposals)
          .set({ status: input.approved ? "approved" : "rejected" })
          .where(and(
            eq(collaborationProposals.id, input.proposalId),
            eq(collaborationProposals.companyId, ctx.companyId),
          ));

        let createdTaskId: string | null = null;
        if (input.approved) {
          createdTaskId = await createCollaborationTask(tx, {
            proposalId: input.proposalId,
            companyId: ctx.companyId,
          });
        }

        await tx.insert(activityLog).values({
          companyId: ctx.companyId,
          aiEmployeeId: proposal.fromEmployeeId,
          actionType: input.approved
            ? "collaboration_proposal_approved"
            : "collaboration_proposal_rejected",
          actionDetail: {
            proposalId: proposal.id,
            fromEmployeeId: proposal.fromEmployeeId,
            toEmployeeId: proposal.toEmployeeId,
            proposalText: proposal.proposal.slice(0, 200),
            sourceDeliverableId: proposal.sourceDeliverableId ?? undefined,
            resultingTaskId: createdTaskId ?? undefined,
          },
        });

        return createdTaskId;
      });

      return { taskCreated: !!taskId, taskId };
    }),
});
