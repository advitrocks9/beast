import { z } from "zod";
import { and, desc, eq, gte, lte, inArray, sql, isNotNull } from "drizzle-orm";
import {
  deliverables,
  checkIns,
  autonomySuggestions,
  tasks,
  notificationReads,
  aiEmployees,
} from "@beast/db";
import { createTRPCRouter, protectedProcedure } from "../init";

export type SourceType = "review" | "checkin" | "autonomy" | "plan_approval";

export interface NotificationItem {
  sourceType: SourceType;
  sourceId: string;
  title: string;
  body: string;
  href: string;
  occurredAt: Date;
  isRead: boolean;
  employeeId: string | null;
  employeeName: string | null;
  employeeRoleType: string | null;
}

const SOURCE_TYPES = ["review", "checkin", "autonomy", "plan_approval"] as const;
const REVIEW_STATES = ["draft", "pending_review", "review"] as const;
const AUTONOMY_STATES = ["queued", "shown"] as const;

function in24h(): Date {
  return new Date(Date.now() + 24 * 60 * 60 * 1000);
}

export const notificationsRouter = createTRPCRouter({
  /**
   * Aggregate lifecycle rows from four source tables, mark each item with
   * isRead by joining against notification_reads for the current user.
   * Sorted newest first; capped at 30 items.
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const horizon = in24h();

    const [reviewRows, checkinRows, autonomyRows, planRows, readRows] = await Promise.all([
      ctx.db
        .select({
          sourceId: deliverables.id,
          title: deliverables.title,
          occurredAt: deliverables.createdAt,
          aiEmployeeId: deliverables.aiEmployeeId,
          employeeName: aiEmployees.name,
          employeeRoleType: aiEmployees.roleType,
        })
        .from(deliverables)
        .leftJoin(aiEmployees, eq(aiEmployees.id, deliverables.aiEmployeeId))
        .where(
          and(
            eq(deliverables.companyId, ctx.companyId),
            inArray(deliverables.status, [...REVIEW_STATES]),
          ),
        )
        .orderBy(desc(deliverables.createdAt))
        .limit(15),

      ctx.db
        .select({
          sourceId: checkIns.id,
          title: sql<string>`coalesce((${checkIns.content}->>'deliverableTitle'), 'Check-in scheduled')`.as("title"),
          occurredAt: checkIns.scheduledFor,
          aiEmployeeId: checkIns.aiEmployeeId,
          employeeName: aiEmployees.name,
          employeeRoleType: aiEmployees.roleType,
        })
        .from(checkIns)
        .leftJoin(aiEmployees, eq(aiEmployees.id, checkIns.aiEmployeeId))
        .where(
          and(
            eq(checkIns.companyId, ctx.companyId),
            eq(checkIns.acknowledged, false),
            isNotNull(checkIns.scheduledFor),
            lte(checkIns.scheduledFor, horizon),
          ),
        )
        .orderBy(desc(checkIns.scheduledFor))
        .limit(10),

      ctx.db
        .select({
          sourceId: autonomySuggestions.id,
          title: autonomySuggestions.message,
          occurredAt: autonomySuggestions.createdAt,
          aiEmployeeId: autonomySuggestions.aiEmployeeId,
          employeeName: aiEmployees.name,
          employeeRoleType: aiEmployees.roleType,
          action: autonomySuggestions.action,
        })
        .from(autonomySuggestions)
        .leftJoin(aiEmployees, eq(aiEmployees.id, autonomySuggestions.aiEmployeeId))
        .where(
          and(
            eq(autonomySuggestions.companyId, ctx.companyId),
            inArray(autonomySuggestions.state, [...AUTONOMY_STATES]),
          ),
        )
        .orderBy(desc(autonomySuggestions.createdAt))
        .limit(10),

      ctx.db
        .select({
          sourceId: tasks.id,
          title: tasks.title,
          occurredAt: tasks.createdAt,
          aiEmployeeId: tasks.aiEmployeeId,
          employeeName: aiEmployees.name,
          employeeRoleType: aiEmployees.roleType,
        })
        .from(tasks)
        .leftJoin(aiEmployees, eq(aiEmployees.id, tasks.aiEmployeeId))
        .where(
          and(
            eq(tasks.companyId, ctx.companyId),
            isNotNull(tasks.plan),
            eq(tasks.planApproved, false),
            inArray(tasks.status, ["pending", "in_progress"]),
          ),
        )
        .orderBy(desc(tasks.createdAt))
        .limit(10),

      ctx.db
        .select({
          sourceType: notificationReads.sourceType,
          sourceId: notificationReads.sourceId,
        })
        .from(notificationReads)
        .where(
          and(
            eq(notificationReads.userId, ctx.userId),
            eq(notificationReads.companyId, ctx.companyId),
          ),
        ),
    ]);

    const readKey = (t: string, id: string) => `${t}:${id}`;
    const readSet = new Set(readRows.map((r) => readKey(r.sourceType, r.sourceId)));

    const items: NotificationItem[] = [];

    for (const r of reviewRows) {
      items.push({
        sourceType: "review",
        sourceId: r.sourceId,
        title: r.title,
        body: "Ready for your review",
        href: `/review/${r.sourceId}`,
        occurredAt: r.occurredAt,
        isRead: readSet.has(readKey("review", r.sourceId)),
        employeeId: r.aiEmployeeId,
        employeeName: r.employeeName,
        employeeRoleType: r.employeeRoleType,
      });
    }

    for (const r of checkinRows) {
      if (!r.occurredAt) continue;
      items.push({
        sourceType: "checkin",
        sourceId: r.sourceId,
        title: r.title,
        body: "Check-in due soon",
        href: `/checkins`,
        occurredAt: r.occurredAt,
        isRead: readSet.has(readKey("checkin", r.sourceId)),
        employeeId: r.aiEmployeeId,
        employeeName: r.employeeName,
        employeeRoleType: r.employeeRoleType,
      });
    }

    for (const r of autonomyRows) {
      items.push({
        sourceType: "autonomy",
        sourceId: r.sourceId,
        title: r.title,
        body: r.action ? `Autonomy promotion: ${r.action}` : "Autonomy promotion ready",
        href: `/dashboard#autonomy`,
        occurredAt: r.occurredAt,
        isRead: readSet.has(readKey("autonomy", r.sourceId)),
        employeeId: r.aiEmployeeId,
        employeeName: r.employeeName,
        employeeRoleType: r.employeeRoleType,
      });
    }

    for (const r of planRows) {
      items.push({
        sourceType: "plan_approval",
        sourceId: r.sourceId,
        title: r.title,
        body: "Plan ready for your approval",
        href: `/dashboard`,
        occurredAt: r.occurredAt,
        isRead: readSet.has(readKey("plan_approval", r.sourceId)),
        employeeId: r.aiEmployeeId,
        employeeName: r.employeeName,
        employeeRoleType: r.employeeRoleType,
      });
    }

    items.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
    const trimmed = items.slice(0, 30);
    const unreadCount = trimmed.filter((i) => !i.isRead).length;

    return { items: trimmed, unreadCount };
  }),

  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    const horizon = in24h();

    const [reviewRows, checkinRows, autonomyRows, planRows, readRows] = await Promise.all([
      ctx.db
        .select({ id: deliverables.id })
        .from(deliverables)
        .where(
          and(
            eq(deliverables.companyId, ctx.companyId),
            inArray(deliverables.status, [...REVIEW_STATES]),
          ),
        ),
      ctx.db
        .select({ id: checkIns.id })
        .from(checkIns)
        .where(
          and(
            eq(checkIns.companyId, ctx.companyId),
            eq(checkIns.acknowledged, false),
            isNotNull(checkIns.scheduledFor),
            lte(checkIns.scheduledFor, horizon),
          ),
        ),
      ctx.db
        .select({ id: autonomySuggestions.id })
        .from(autonomySuggestions)
        .where(
          and(
            eq(autonomySuggestions.companyId, ctx.companyId),
            inArray(autonomySuggestions.state, [...AUTONOMY_STATES]),
          ),
        ),
      ctx.db
        .select({ id: tasks.id })
        .from(tasks)
        .where(
          and(
            eq(tasks.companyId, ctx.companyId),
            isNotNull(tasks.plan),
            eq(tasks.planApproved, false),
            inArray(tasks.status, ["pending", "in_progress"]),
          ),
        ),
      ctx.db
        .select({
          sourceType: notificationReads.sourceType,
          sourceId: notificationReads.sourceId,
        })
        .from(notificationReads)
        .where(
          and(
            eq(notificationReads.userId, ctx.userId),
            eq(notificationReads.companyId, ctx.companyId),
          ),
        ),
    ]);

    const readKey = (t: string, id: string) => `${t}:${id}`;
    const readSet = new Set(readRows.map((r) => readKey(r.sourceType, r.sourceId)));

    let count = 0;
    for (const r of reviewRows) if (!readSet.has(readKey("review", r.id))) count++;
    for (const r of checkinRows) if (!readSet.has(readKey("checkin", r.id))) count++;
    for (const r of autonomyRows) if (!readSet.has(readKey("autonomy", r.id))) count++;
    for (const r of planRows) if (!readSet.has(readKey("plan_approval", r.id))) count++;

    return { count };
  }),

  markRead: protectedProcedure
    .input(z.object({
      sourceType: z.enum(SOURCE_TYPES),
      sourceId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .insert(notificationReads)
        .values({
          userId: ctx.userId,
          companyId: ctx.companyId,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
        })
        .onConflictDoNothing({
          target: [
            notificationReads.userId,
            notificationReads.sourceType,
            notificationReads.sourceId,
          ],
        });
    }),

  markAllRead: protectedProcedure
    .input(z.object({
      items: z.array(z.object({
        sourceType: z.enum(SOURCE_TYPES),
        sourceId: z.string().uuid(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.items.length === 0) return;
      await ctx.db
        .insert(notificationReads)
        .values(
          input.items.map((i) => ({
            userId: ctx.userId,
            companyId: ctx.companyId,
            sourceType: i.sourceType,
            sourceId: i.sourceId,
          })),
        )
        .onConflictDoNothing({
          target: [
            notificationReads.userId,
            notificationReads.sourceType,
            notificationReads.sourceId,
          ],
        });
    }),
});
