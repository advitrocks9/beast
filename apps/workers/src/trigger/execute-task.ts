import { task, streams, tasks as triggerTasks } from "@trigger.dev/sdk";
import { run, loadMemories, createToolsForRole, getPersona, advanceChain, checkForCollaboration } from "@beast/ai";
import type { AgentConfig, AgentEvent, TaskPlan, SpawnPayload } from "@beast/ai";
import type { AGUIEvent } from "@beast/shared";
import { db, deliverables, tasks, proceduralMemories, agentRunEvents } from "@beast/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { AGENT_EVENT_STREAM_KEY } from "../streams";

async function triggerExecuteTask(payload: SpawnPayload): Promise<{ id: string }> {
  const handle = await triggerTasks.trigger("execute-task", payload);
  return { id: handle.id };
}

interface ExecuteTaskPayload {
  agentId: string;
  tenantId: string;
  agentName: string;
  roleType: "marketing" | "sales" | "support";
  companyName: string;
  task: {
    taskId: string;
    title: string;
    objective: string;
    taskType: string;
    brief: Record<string, unknown>;
    acceptanceCriteria?: string[];
  };
  planSteps?: string[];
}

/**
 * Maps task types to deliverable types for auto-creation.
 */
const TASK_TO_DELIVERABLE_TYPE: Record<string, string> = {
  "write-blog-post": "blog",
  "create-social-post": "social_twitter",
  "draft-newsletter": "email",
  "draft-outreach-email": "email",
  "create-email-sequence": "email",
  "draft-ticket-response": "custom",
  "write-faq-article": "faq",
  "custom": "custom",
};

function resolveDeliverableType(taskType: string, brief: Record<string, unknown>): string {
  if (taskType === "create-social-post") {
    return brief.platform === "linkedin" ? "social_linkedin" : "social_twitter";
  }
  return TASK_TO_DELIVERABLE_TYPE[taskType] ?? "custom";
}

function parseOutputContent(output: string): Record<string, unknown> {
  try {
    const cleaned = output.replace(/^```json?\s*/i, "").replace(/\s*```$/, "");
    const parsed = JSON.parse(cleaned);
    if (typeof parsed === "object" && parsed !== null) return parsed;
  } catch { /* not JSON */ }
  return { text: output };
}

function toAGUIEvent(event: AgentEvent): AGUIEvent | null {
  switch (event.type) {
    case "run_start":
      return { type: "RUN_START", taskId: event.taskId, agentName: event.agentName };
    case "text_delta":
      return { type: "TEXT_MESSAGE_CONTENT", delta: event.text };
    case "tool_call_start":
      return { type: "TOOL_CALL_START", toolName: event.toolName, toolCallId: event.toolCallId };
    case "tool_call_end":
      return { type: "TOOL_CALL_RESULT", toolCallId: event.toolCallId, toolName: event.toolName, result: event.result };
    case "scratchpad_update":
      return { type: "SCRATCHPAD_UPDATE", items: event.items };
    case "iteration":
      return { type: "ITERATION", number: event.number, totalTokens: event.totalTokens };
    case "error":
      return { type: "TASK_ERROR", error: event.message, recoverable: event.recoverable };
    case "run_end":
      return { type: "TASK_COMPLETE", output: event.output, iterations: event.iterations, durationMs: event.durationMs };
    default:
      return null;
  }
}

export const executeTaskJob = task({
  id: "execute-task",
  run: async (payload: ExecuteTaskPayload) => {
    const tools = createToolsForRole(payload.roleType, payload.tenantId);

    const memories = await loadMemories({
      agentId: payload.agentId,
      tenantId: payload.tenantId,
      query: `${payload.task.title} ${payload.task.objective}`,
      taskType: payload.task.taskType,
    });

    const config: AgentConfig = {
      agentId: payload.agentId,
      tenantId: payload.tenantId,
      name: payload.agentName,
      roleType: payload.roleType,
      persona: getPersona(payload.roleType, payload.companyName),
    };

    // Create a push-based ReadableStream for AG-UI events
    let pushEvent: (event: AGUIEvent) => void = () => {};
    let closeStream: () => void = () => {};

    const readable = new ReadableStream<AGUIEvent>({
      start(controller) {
        pushEvent = (event) => {
          try { controller.enqueue(event); } catch { /* closed */ }
        };
        closeStream = () => {
          try { controller.close(); } catch { /* already closed */ }
        };
      },
    });

    // Pipe to Trigger.dev Realtime with a string key
    const { waitUntilComplete } = streams.pipe(AGENT_EVENT_STREAM_KEY, readable);

    // Lifecycle subset persisted to agent_run_events. text_delta and
    // iteration are excluded - too high frequency for postgres - but the
    // tool-call frame and run boundaries give /dashboard/tasks/[id] and
    // ChatPanel a real "what happened" feed without subscribing to the
    // realtime stream.
    const PERSIST_EVENT_TYPES = new Set<AgentEvent["type"]>([
      "run_start",
      "tool_call_start",
      "tool_call_end",
      "scratchpad_update",
      "error",
      "run_end",
    ]);

    let result;
    try {
      result = await run({
        config,
        task: payload.task,
        tools,
        memories,
        planSteps: payload.planSteps,
        onEvent: (event) => {
          const aguiEvent = toAGUIEvent(event);
          if (aguiEvent) pushEvent(aguiEvent);
          if (PERSIST_EVENT_TYPES.has(event.type)) {
            db.insert(agentRunEvents).values({
              companyId: payload.tenantId,
              taskId: payload.task.taskId,
              eventType: event.type,
              payload: event as Record<string, unknown>,
            }).catch((err) => {
              console.error("[agentRunEvents] insert failed", { event: event.type, err });
            });
          }
        },
      });
    } catch (err) {
      closeStream();
      await waitUntilComplete();

      // Mark task as cancelled on agent failure, but only if it is still
      // in a non-terminal state. A Trigger.dev retry of an already-shipped
      // run (status flipped to "review" or "approved" by a prior attempt
      // that succeeded enough to write the deliverable) must not regress
      // the task to "cancelled". Guards against both retry races and the
      // parent cascade overwriting an already-approved chain root.
      await db.update(tasks).set({
        status: "cancelled",
        completedAt: new Date(),
      }).where(and(
        eq(tasks.id, payload.task.taskId),
        inArray(tasks.status, ["queued", "working", "in_progress"]),
      ));

      // If chain child, cascade failure to parent
      const planStepId = (payload.task.brief as Record<string, unknown>)?._planStepId as string | undefined;
      if (planStepId) {
        const thisTask = await db.query.tasks.findFirst({
          where: eq(tasks.id, payload.task.taskId),
          columns: { parentTaskId: true },
        });
        if (thisTask?.parentTaskId) {
          await db.update(tasks).set({
            status: "cancelled",
            completedAt: new Date(),
          }).where(and(
            eq(tasks.id, thisTask.parentTaskId),
            inArray(tasks.status, ["queued", "working", "in_progress"]),
          ));
        }
      }

      throw err;
    }

    closeStream();
    await waitUntilComplete();

    // ── Create deliverable from agent output ──
    const deliverableType = resolveDeliverableType(payload.task.taskType, payload.task.brief);
    const baseContent = parseOutputContent(result.output);
    // Merge the reasoning-trail and the applied procedural-rule
    // trace onto the deliverable content. The review page reads
    // deliverable.content.trail for the "Alex read N pages, ran M searches" pill
    // and deliverable.content.appliedRules for the "Alex remembered" panel.
    const content = {
      ...baseContent,
      trail: result.toolCalls,
      appliedRules: result.appliedRules,
      citations: result.citations,
    };

    // Dedupe against Trigger.dev retry: if a prior attempt of this task
    // succeeded through streamRun and inserted a deliverable but threw in
    // the post-stream code (status update, chain advance, slack dispatch),
    // Trigger.dev retries the whole task. Without this guard, attempt 2
    // would insert a second deliverable with a fresh non-deterministic
    // run output, surfacing two rows in /reviews for one task.
    const existingDeliverable = await db.query.deliverables.findFirst({
      where: eq(deliverables.taskId, payload.task.taskId),
      columns: { id: true, status: true },
    });

    let deliverable: { id: string } | undefined;
    if (existingDeliverable && existingDeliverable.status === "review") {
      // Pre-judgment row from a prior attempt; replace its content with
      // this attempt's output. Version stays 1 (founder hasn't judged,
      // no audit trail to preserve).
      await db.update(deliverables).set({
        content,
        renderedPreview: result.output.slice(0, 5000),
        updatedAt: new Date(),
      }).where(eq(deliverables.id, existingDeliverable.id));
      deliverable = { id: existingDeliverable.id };
    } else if (existingDeliverable) {
      // Already approved/published/rejected by founder or chain auto-advance;
      // do not overwrite. The retry's output is discarded. The downstream
      // code keys off this id so the slack/collaboration paths still fire.
      deliverable = { id: existingDeliverable.id };
    } else {
      const inserted = await db.insert(deliverables).values({
        taskId: payload.task.taskId,
        companyId: payload.tenantId,
        aiEmployeeId: payload.agentId,
        deliverableType,
        title: payload.task.title,
        content,
        renderedPreview: result.output.slice(0, 5000),
        version: 1,
        status: "review",
      }).returning({ id: deliverables.id });
      deliverable = inserted[0];
    }

    // Bump the per-rule application counter so the dashboard "used in N
    // deliverables" label reflects real usage. Single
    // UPDATE keyed by ruleId; legacy rows without a counter will
    // undercount but converge as the agent runs.
    const ruleIds = result.appliedRules.map((r) => r.ruleId).filter(Boolean);
    if (ruleIds.length > 0) {
      await db
        .update(proceduralMemories)
        .set({ tasksAppliedTo: sql`${proceduralMemories.tasksAppliedTo} + 1` })
        .where(inArray(proceduralMemories.id, ruleIds))
        .catch((err) => {
          console.error("applied-rules counter bump failed:", err);
        });
    }

    // ── Update task status ──
    await db.update(tasks).set({
      status: "review",
      completedAt: new Date(),
    }).where(eq(tasks.id, payload.task.taskId));

    // ── Chain advancement: if this is a child task in a multi-step chain ──
    const planStepId = (payload.task.brief as Record<string, unknown>)?._planStepId as string | undefined;
    if (planStepId) {
      const thisTask = await db.query.tasks.findFirst({
        where: eq(tasks.id, payload.task.taskId),
        columns: { parentTaskId: true },
      });

      if (thisTask?.parentTaskId) {
        const parent = await db.query.tasks.findFirst({
          where: eq(tasks.id, thisTask.parentTaskId),
        });

        if (parent?.plan) {
          const plan = parent.plan as unknown as TaskPlan;
          const step = plan.steps.find((s) => s.stepId === planStepId);

          // Update parent's stepDeliverableMap
          if (deliverable?.id) {
            const updatedPlan: TaskPlan = {
              ...plan,
              stepDeliverableMap: { ...plan.stepDeliverableMap, [planStepId]: deliverable.id },
            };
            await db.update(tasks).set({
              plan: updatedPlan as unknown as Record<string, unknown>,
            }).where(eq(tasks.id, thisTask.parentTaskId));
          }

          // If no human gate on this step, auto-approve and advance.
          // Flip the deliverable to approved alongside the task so the
          // /reviews pending list (which filters draft|pending_review|review)
          // does not surface this chain by-product. The founder opted out
          // of review by leaving humanGate false on the step; we honor
          // that policy decision at the deliverable layer too.
          if (step && !step.humanGate) {
            const autoApprovedAt = new Date();
            await db.update(tasks).set({ status: "approved" })
              .where(eq(tasks.id, payload.task.taskId));

            if (deliverable?.id) {
              await db.update(deliverables).set({
                status: "approved",
                approvedAt: autoApprovedAt,
                updatedAt: autoApprovedAt,
              }).where(eq(deliverables.id, deliverable.id));
            }

            await advanceChain(thisTask.parentTaskId, triggerExecuteTask).catch((advErr) => {
              console.error("Chain advancement failed:", advErr);
            });
          }
        }
      }
    }

    // ── Slack notification: review request (fire-and-forget) ──
    triggerTasks.trigger("slack-notify", {
      type: "review_request",
      companyId: payload.tenantId,
      employeeName: payload.agentName,
      deliverableTitle: payload.task.title,
      deliverableType: deliverableType,
      deliverableId: deliverable?.id ?? "",
      version: 1,
    }).catch((err) => {
      console.error("[Slack] Failed to dispatch notification:", err);
    });

    // ── Collaboration check: could this deliverable help another employee? ──
    if (deliverable?.id) {
      checkForCollaboration({
        employeeId: payload.agentId,
        companyId: payload.tenantId,
        deliverableId: deliverable.id,
        deliverableTitle: payload.task.title,
        deliverableType: deliverableType,
        taskType: payload.task.taskType,
      }).catch((err) => {
        console.error("Collaboration check failed:", err);
      });
    }

    // Episode extraction runs from deliverables.approve / requestRevision /
    // reject so the episode reflects the founder's terminal verdict. The
    // pre-judgment fire that used to live here wrote status="approved"
    // before the deliverable had ever been seen, which polluted the
    // consolidation cluster (a later reject path produced a second
    // contradictory episode for the same task).

    return {
      output: result.output,
      deliverableId: deliverable?.id,
      iterations: result.iterations,
      durationMs: result.durationMs,
      tokensUsed: result.tokensUsed,
      toolCalls: result.toolCalls,
    };
  },
});
