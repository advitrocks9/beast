import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, gt, desc } from "drizzle-orm";
import { chatMessages, agentRunEvents, tasks, deliverables, aiEmployees } from "@beast/db";
import { extractRuleFromRationale } from "@beast/ai";
import { createTRPCRouter, protectedProcedure } from "../init";

const ROLES = ["user", "assistant"] as const;

const MAX_COMMENT_CHARS = 4000;
const MIN_EXTRACTION_CHARS = 30;

export const chatRouter = createTRPCRouter({
  /**
   * Recent chat history with one AI employee. Tenant + employee scoped.
   * Returned chronologically so the panel can render top-to-bottom.
   */
  list: protectedProcedure
    .input(z.object({
      employeeId: z.string().uuid(),
      limit: z.number().int().min(1).max(200).default(50),
    }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.query.chatMessages.findMany({
        where: and(
          eq(chatMessages.companyId, ctx.companyId),
          eq(chatMessages.aiEmployeeId, input.employeeId),
        ),
        orderBy: [asc(chatMessages.createdAt)],
        limit: input.limit,
      });
      return rows;
    }),

  /**
   * Lifecycle events persisted during a task run. Polled by the chat
   * panel and per-task surface to render a "what's happening" feed
   * while the agent is working. Filtered to the current company via
   * the task ownership join.
   */
  runEvents: protectedProcedure
    .input(z.object({
      taskId: z.string().uuid(),
      sinceMs: z.number().int().min(0).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const ownsTask = await ctx.db.query.tasks.findFirst({
        where: and(eq(tasks.id, input.taskId), eq(tasks.companyId, ctx.companyId)),
        columns: { id: true },
      });
      if (!ownsTask) return [];

      const since = input.sinceMs ? new Date(input.sinceMs) : null;
      const conditions = [eq(agentRunEvents.taskId, input.taskId)];
      if (since) conditions.push(gt(agentRunEvents.createdAt, since));

      return ctx.db.query.agentRunEvents.findMany({
        where: and(...conditions),
        orderBy: [asc(agentRunEvents.createdAt)],
        limit: 200,
      });
    }),

  /**
   * Comments on a specific task. Reuses chat_messages with taskId set;
   * the per-task surface lists this thread separately from the
   * employee-level chat. Tenant + task-ownership scoped.
   */
  listByTask: protectedProcedure
    .input(z.object({ taskId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const ownsTask = await ctx.db.query.tasks.findFirst({
        where: and(eq(tasks.id, input.taskId), eq(tasks.companyId, ctx.companyId)),
        columns: { id: true },
      });
      if (!ownsTask) return [];
      return ctx.db.query.chatMessages.findMany({
        where: and(
          eq(chatMessages.companyId, ctx.companyId),
          eq(chatMessages.taskId, input.taskId),
        ),
        orderBy: [asc(chatMessages.createdAt)],
        limit: 200,
      });
    }),

  /**
   * Founder posts a comment on a task. The agent run is single-shot via
   * execute-task, so this does not interrupt an in-flight run; the
   * comment lands as a durable artifact for re-runs and audit trail.
   */
  commentOnTask: protectedProcedure
    .input(z.object({
      taskId: z.string().uuid(),
      content: z.string().min(1).max(MAX_COMMENT_CHARS),
    }))
    .mutation(async ({ ctx, input }) => {
      const t = await ctx.db.query.tasks.findFirst({
        where: and(eq(tasks.id, input.taskId), eq(tasks.companyId, ctx.companyId)),
        columns: { id: true, aiEmployeeId: true, taskType: true },
      });
      if (!t) throw new Error("Task not found");

      const [row] = await ctx.db.insert(chatMessages).values({
        companyId: ctx.companyId,
        aiEmployeeId: t.aiEmployeeId,
        role: "user",
        content: input.content,
        taskId: t.id,
      }).returning();
      if (!row) throw new Error("Failed to insert comment");

      // High-signal comments seed procedural memory at signalWeight 1.5.
      // Best-effort: pull the latest deliverable's rendered text as the
      // grounding output, then fire extraction async so the response stays
      // snappy. Below the threshold, skip the LLM call entirely.
      if (input.content.trim().length >= MIN_EXTRACTION_CHARS) {
        void (async () => {
          try {
            const latestDeliverable = await ctx.db.query.deliverables.findFirst({
              where: and(
                eq(deliverables.taskId, t.id),
                eq(deliverables.companyId, ctx.companyId),
              ),
              columns: { renderedPreview: true, content: true },
              orderBy: [desc(deliverables.version)],
            });

            const outputText = (() => {
              if (!latestDeliverable) return "";
              if (latestDeliverable.renderedPreview) return latestDeliverable.renderedPreview;
              const c = latestDeliverable.content as Record<string, unknown> | null;
              if (c) {
                for (const k of ["editedText", "content", "body", "response"]) {
                  const v = c[k];
                  if (typeof v === "string" && v.length > 0) return v;
                }
              }
              return "";
            })();

            await extractRuleFromRationale({
              agentId: t.aiEmployeeId,
              tenantId: ctx.companyId,
              taskId: t.id,
              taskType: t.taskType,
              rationale: input.content,
              outputText,
            });
          } catch (err) {
            console.error("[chat.commentOnTask] rule extraction failed:", err);
          }
        })();
      }

      return row;
    }),

  /**
   * Persist a single message turn. Both the founder's input and the
   * assistant ack are appended via this mutation; ChatPanel calls it
   * twice per submit.
   */
  append: protectedProcedure
    .input(z.object({
      employeeId: z.string().uuid(),
      role: z.enum(ROLES),
      content: z.string().min(1).max(8000),
      taskId: z.string().uuid().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify the referenced employee (and task, when present) belong to this
      // company so a message can't dangle a reference to another tenant's rows.
      const employee = await ctx.db.query.aiEmployees.findFirst({
        where: and(eq(aiEmployees.id, input.employeeId), eq(aiEmployees.companyId, ctx.companyId)),
        columns: { id: true },
      });
      if (!employee) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
      }
      if (input.taskId) {
        const task = await ctx.db.query.tasks.findFirst({
          where: and(eq(tasks.id, input.taskId), eq(tasks.companyId, ctx.companyId)),
          columns: { id: true },
        });
        if (!task) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });
        }
      }
      const [row] = await ctx.db.insert(chatMessages).values({
        companyId: ctx.companyId,
        aiEmployeeId: input.employeeId,
        role: input.role,
        content: input.content,
        taskId: input.taskId,
      }).returning();
      return row;
    }),
});
