import { z } from "zod";
import { and, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { deliverables, aiEmployees, tasks } from "@beast/db";
import { createTRPCRouter, protectedProcedure } from "../init";

const FINAL_STATES = ["approved", "published", "rejected"] as const;

export const reviewsRouter = createTRPCRouter({
  /**
   * Historical review actions. A row per deliverable that has reached a
   * final state (approved, published, rejected). Joined with employee
   * + task for the audit trail.
   */
  history: protectedProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(100).default(30),
      offset: z.number().int().min(0).default(0),
      statusFilter: z.enum(["all", "approved", "rejected"]).default("all"),
      employeeId: z.string().uuid().optional(),
      typeFilter: z.string().min(1).max(64).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const statusList: readonly string[] =
        input.statusFilter === "approved"
          ? ["approved", "published"]
          : input.statusFilter === "rejected"
            ? ["rejected"]
            : FINAL_STATES;

      const rows = await ctx.db
        .select({
          id: deliverables.id,
          title: deliverables.title,
          deliverableType: deliverables.deliverableType,
          status: deliverables.status,
          version: deliverables.version,
          publishedUrl: deliverables.publishedUrl,
          approvalRationale: deliverables.approvalRationale,
          approvedAt: deliverables.approvedAt,
          updatedAt: deliverables.updatedAt,
          taskId: deliverables.taskId,
          aiEmployeeId: deliverables.aiEmployeeId,
          employeeName: aiEmployees.name,
          employeeRoleType: aiEmployees.roleType,
          taskTitle: tasks.title,
        })
        .from(deliverables)
        .leftJoin(aiEmployees, eq(aiEmployees.id, deliverables.aiEmployeeId))
        .leftJoin(tasks, eq(tasks.id, deliverables.taskId))
        .where(
          and(
            eq(deliverables.companyId, ctx.companyId),
            inArray(deliverables.status, [...statusList]),
            input.employeeId ? eq(deliverables.aiEmployeeId, input.employeeId) : undefined,
            input.typeFilter ? eq(deliverables.deliverableType, input.typeFilter) : undefined,
          ),
        )
        .orderBy(desc(sql`coalesce(${deliverables.approvedAt}, ${deliverables.updatedAt})`))
        .limit(input.limit)
        .offset(input.offset);

      return rows;
    }),

  /**
   * Distinct deliverableType values for the company's history (final
   * states only), sorted by count desc. Source for the type chip row
   * on /reviews HistoryList; the chip row only renders types the
   * tenant actually has.
   */
  historyTypes: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        deliverableType: deliverables.deliverableType,
        count: sql<number>`count(*)::int`,
      })
      .from(deliverables)
      .where(
        and(
          eq(deliverables.companyId, ctx.companyId),
          inArray(deliverables.status, [...FINAL_STATES]),
        ),
      )
      .groupBy(deliverables.deliverableType)
      .orderBy(desc(sql<number>`count(*)`));

    return rows;
  }),

  /**
   * Counts by outcome over the trailing 7 days. Drives the stats strip
   * at the top of /reviews.
   */
  stats: protectedProcedure.query(async ({ ctx }) => {
    const sinceDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [approvedRows, publishedRows, rejectedRows, pendingRows] = await Promise.all([
      ctx.db
        .select({ id: deliverables.id })
        .from(deliverables)
        .where(
          and(
            eq(deliverables.companyId, ctx.companyId),
            eq(deliverables.status, "approved"),
            isNotNull(deliverables.approvedAt),
            gte(deliverables.approvedAt, sinceDate),
          ),
        ),
      ctx.db
        .select({ id: deliverables.id })
        .from(deliverables)
        .where(
          and(
            eq(deliverables.companyId, ctx.companyId),
            eq(deliverables.status, "published"),
            isNotNull(deliverables.publishedAt),
            gte(deliverables.publishedAt, sinceDate),
          ),
        ),
      ctx.db
        .select({ id: deliverables.id })
        .from(deliverables)
        .where(
          and(
            eq(deliverables.companyId, ctx.companyId),
            eq(deliverables.status, "rejected"),
            gte(deliverables.updatedAt, sinceDate),
          ),
        ),
      ctx.db
        .select({ id: deliverables.id })
        .from(deliverables)
        .where(
          and(
            eq(deliverables.companyId, ctx.companyId),
            inArray(deliverables.status, ["draft", "pending_review", "review"]),
          ),
        ),
    ]);

    return {
      pendingCount: pendingRows.length,
      approvedThisWeek: approvedRows.length,
      publishedThisWeek: publishedRows.length,
      rejectedThisWeek: rejectedRows.length,
    };
  }),
});
