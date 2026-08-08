import { z } from "zod";
import { and, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { deliverables, aiEmployees, tasks } from "@beast/db";
import { createTRPCRouter, protectedProcedure } from "../init";
import { demoWhere, withDemoOverlay } from "@/lib/demo-overlay";

const FINAL_STATES = ["accepted", "published", "rejected"] as const;

export const reviewsRouter = createTRPCRouter({
  /**
   * Historical review actions. A row per deliverable that has reached a
   * final state (accepted, published, rejected). Joined with employee
   * + task for the audit trail.
   */
  history: protectedProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(100).default(30),
      offset: z.number().int().min(0).default(0),
      statusFilter: z.enum(["all", "accepted", "rejected", "published"]).default("all"),
      employeeId: z.string().uuid().optional(),
      typeFilter: z.string().min(1).max(64).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const statusList: readonly string[] =
        input.statusFilter === "accepted"
          ? ["accepted"]
          : input.statusFilter === "published"
            ? ["published"]
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
          demoSessionId: deliverables.demoSessionId,
          supersedesDeliverableId: deliverables.supersedesDeliverableId,
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
            demoWhere(ctx.demo.sessionId).seedOrMine(deliverables.demoSessionId),
            inArray(deliverables.status, [...statusList]),
            input.employeeId ? eq(deliverables.aiEmployeeId, input.employeeId) : undefined,
            input.typeFilter ? eq(deliverables.deliverableType, input.typeFilter) : undefined,
          ),
        )
        .orderBy(desc(sql`coalesce(${deliverables.approvedAt}, ${deliverables.updatedAt})`))
        .limit(input.limit)
        .offset(input.offset);

      return withDemoOverlay(rows, ctx.demo.sessionId);
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
          demoWhere(ctx.demo.sessionId).seedOrMine(deliverables.demoSessionId),
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
    const overlayColumns = { id: deliverables.id };
    const scope = and(
      eq(deliverables.companyId, ctx.companyId),
      demoWhere(ctx.demo.sessionId).seedOrMine(deliverables.demoSessionId),
    );

    const [approvedRows, publishedRows, rejectedRows, pendingRows] = await Promise.all([
      ctx.db
        .select(overlayColumns)
        .from(deliverables)
        .where(
          and(
            scope,
            eq(deliverables.status, "accepted"),
            isNotNull(deliverables.approvedAt),
            gte(deliverables.approvedAt, sinceDate),
          ),
        ),
      ctx.db
        .select(overlayColumns)
        .from(deliverables)
        .where(
          and(
            scope,
            eq(deliverables.status, "published"),
            isNotNull(deliverables.publishedAt),
            gte(deliverables.publishedAt, sinceDate),
          ),
        ),
      ctx.db
        .select(overlayColumns)
        .from(deliverables)
        .where(
          and(
            scope,
            eq(deliverables.status, "rejected"),
            gte(deliverables.updatedAt, sinceDate),
          ),
        ),
      ctx.db
        .select(overlayColumns)
        .from(deliverables)
        .where(
          and(
            scope,
            eq(deliverables.status, "in_review"),
          ),
        ),
    ]);

    // A session clone can sit in a status none of the four fetches cover
    // (e.g. revised superseding an in_review seed), so the superseded set
    // comes from the session's clones directly.
    const sessionId = ctx.demo.sessionId;
    const supersededRows = sessionId
      ? await ctx.db
          .select({ supersedesDeliverableId: deliverables.supersedesDeliverableId })
          .from(deliverables)
          .where(
            and(
              eq(deliverables.demoSessionId, sessionId),
              isNotNull(deliverables.supersedesDeliverableId),
            ),
          )
      : [];
    const superseded = new Set(
      supersededRows.flatMap((r) => (r.supersedesDeliverableId ? [r.supersedesDeliverableId] : [])),
    );
    const countVisible = (rows: Array<{ id: string }>) =>
      rows.filter((r) => !superseded.has(r.id)).length;

    return {
      pendingCount: countVisible(pendingRows),
      approvedThisWeek: countVisible(approvedRows),
      publishedThisWeek: countVisible(publishedRows),
      rejectedThisWeek: countVisible(rejectedRows),
    };
  }),
});
