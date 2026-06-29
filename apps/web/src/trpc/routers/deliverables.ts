import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, inArray } from "drizzle-orm";
import { deliverables, deliverableVersions, tasks, checkIns, referralCodes, aiEmployees, companies } from "@beast/db";
import { generateShareSlug, generateReferralCode } from "@/lib/share/codes";
import {
  extractFromTaskCompletion,
  extractFromFeedback,
  extractRuleFromRationale,
  storeApprovedExample,
  advanceChain,
  publishToPlatform,
  recalculateGoalProgress,
} from "@beast/ai";
import type { SpawnPayload } from "@beast/ai";
import { tasks as triggerTasks } from "@trigger.dev/sdk";
import { connectors, activityLog } from "@beast/db";
import { createTRPCRouter, protectedProcedure, assertNotDemo } from "../init";

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

async function triggerExecuteTask(payload: SpawnPayload): Promise<{ id: string }> {
  const handle = await triggerTasks.trigger("execute-task", payload);
  return { id: handle.id };
}

const DELIVERABLE_STATUSES = ["draft", "review", "revision", "approved", "published"] as const;

export const deliverablesRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({
      employeeId: z.string().uuid().optional(),
      status: z.enum(DELIVERABLE_STATUSES).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const conditions = [eq(deliverables.companyId, ctx.companyId)];
      if (input.employeeId) {
        conditions.push(eq(deliverables.aiEmployeeId, input.employeeId));
      }
      if (input.status) {
        conditions.push(eq(deliverables.status, input.status));
      }
      return ctx.db.query.deliverables.findMany({
        where: and(...conditions),
        orderBy: (d, { desc }) => [desc(d.createdAt)],
      });
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.deliverables.findFirst({
        where: and(eq(deliverables.id, input.id), eq(deliverables.companyId, ctx.companyId)),
      });
    }),

  getVersions: protectedProcedure
    .input(z.object({ deliverableId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // deliverable_versions has no company_id of its own, so verify the
      // parent deliverable belongs to the caller before returning history.
      const owner = await ctx.db.query.deliverables.findFirst({
        where: and(eq(deliverables.id, input.deliverableId), eq(deliverables.companyId, ctx.companyId)),
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
    return ctx.db.query.deliverables.findMany({
      where: and(
        eq(deliverables.companyId, ctx.companyId),
        eq(deliverables.status, "auto_publishing"),
      ),
      columns: {
        id: true,
        title: true,
        deliverableType: true,
        publishAfter: true,
        aiEmployeeId: true,
        approvedAt: true,
      },
      orderBy: (d, { asc }) => [asc(d.publishAfter)],
    });
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
          eq(deliverables.status, "approved"),
        ))
        .returning({ id: deliverables.id, publishAfter: deliverables.publishAfter });

      if (!updated) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Deliverable must be in approved status before queueing",
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
   * Cancel a scheduled auto-publish. Reverts to approved so the founder
   * can publish manually or queue again with a different delay.
   */
  cancelAutoPublish: protectedProcedure
    .input(z.object({ deliverableId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(deliverables)
        .set({
          status: "approved",
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

  approve: protectedProcedure
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

      const [updated] = await ctx.db
        .update(deliverables)
        .set({
          status: "approved",
          approvalRationale: rationale,
          approvedAt,
          updatedAt: approvedAt,
        })
        .where(and(
          eq(deliverables.id, input.deliverableId),
          eq(deliverables.companyId, ctx.companyId),
          inArray(deliverables.status, ["draft", "pending_review", "review", "revision"]),
        ))
        .returning();

      if (!updated) return;

      // Fetch task context for extraction + chain detection + goal tracking
      const task = await ctx.db.query.tasks.findFirst({
        where: eq(tasks.id, updated.taskId),
        columns: { id: true, title: true, taskType: true, parentTaskId: true, goalId: true },
      });

      if (!task) return;

      // Mark the task itself as approved
      await ctx.db.update(tasks).set({ status: "approved" }).where(eq(tasks.id, task.id));

      await ctx.db.insert(activityLog).values({
        companyId: ctx.companyId,
        aiEmployeeId: updated.aiEmployeeId,
        actionType: "deliverable_approved",
        actionDetail: {
          deliverableId: updated.id,
          deliverableTitle: updated.title,
          taskId: task.id,
          taskType: task.taskType,
          approvalRationale: rationale,
          chips: input.chips,
          approvedWithoutEdits: input.approvedWithoutEdits,
        },
      });

      // Chain advancement: if this task has a parent, advance the chain
      if (task.parentTaskId) {
        advanceChain(task.parentTaskId, triggerExecuteTask).catch((err) => {
          console.error("Chain advancement failed on deliverable approve:", err);
        });
      }

      // Goal progress: recalculate if task is linked to a goal
      if (task.goalId) {
        recalculateGoalProgress(task.goalId, ctx.companyId).catch((err) => {
          console.error("Goal progress recalculation failed:", err);
        });
      }

      // Fire extraction async - don't block the user
      const extractionPromise = extractFromTaskCompletion({
        agentId: updated.aiEmployeeId,
        tenantId: ctx.companyId,
        taskId: task.id,
        taskType: task.taskType,
        taskTitle: task.title,
        outputText: input.originalText ?? "",
        status: "approved",
      });

      // If approved without edits, store as canonical example for few-shot calibration
      const calibrationPromise = input.approvedWithoutEdits && input.originalText
        ? storeApprovedExample({
            agentId: updated.aiEmployeeId,
            tenantId: ctx.companyId,
            taskType: task.taskType,
            taskTitle: task.title,
            outputText: input.originalText,
            taskId: task.id,
          })
        : Promise.resolve();

      // If approved WITH feedback (chips or text or edits), extract signals.
      // editedText carries the founder's revisions so extractFromFeedback can
      // diff agent output -> final, the same shape used for RLHF chip flow.
      const feedbackPromise = (input.chips.length > 0 || input.feedbackText || input.editedText)
        ? extractFromFeedback({
            agentId: updated.aiEmployeeId,
            tenantId: ctx.companyId,
            taskId: task.id,
            taskType: task.taskType,
            originalText: input.originalText ?? "",
            editedText: input.editedText,
            chips: input.chips,
            annotationText: input.feedbackText,
          })
        : Promise.resolve();

      // Founder rationale -> high-signal-weight rule candidate
      const rationalePromise = rationale && input.originalText
        ? extractRuleFromRationale({
            agentId: updated.aiEmployeeId,
            tenantId: ctx.companyId,
            taskId: task.id,
            taskType: task.taskType,
            rationale,
            outputText: input.originalText,
          })
        : Promise.resolve();

      // Await all extractions but don't let failures block the response
      Promise.all([extractionPromise, calibrationPromise, feedbackPromise, rationalePromise]).catch((err) => {
        console.error("Extraction failed on approve:", err);
      });

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

      const [checkInRow] = await ctx.db.insert(checkIns).values({
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

      return {
        checkInId: checkInRow?.id,
        scheduledFor: scheduledFor.toISOString(),
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
      if (deliverable.status !== "approved") {
        throw new Error("Only approved deliverables can be published");
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

  requestRevision: protectedProcedure
    .input(z.object({
      deliverableId: z.string().uuid(),
      chips: z.array(z.string()).default([]),
      feedbackText: z.string().optional(),
      originalText: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(deliverables)
        .set({ status: "revision", updatedAt: new Date() })
        .where(and(
          eq(deliverables.id, input.deliverableId),
          eq(deliverables.companyId, ctx.companyId),
          inArray(deliverables.status, ["draft", "pending_review", "review", "revision"]),
        ))
        .returning();

      if (!updated) return;

      // Fetch task context for extraction
      const task = await ctx.db.query.tasks.findFirst({
        where: eq(tasks.id, updated.taskId),
        columns: { id: true, title: true, taskType: true },
      });

      if (!task) return;

      // Extract feedback signals - this is where CIPHER-style learning happens
      if (input.chips.length > 0 || input.feedbackText || input.originalText) {
        extractFromFeedback({
          agentId: updated.aiEmployeeId,
          tenantId: ctx.companyId,
          taskId: task.id,
          taskType: task.taskType,
          originalText: input.originalText ?? "",
          chips: input.chips,
          annotationText: input.feedbackText,
        }).catch((err) => {
          console.error("Extraction failed on requestRevision:", err);
        });
      }

      // Also record this as a task completion with "revision" status
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
          inArray(deliverables.status, ["draft", "pending_review", "review", "revision"]),
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

  /**
   * Generate (or return existing) share slug + referral code for a deliverable.
   * Idempotent: re-sharing the same deliverable returns the original slug + the
   * deliverable's most-recent referral code rather than minting new ones.
   * spec.
   */
  share: protectedProcedure
    .input(z.object({ deliverableId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const deliverable = await ctx.db.query.deliverables.findFirst({
        where: and(
          eq(deliverables.id, input.deliverableId),
          eq(deliverables.companyId, ctx.companyId),
        ),
        columns: {
          id: true,
          aiEmployeeId: true,
          shareSlug: true,
          shareEnabledAt: true,
          content: true,
        },
      });
      if (!deliverable) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Deliverable not found" });
      }

      // Idempotent path: already shared, return existing slug + most-recent code.
      if (deliverable.shareSlug && deliverable.shareEnabledAt) {
        const existingCode = await ctx.db.query.referralCodes.findFirst({
          where: and(
            eq(referralCodes.companyId, ctx.companyId),
            eq(referralCodes.sourceDeliverableId, deliverable.id),
          ),
          orderBy: (rc, { desc }) => [desc(rc.createdAt)],
          columns: { code: true },
        });
        if (existingCode) {
          return { shareSlug: deliverable.shareSlug, referralCode: existingCode.code };
        }
        // Fall through to mint a new code if none exists (e.g. deliverable was
        // marked shared by a separate path with no referral_codes row).
      }

      const employee = await ctx.db.query.aiEmployees.findFirst({
        where: eq(aiEmployees.id, deliverable.aiEmployeeId),
        columns: { name: true },
      });

      // Mint slug + code. The slug column has a UNIQUE constraint; a collision
      // here would surface as a Postgres error and bubble to the client.
      // 12-char URL-safe slug at 62^12 entropy makes that vanishingly unlikely.
      const shareSlug = deliverable.shareSlug ?? generateShareSlug();
      const referralCode = generateReferralCode(employee?.name ?? "beast");

      await ctx.db.transaction(async (tx) => {
        if (!deliverable.shareSlug) {
          // Snapshot content at share time: later edits or
          // rejections must NOT change what the public URL serves.
          await tx
            .update(deliverables)
            .set({
              shareSlug,
              shareEnabledAt: new Date(),
              shareSnapshot: deliverable.content,
            })
            .where(eq(deliverables.id, deliverable.id));
        }
        await tx.insert(referralCodes).values({
          code: referralCode,
          companyId: ctx.companyId,
          sourceDeliverableId: deliverable.id,
        });
      });

      return { shareSlug, referralCode };
    }),

  /**
   * Revoke a public share link. Clears shareEnabledAt so both the SSR page and
   * the public share.get (which require shareEnabledAt IS NOT NULL) stop serving
   * it. The slug + snapshot are kept so a later re-share is idempotent.
   */
  unshare: protectedProcedure
    .input(z.object({ deliverableId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db
        .update(deliverables)
        .set({ shareEnabledAt: null })
        .where(and(
          eq(deliverables.id, input.deliverableId),
          eq(deliverables.companyId, ctx.companyId),
        ))
        .returning({ id: deliverables.id });
      if (result.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Deliverable not found" });
      }
      return { ok: true };
    }),
});
