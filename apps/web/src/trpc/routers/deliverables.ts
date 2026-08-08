import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, or, inArray, count } from "drizzle-orm";
import { db, deliverables, deliverableVersions, tasks, checkIns, companies, proceduralMemories } from "@beast/db";
import {
  extractFromTaskCompletion,
  extractFromFeedback,
  extractRuleFromRationale,
  storeApprovedExample,
  advanceChain,
  publishToPlatform,
  recalculateGoalProgress,
  dispatchRun,
} from "@beast/ai";
import type { SpawnPayload, CandidateResult, WordDiff } from "@beast/ai";
import { DELIVERABLE_STATUSES } from "@beast/shared";
import { connectors, activityLog } from "@beast/db";
import { createTRPCRouter, protectedProcedure, demoAllowedProcedure, assertNotDemo } from "../init";
import { demoWhere, withDemoOverlay } from "@/lib/demo-overlay";
import { triggerTask } from "@/lib/trigger";

interface WallClockParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

function partsInTz(d: Date, tz: string): WallClockParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    // Intl returns "24" for midnight in some Node versions; normalize.
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAY_INDEX[parts.weekday ?? "Sun"] ?? 0,
  };
}

/**
 * Convert a wall-clock {y, m, d, h, mi, s} in `tz` to a UTC Date.
 * Round-trip via Intl: take an initial UTC guess, see how it formats
 * in tz, and subtract the resulting offset.
 */
function wallClockInTzToUtc(
  y: number,
  m: number,
  d: number,
  h: number,
  mi: number,
  s: number,
  tz: string,
): Date {
  const guess = new Date(Date.UTC(y, m - 1, d, h, mi, s));
  const seenInTz = partsInTz(guess, tz);
  const wantedMs = Date.UTC(y, m - 1, d, h, mi, s);
  const gotMs = Date.UTC(
    seenInTz.year,
    seenInTz.month - 1,
    seenInTz.day,
    seenInTz.hour,
    seenInTz.minute,
    seenInTz.second,
  );
  return new Date(guess.getTime() - (gotMs - wantedMs));
}

/**
 * Compute the next Monday at 09:00 in the company's timezone, returned as
 * a UTC Date suitable for storage. Uses `companies.timezone` so the
 * scheduled time is founder-local. Falls back to
 * UTC math for unknown or empty timezone strings.
 */
function nextMonday9amInTz(tz: string, now: Date = new Date()): Date {
  const safeTz = tz || "UTC";
  let parts: WallClockParts;
  try {
    parts = partsInTz(now, safeTz);
  } catch {
    // Invalid IANA tz string. Fall back to UTC.
    parts = partsInTz(now, "UTC");
  }
  let daysAhead = (1 - parts.weekday + 7) % 7;
  if (daysAhead === 0 && parts.hour >= 9) daysAhead = 7;
  return wallClockInTzToUtc(parts.year, parts.month, parts.day + daysAhead, 9, 0, 0, safeTz);
}

const triggerExecuteTask = (payload: SpawnPayload) => triggerTask("execute-task", payload);

/** Amendment ordinal for a just-promoted rule: rows are append-only, so the
 * tenant's total row count is the number the manual stamps on it. */
async function manualRuleNumberFor(
  database: typeof db,
  tenantId: string,
  candidates: CandidateResult[],
): Promise<number | null> {
  if (!candidates.some((c) => c.promotedRuleId)) return null;
  const [row] = await database
    .select({ value: count() })
    .from(proceduralMemories)
    .where(eq(proceduralMemories.tenantId, tenantId));
  return row?.value ?? null;
}

/** The one run-dispatch seam: Trigger.dev when configured, in-process otherwise. */
const dispatch = (taskId: string) => dispatchRun(taskId, { trigger: triggerExecuteTask });

/**
 * Demo copy-on-write: a review that targets a seed row (demoSessionId null)
 * clones it into the visitor's session and the review applies to the clone;
 * visitor-created and product rows come back unchanged. Idempotent per
 * session per seed row.
 */
async function resolveReviewTarget(
  database: typeof db,
  input: {
    deliverableId: string;
    companyId: string;
    demoSessionId: string | null;
    reviewableStatuses: string[];
  },
) {
  const target = await database.query.deliverables.findFirst({
    where: and(
      eq(deliverables.id, input.deliverableId),
      eq(deliverables.companyId, input.companyId),
      demoWhere(input.demoSessionId).seedOrMine(deliverables.demoSessionId),
    ),
  });
  if (!target) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Deliverable not found" });
  }
  if (!input.demoSessionId || target.demoSessionId !== null) {
    return target;
  }

  const existingClone = await database.query.deliverables.findFirst({
    where: and(
      eq(deliverables.supersedesDeliverableId, target.id),
      eq(deliverables.demoSessionId, input.demoSessionId),
    ),
  });
  if (existingClone) return existingClone;

  if (!input.reviewableStatuses.includes(target.status)) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Deliverable is not awaiting review" });
  }

  const [clone] = await database
    .insert(deliverables)
    .values({
      taskId: target.taskId,
      companyId: target.companyId,
      aiEmployeeId: target.aiEmployeeId,
      deliverableType: target.deliverableType,
      title: target.title,
      content: target.content,
      renderedPreview: target.renderedPreview,
      version: target.version,
      status: target.status,
      publishAfter: target.publishAfter,
      demoSessionId: input.demoSessionId,
      supersedesDeliverableId: target.id,
    })
    .returning();
  if (!clone) throw new Error("deliverable clone returned no row");
  return clone;
}

export const deliverablesRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({
      employeeId: z.string().uuid().optional(),
      status: z.enum(DELIVERABLE_STATUSES).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const sessionId = ctx.demo.sessionId;
      const conditions = [
        eq(deliverables.companyId, ctx.companyId),
        demoWhere(sessionId).seedOrMine(deliverables.demoSessionId),
      ];
      if (input.employeeId) {
        conditions.push(eq(deliverables.aiEmployeeId, input.employeeId));
      }
      if (input.status) {
        // In demo the session's clones ride along regardless of status so the
        // overlay can drop seed rows they superseded; re-filtered below.
        // or() is undefined only when called with zero conditions
        conditions.push(
          sessionId
            ? or(eq(deliverables.status, input.status), eq(deliverables.demoSessionId, sessionId))!
            : eq(deliverables.status, input.status),
        );
      }
      const rows = await ctx.db.query.deliverables.findMany({
        where: and(...conditions),
        orderBy: (d, { desc }) => [desc(d.createdAt)],
      });
      return withDemoOverlay(rows, sessionId).filter(
        (d) => !input.status || d.status === input.status,
      );
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.deliverables.findFirst({
        where: and(
          eq(deliverables.id, input.id),
          eq(deliverables.companyId, ctx.companyId),
          demoWhere(ctx.demo.sessionId).seedOrMine(deliverables.demoSessionId),
        ),
      });
    }),

  getVersions: protectedProcedure
    .input(z.object({ deliverableId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // deliverable_versions has no company_id of its own, so verify the
      // parent deliverable belongs to the caller before returning history.
      const owner = await ctx.db.query.deliverables.findFirst({
        where: and(
          eq(deliverables.id, input.deliverableId),
          eq(deliverables.companyId, ctx.companyId),
          demoWhere(ctx.demo.sessionId).seedOrMine(deliverables.demoSessionId),
        ),
        columns: { id: true },
      });
      if (!owner) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Deliverable not found" });
      }
      return ctx.db.query.deliverableVersions.findMany({
        where: eq(deliverableVersions.deliverableId, input.deliverableId),
        orderBy: (v, { desc }) => [desc(v.version)],
      });
    }),

  /**
   * Currently-scheduled auto-publish rows for this company. Drives the
   * countdown pill on /reviews and the post-approve UI.
   */
  pendingAutoPublish: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.query.deliverables.findMany({
      where: and(
        eq(deliverables.companyId, ctx.companyId),
        eq(deliverables.status, "auto_publishing"),
        demoWhere(ctx.demo.sessionId).seedOrMine(deliverables.demoSessionId),
      ),
      columns: {
        id: true,
        title: true,
        deliverableType: true,
        publishAfter: true,
        aiEmployeeId: true,
        approvedAt: true,
        demoSessionId: true,
        supersedesDeliverableId: true,
      },
      orderBy: (d, { asc }) => [asc(d.publishAfter)],
    });
    return withDemoOverlay(rows, ctx.demo.sessionId);
  }),

  /**
   * Schedule a delayed publish. Sets status to `auto_publishing` and
   * publishAfter to now + delaySeconds. The auto-publish-sweep cron
   * picks the row up when the timer elapses.
   */
  queueAutoPublish: protectedProcedure
    .input(z.object({
      deliverableId: z.string().uuid(),
      delaySeconds: z.number().int().min(15).max(900).default(60),
    }))
    .mutation(async ({ ctx, input }) => {
      const publishAfter = new Date(Date.now() + input.delaySeconds * 1000);
      const [updated] = await ctx.db
        .update(deliverables)
        .set({
          status: "auto_publishing",
          publishAfter,
          updatedAt: new Date(),
        })
        .where(and(
          eq(deliverables.id, input.deliverableId),
          eq(deliverables.companyId, ctx.companyId),
          eq(deliverables.status, "accepted"),
        ))
        .returning({ id: deliverables.id, publishAfter: deliverables.publishAfter });

      if (!updated) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Deliverable must be accepted before queueing",
        });
      }

      await ctx.db.insert(activityLog).values({
        companyId: ctx.companyId,
        actionType: "auto_publish_queued",
        actionDetail: {
          deliverableId: updated.id,
          publishAfter: updated.publishAfter?.toISOString() ?? null,
          delaySeconds: input.delaySeconds,
        },
      });

      return { publishAfter: updated.publishAfter };
    }),

  /**
   * Cancel a scheduled auto-publish. Reverts to accepted so the founder
   * can publish manually or queue again with a different delay.
   */
  cancelAutoPublish: protectedProcedure
    .input(z.object({ deliverableId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(deliverables)
        .set({
          status: "accepted",
          publishAfter: null,
          updatedAt: new Date(),
        })
        .where(and(
          eq(deliverables.id, input.deliverableId),
          eq(deliverables.companyId, ctx.companyId),
          eq(deliverables.status, "auto_publishing"),
        ))
        .returning({ id: deliverables.id });

      if (!updated) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Deliverable is not currently scheduled for auto-publish",
        });
      }

      await ctx.db.insert(activityLog).values({
        companyId: ctx.companyId,
        actionType: "auto_publish_cancelled",
        actionDetail: { deliverableId: updated.id },
      });
    }),

  /**
   * Founder-edited body. Stores the edit on `content.editedText` so the
   * agent's original output stays intact for the diff that drives RLHF.
   * Bumps the version counter and writes a deliverableVersions row
   * snapshotting the prior content.
   */
  saveEdit: protectedProcedure
    .input(z.object({
      deliverableId: z.string().uuid(),
      editedText: z.string().min(1).max(20000),
    }))
    .mutation(async ({ ctx, input }) => {
      // Atomic so a mid-write failure can't desync version row vs deliverable.
      const newVersion = await ctx.db.transaction(async (tx) => {
        const existing = await tx.query.deliverables.findFirst({
          where: and(
            eq(deliverables.id, input.deliverableId),
            eq(deliverables.companyId, ctx.companyId),
          ),
          columns: { id: true, content: true, version: true },
        });
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Deliverable not found" });

        const oldContent = (existing.content as Record<string, unknown>) ?? {};
        const next = (existing.version ?? 1) + 1;

        await tx.insert(deliverableVersions).values({
          deliverableId: input.deliverableId,
          version: existing.version ?? 1,
          content: oldContent,
          changeSummary: "founder edit",
        });

        const newContent = { ...oldContent, editedText: input.editedText };

        await tx
          .update(deliverables)
          .set({ content: newContent, version: next, updatedAt: new Date() })
          .where(and(
            eq(deliverables.id, input.deliverableId),
            eq(deliverables.companyId, ctx.companyId),
          ));

        return next;
      });

      return { version: newVersion };
    }),

  approve: demoAllowedProcedure
    .input(z.object({
      deliverableId: z.string().uuid(),
      chips: z.array(z.string()).default([]),
      feedbackText: z.string().optional(),
      originalText: z.string().optional(),
      editedText: z.string().optional(),
      approvedWithoutEdits: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const approvedAt = new Date();
      const rationale = input.feedbackText?.trim() || null;
      const reviewId = crypto.randomUUID();

      const target = await resolveReviewTarget(ctx.db, {
        deliverableId: input.deliverableId,
        companyId: ctx.companyId,
        demoSessionId: ctx.demoSessionId,
        reviewableStatuses: ["in_review", "revised"],
      });
      // A clone reviews shared seed work: the seed task, goals, and check-ins
      // stay untouched so other visitors' demos are not judged for them.
      const isDemoClone = target.supersedesDeliverableId !== null;

      const [updated] = await ctx.db
        .update(deliverables)
        .set({
          status: "accepted",
          approvalRationale: rationale,
          approvedAt,
          updatedAt: approvedAt,
        })
        .where(and(
          eq(deliverables.id, target.id),
          eq(deliverables.companyId, ctx.companyId),
          inArray(deliverables.status, ["in_review", "revised"]),
        ))
        .returning();

      if (!updated) return;

      // Fetch task context for extraction + chain detection + goal tracking
      const task = await ctx.db.query.tasks.findFirst({
        where: eq(tasks.id, updated.taskId),
        columns: { id: true, title: true, taskType: true, parentTaskId: true, goalId: true },
      });

      if (!task) return;

      if (!isDemoClone) {
        await ctx.db.update(tasks).set({ status: "accepted" }).where(eq(tasks.id, task.id));
      }

      await ctx.db.insert(activityLog).values({
        companyId: ctx.companyId,
        aiEmployeeId: updated.aiEmployeeId,
        actionType: "deliverable_approved",
        demoSessionId: ctx.demoSessionId,
        actionDetail: {
          deliverableId: updated.id,
          deliverableTitle: updated.title,
          taskId: task.id,
          taskType: task.taskType,
          approvalRationale: rationale,
          chips: input.chips,
          approvedWithoutEdits: input.approvedWithoutEdits,
          reviewId,
        },
      });

      // Chain advancement: if this task has a parent, advance the chain
      if (task.parentTaskId && !isDemoClone) {
        advanceChain(task.parentTaskId, (payload) => dispatch(payload.task.taskId)).catch((err) => {
          console.error("Chain advancement failed on deliverable approve:", err);
        });
      }

      // Goal progress: recalculate if task is linked to a goal
      if (task.goalId && !isDemoClone) {
        recalculateGoalProgress(task.goalId, ctx.companyId).catch((err) => {
          console.error("Goal progress recalculation failed:", err);
        });
      }

      // Episodic extraction stays async - the review response doesn't need
      // it. Skipped for demo sessions: episodic_memories has no session
      // column, so the write would leak into every visitor's shared org.
      if (!ctx.demoSessionId) {
        extractFromTaskCompletion({
          agentId: updated.aiEmployeeId,
          tenantId: ctx.companyId,
          taskId: task.id,
          taskType: task.taskType,
          taskTitle: task.title,
          outputText: input.originalText ?? "",
          status: "approved",
        }).catch((err) => {
          console.error("Task completion extraction failed on approve:", err);
        });
      }

      // Signal accumulation is awaited so the response carries the
      // created/updated candidates - the "candidate rule appeared" moment.
      const candidateById = new Map<string, CandidateResult>();
      let diff: WordDiff | null = null;
      try {
        if (input.approvedWithoutEdits && input.originalText) {
          const example = await storeApprovedExample({
            agentId: updated.aiEmployeeId,
            tenantId: ctx.companyId,
            taskType: task.taskType,
            taskTitle: task.title,
            outputText: input.originalText,
            taskId: task.id,
            reviewId,
            demoSessionId: ctx.demoSessionId,
          });
          candidateById.set(example.id, example);
        }

        // editedText carries the founder's revisions so extractFromFeedback can
        // diff agent output -> final, the same shape used for RLHF chip flow.
        if (input.chips.length > 0 || input.feedbackText || input.editedText) {
          const feedback = await extractFromFeedback({
            agentId: updated.aiEmployeeId,
            tenantId: ctx.companyId,
            taskId: task.id,
            taskType: task.taskType,
            originalText: input.originalText ?? "",
            editedText: input.editedText,
            chips: input.chips,
            annotationText: input.feedbackText,
            reviewId,
            demoSessionId: ctx.demoSessionId,
          });
          diff = feedback.diff;
          for (const c of feedback.candidates) candidateById.set(c.id, c);
        }

        if (rationale && input.originalText) {
          const rationaleResult = await extractRuleFromRationale({
            agentId: updated.aiEmployeeId,
            tenantId: ctx.companyId,
            taskId: task.id,
            taskType: task.taskType,
            rationale,
            outputText: input.originalText,
            reviewId,
            demoSessionId: ctx.demoSessionId,
          });
          if (rationaleResult) candidateById.set(rationaleResult.candidate.id, rationaleResult.candidate);
        }
      } catch (err) {
        // Approval already committed; learning is skipped, not the review
        console.error("Signal accumulation failed on approve:", err);
      }

      // Insert post-approval check-in. The weekly worker
      // surfaces unacknowledged check_ins in section 3 of the Monday email.
      // scheduledFor honors the company's timezone so "Monday
      // morning" actually lands at 9am founder-local.
      const company = await ctx.db.query.companies.findFirst({
        where: eq(companies.id, ctx.companyId),
        columns: { timezone: true },
      });
      const scheduledFor = nextMonday9amInTz(company?.timezone ?? "UTC");
      const summary = (() => {
        const content = updated.content as Record<string, unknown> | null;
        const text = (content && typeof content === "object" && typeof content.text === "string")
          ? content.text
          : updated.renderedPreview ?? "";
        return text.replace(/\s+/g, " ").slice(0, 240);
      })();

      // check_ins has no session column, so a demo visitor's approval would
      // surface a check-in to every visitor; skip it there.
      const [checkInRow] = ctx.demoSessionId
        ? [undefined]
        : await ctx.db.insert(checkIns).values({
            aiEmployeeId: updated.aiEmployeeId,
            companyId: ctx.companyId,
            taskId: task.id,
            checkInType: "post_approval_followup",
            scheduledFor,
            content: {
              deliverableId: updated.id,
              deliverableTitle: updated.title,
              deliverableType: updated.deliverableType,
              goalId: task.goalId ?? null,
              approvedAt: new Date().toISOString(),
              scheduledFor: scheduledFor.toISOString(),
              summary,
            },
          }).returning({ id: checkIns.id });

      const candidates = [...candidateById.values()];
      return {
        deliverableId: updated.id,
        checkInId: checkInRow?.id,
        scheduledFor: scheduledFor.toISOString(),
        candidates,
        diff,
        manualRuleNumber: await manualRuleNumberFor(ctx.db, ctx.companyId, candidates),
      };
    }),

  publish: protectedProcedure
    .input(z.object({
      deliverableId: z.string().uuid(),
      platform: z.enum(["twitter", "linkedin", "wordpress"]),
    }))
    .mutation(async ({ ctx, input }) => {
      assertNotDemo("Publishing to a platform");
      // Load the deliverable
      const deliverable = await ctx.db.query.deliverables.findFirst({
        where: and(eq(deliverables.id, input.deliverableId), eq(deliverables.companyId, ctx.companyId)),
      });

      if (!deliverable) throw new Error("Deliverable not found");
      if (deliverable.status !== "accepted") {
        throw new Error("Only accepted deliverables can be published");
      }

      // Load the platform connector
      const connector = await ctx.db.query.connectors.findFirst({
        where: and(
          eq(connectors.companyId, ctx.companyId),
          eq(connectors.platform, input.platform),
          eq(connectors.status, "connected"),
        ),
      });

      if (!connector) {
        throw new Error(`No connected ${input.platform} account. Connect it in Settings.`);
      }

      // Check token expiry
      if (connector.tokenExpiresAt && connector.tokenExpiresAt < new Date()) {
        throw new Error(`${input.platform} token expired. Please reconnect in Settings.`);
      }

      // Publish via platform API
      const result = await publishToPlatform(input.platform, {
        title: deliverable.title,
        content: deliverable.content as Record<string, unknown>,
        deliverableType: deliverable.deliverableType,
      }, {
        platform: connector.platform,
        accessTokenEnc: connector.accessTokenEnc,
        refreshTokenEnc: connector.refreshTokenEnc,
        metadata: (connector.metadata ?? {}) as Record<string, unknown>,
      });

      // Update deliverable with published URL
      await ctx.db.update(deliverables).set({
        status: "published",
        publishedUrl: result.url,
        publishedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(deliverables.id, input.deliverableId));

      // Log the publish action
      await ctx.db.insert(activityLog).values({
        companyId: ctx.companyId,
        aiEmployeeId: deliverable.aiEmployeeId,
        actionType: "deliverable_published",
        actionDetail: {
          deliverableId: deliverable.id,
          platform: input.platform,
          publishedUrl: result.url,
          platformPostId: result.platformPostId,
        },
      });

      return { publishedUrl: result.url };
    }),

  requestRevision: demoAllowedProcedure
    .input(z.object({
      deliverableId: z.string().uuid(),
      chips: z.array(z.string()).default([]),
      feedbackText: z.string().optional(),
      originalText: z.string().optional(),
      editedText: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const reviewId = crypto.randomUUID();
      const target = await resolveReviewTarget(ctx.db, {
        deliverableId: input.deliverableId,
        companyId: ctx.companyId,
        demoSessionId: ctx.demoSessionId,
        reviewableStatuses: ["in_review", "revised"],
      });
      const isDemoClone = target.supersedesDeliverableId !== null;

      const [updated] = await ctx.db
        .update(deliverables)
        .set({ status: "revised", updatedAt: new Date() })
        .where(and(
          eq(deliverables.id, target.id),
          eq(deliverables.companyId, ctx.companyId),
          inArray(deliverables.status, ["in_review", "revised"]),
        ))
        .returning();

      if (!updated) return;

      // Fetch task context for extraction
      const task = await ctx.db.query.tasks.findFirst({
        where: eq(tasks.id, updated.taskId),
        columns: { id: true, title: true, taskType: true },
      });

      if (!task) return;

      // Mark the task as revising so the loop shows it back with the agent;
      // a clone's task is shared seed state and stays put.
      if (!isDemoClone) {
        await ctx.db.update(tasks).set({ status: "revising" }).where(eq(tasks.id, task.id));
      }

      if (!ctx.demoSessionId) {
        extractFromTaskCompletion({
          agentId: updated.aiEmployeeId,
          tenantId: ctx.companyId,
          taskId: task.id,
          taskType: task.taskType,
          taskTitle: task.title,
          outputText: input.originalText ?? "",
          status: "revision",
        }).catch((err) => {
          console.error("Task completion extraction failed:", err);
        });
      }

      // Signal accumulation is awaited so the response carries the candidates
      let candidates: CandidateResult[] = [];
      let diff: WordDiff | null = null;
      if (input.chips.length > 0 || input.feedbackText || input.editedText || input.originalText) {
        try {
          const feedback = await extractFromFeedback({
            agentId: updated.aiEmployeeId,
            tenantId: ctx.companyId,
            taskId: task.id,
            taskType: task.taskType,
            originalText: input.originalText ?? "",
            editedText: input.editedText,
            chips: input.chips,
            annotationText: input.feedbackText,
            reviewId,
            demoSessionId: ctx.demoSessionId,
          });
          candidates = feedback.candidates;
          diff = feedback.diff;
        } catch (err) {
          // Revision request already committed; learning is skipped, not the review
          console.error("Signal accumulation failed on requestRevision:", err);
        }
      }

      return {
        deliverableId: updated.id,
        candidates,
        diff,
        manualRuleNumber: await manualRuleNumberFor(ctx.db, ctx.companyId, candidates),
      };
    }),

  reject: protectedProcedure
    .input(z.object({
      deliverableId: z.string().uuid(),
      reason: z.string().trim().min(10, "Tell the agent why so the rule sticks."),
      originalText: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.deliverables.findFirst({
        where: and(
          eq(deliverables.id, input.deliverableId),
          eq(deliverables.companyId, ctx.companyId),
        ),
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Deliverable not found" });
      }

      const oldContent = (existing.content as Record<string, unknown>) ?? {};
      const newContent = { ...oldContent, rejectionReason: input.reason };

      const [updated] = await ctx.db
        .update(deliverables)
        .set({
          status: "rejected",
          approvalRationale: input.reason,
          content: newContent,
          updatedAt: new Date(),
        })
        .where(and(
          eq(deliverables.id, input.deliverableId),
          eq(deliverables.companyId, ctx.companyId),
          inArray(deliverables.status, ["in_review", "revised"]),
        ))
        .returning();

      if (!updated) return;

      const task = await ctx.db.query.tasks.findFirst({
        where: eq(tasks.id, updated.taskId),
        columns: { id: true, title: true, taskType: true },
      });

      if (!task) return;

      await ctx.db.update(tasks).set({ status: "rejected" }).where(eq(tasks.id, task.id));

      await ctx.db.insert(activityLog).values({
        companyId: ctx.companyId,
        aiEmployeeId: updated.aiEmployeeId,
        actionType: "deliverable_rejected",
        actionDetail: {
          deliverableId: updated.id,
          deliverableTitle: updated.title,
          taskId: task.id,
          taskType: task.taskType,
          rejectionReason: input.reason,
        },
      });

      const completionPromise = extractFromTaskCompletion({
        agentId: updated.aiEmployeeId,
        tenantId: ctx.companyId,
        taskId: task.id,
        taskType: task.taskType,
        taskTitle: task.title,
        outputText: input.originalText ?? "",
        status: "rejected",
      });

      const rationalePromise = input.originalText
        ? extractRuleFromRationale({
            agentId: updated.aiEmployeeId,
            tenantId: ctx.companyId,
            taskId: task.id,
            taskType: task.taskType,
            rationale: `REJECTED: ${input.reason}`,
            outputText: input.originalText,
            reviewId: crypto.randomUUID(),
          })
        : Promise.resolve();

      Promise.all([completionPromise, rationalePromise]).catch((err) => {
        console.error("Extraction failed on reject:", err);
      });

      return { rejected: true };
    }),

  export: protectedProcedure
    .input(z.object({
      deliverableId: z.string().uuid(),
      format: z.enum(["markdown", "docx", "txt", "html"]),
    }))
    .mutation(async ({ ctx: _ctx, input: _input }) => {
      throw new Error("Not implemented");
    }),
});
