import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { activityLog } from "@beast/db";
import { createTRPCRouter, protectedProcedure } from "../init";

export const activityRouter = createTRPCRouter({
  feed: protectedProcedure
    .input(z.object({
      employeeId: z.string().uuid().optional(),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }))
    .query(async ({ ctx, input }) => {
      const conditions = [eq(activityLog.companyId, ctx.companyId)];
      if (input.employeeId) {
        conditions.push(eq(activityLog.aiEmployeeId, input.employeeId));
      }
      return ctx.db.query.activityLog.findMany({
        where: and(...conditions),
        limit: input.limit,
        offset: input.offset,
        orderBy: (log, { desc }) => [desc(log.createdAt)],
      });
    }),
});
