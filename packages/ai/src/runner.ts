import { and, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  tasks,
  deliverables,
  proceduralMemories,
  agentRunEvents,
  aiEmployees,
  companies,
  activityLog,
} from "@beast/db";
import { EMPLOYEE_ROLES, type EmployeeRole } from "@beast/shared";
import { env } from "@beast/shared/env";
import { run } from "./agent";
import type { AgentConfig, AgentEvent, AgentEventHandler } from "./types";
import { loadMemories } from "./memory";
import { createToolsForRole } from "./tools/index";
import { getPersona } from "./employees";
import { advanceChain } from "./chains";
import type { SpawnPayload, TaskPlan } from "./chains";
import { checkForCollaboration } from "./collaboration";
import { createStubProvider, resolveProvider, ProviderQuotaError } from "./provider";
import type { RunProvider } from "./provider";

export type TriggerExecuteTask = (payload: SpawnPayload) => Promise<{ id: string }>;

export interface ReviewNotifyPayload {
  type: "review_request";
  companyId: string;
  employeeName: string;
  deliverableTitle: string;
  deliverableType: string;
  deliverableId: string;
  version: number;
}

// Serverless hosts freeze a function once its response is sent; the web app
// injects waitUntil-style scheduling so in-process runs survive the response.
let backgroundScheduler: ((work: Promise<unknown>) => void) | null = null;

export function setBackgroundScheduler(schedule: (work: Promise<unknown>) => void): void {
  backgroundScheduler = schedule;
}

export interface ExecuteTaskRunOptions {
  onEvent?: AgentEventHandler;
  /** Spawns chain children; defaults to an in-process dispatchRun. */
  spawn?: TriggerExecuteTask;
  /** Dispatches the review-request Slack notification; absent in local/demo. */
  notify?: (payload: ReviewNotifyPayload) => Promise<unknown>;
}

export type ExecuteTaskRunResult =
  | { status: "skipped"; taskStatus: string }
  | { status: "timed_out"; durationMs: number }
  | {
      status: "completed";
      output: string;
      deliverableId: string | undefined;
      iterations: number;
      durationMs: number;
      tokensUsed: { input: number; output: number };
    };

type RunListener = (event: AgentEvent) => void;

// Single-instance only: subscribers live in module memory, so a stream served
// from another instance sees persisted-event catch-up + polling, never the bus.
const runListeners = new Map<string, Set<RunListener>>();
const activeRuns = new Set<string>();

export function subscribeToRun(taskId: string, listener: RunListener): () => void {
  const set = runListeners.get(taskId) ?? new Set<RunListener>();
  set.add(listener);
  runListeners.set(taskId, set);
  return () => {
    set.delete(listener);
    if (set.size === 0) runListeners.delete(taskId);
  };
}

export function isRunActiveInProcess(taskId: string): boolean {
  return activeRuns.has(taskId);
}

function emitToBus(taskId: string, event: AgentEvent): void {
  const set = runListeners.get(taskId);
  if (!set) return;
  for (const listener of set) {
    try {
      listener(event);
    } catch {
      // a broken subscriber must not touch the run
    }
  }
}

const TASK_TO_DELIVERABLE_TYPE: Record<string, string> = {
  "write-blog-post": "blog",
  "create-social-post": "social_twitter",
  "draft-newsletter": "email",
  "draft-outreach-email": "email",
  "create-email-sequence": "email",
  "draft-ticket-response": "custom",
  "write-faq-article": "faq",
  "report": "report",
  "email": "email",
  "blog": "blog",
  "faq": "faq",
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
    if (typeof parsed === "object" && parsed !== null) return parsed as Record<string, unknown>;
  } catch {
    // not JSON
  }
  return { text: output };
}

// text_delta and iteration are excluded - too high frequency for postgres -
// but the tool-call frame and run boundaries give the task page and replay
// stream a real "what happened" feed.
const PERSIST_EVENT_TYPES = new Set<AgentEvent["type"]>([
  "run_start",
  "tool_call_start",
  "tool_call_end",
  "scratchpad_update",
  "error",
  "run_end",
]);

interface RunContext {
  task: typeof tasks.$inferSelect;
  employee: { id: string; name: string; roleType: EmployeeRole };
  companyName: string;
  objective: string;
  brief: Record<string, unknown>;
}

async function loadRunContext(taskId: string): Promise<RunContext> {
  const task = await db.query.tasks.findFirst({ where: eq(tasks.id, taskId) });
  if (!task) throw new Error(`Task ${taskId} not found`);

  const [employee, company] = await Promise.all([
    db.query.aiEmployees.findFirst({
      where: eq(aiEmployees.id, task.aiEmployeeId),
      columns: { id: true, name: true, roleType: true },
    }),
    db.query.companies.findFirst({
      where: eq(companies.id, task.companyId),
      columns: { name: true },
    }),
  ]);
  if (!employee || !company) throw new Error(`Employee or company missing for task ${taskId}`);
  if (!(EMPLOYEE_ROLES as readonly string[]).includes(employee.roleType)) {
    throw new Error(`Task ${taskId} employee has unknown role "${employee.roleType}"`);
  }

  const brief = (task.brief as Record<string, unknown> | null) ?? {};
  const objective = typeof brief.objective === "string" ? brief.objective : task.title;

  return {
    task,
    employee: { id: employee.id, name: employee.name, roleType: employee.roleType as EmployeeRole },
    companyName: company.name,
    objective,
    brief,
  };
}

function toSpawnPayload(ctx: RunContext): SpawnPayload {
  return {
    agentId: ctx.employee.id,
    tenantId: ctx.task.companyId,
    agentName: ctx.employee.name,
    roleType: ctx.employee.roleType,
    companyName: ctx.companyName,
    task: {
      taskId: ctx.task.id,
      title: ctx.task.title,
      objective: ctx.objective,
      taskType: ctx.task.taskType,
      brief: ctx.brief,
    },
  };
}

async function cascadeFailureToParent(taskId: string, brief: Record<string, unknown>): Promise<void> {
  const planStepId = brief._planStepId as string | undefined;
  if (!planStepId) return;
  const thisTask = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
    columns: { parentTaskId: true },
  });
  if (!thisTask?.parentTaskId) return;
  await db.update(tasks).set({
    status: "failed",
    completedAt: new Date(),
  }).where(and(
    eq(tasks.id, thisTask.parentTaskId),
    inArray(tasks.status, ["queued", "running"]),
  ));
}

export async function executeTaskRun(
  taskId: string,
  opts: ExecuteTaskRunOptions = {},
): Promise<ExecuteTaskRunResult> {
  const ctx = await loadRunContext(taskId);

  // Idempotency: a redispatch or Trigger.dev retry must never re-run a task
  // the founder has already judged or cancelled. A prior attempt that only
  // reached in_review is re-run and its deliverable content replaced below.
  if (["accepted", "published", "cancelled"].includes(ctx.task.status)) {
    return { status: "skipped", taskStatus: ctx.task.status };
  }

  await db.update(tasks).set({ status: "running", startedAt: new Date() })
    .where(and(
      eq(tasks.id, taskId),
      inArray(tasks.status, ["queued", "failed", "timed_out"]),
    ));

  // Mutable: flips to "stub" when a quota error degrades the run, so the
  // rerun's run_start is stamped "stub" and the stream labels it SIMULATED.
  let providerName = resolveProvider().name;
  let degraded = false;
  const wallMs = env.RUN_MAX_WALL_MS;

  const persistEvent = (event: AgentEvent): Promise<void> =>
    db.insert(agentRunEvents).values({
      companyId: ctx.task.companyId,
      taskId,
      eventType: event.type,
      payload: event,
    }).then(() => undefined).catch((err) => {
      console.error("[agentRunEvents] insert failed", { event: event.type, err });
    });

  const handleEvent = (event: AgentEvent): void => {
    const enriched: AgentEvent =
      event.type === "run_start" ? { ...event, provider: providerName } : event;
    emitToBus(taskId, enriched);
    opts.onEvent?.(enriched);
    if (PERSIST_EVENT_TYPES.has(enriched.type)) void persistEvent(enriched);
  };

  const spawn: TriggerExecuteTask =
    opts.spawn ?? (async (payload) => dispatchRun(payload.task.taskId));

  activeRuns.add(taskId);
  const startTime = Date.now();
  let result;
  try {
    const memories = await loadMemories({
      agentId: ctx.employee.id,
      tenantId: ctx.task.companyId,
      query: `${ctx.task.title} ${ctx.objective}`,
      taskType: ctx.task.taskType,
      demoSessionId: ctx.task.demoSessionId,
    });

    const config: AgentConfig = {
      agentId: ctx.employee.id,
      tenantId: ctx.task.companyId,
      name: ctx.employee.name,
      roleType: ctx.employee.roleType,
      persona: getPersona(ctx.employee.roleType, ctx.companyName),
      maxDurationMs: wallMs,
    };

    let timer: ReturnType<typeof setTimeout> | undefined;
    // The agent checks maxDurationMs between iterations; the race is the hard
    // stop for a provider call that hangs past the wall.
    const hardStop = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), wallMs + 10_000);
    });

    const attempt = (provider?: RunProvider) =>
      run({
        config,
        task: {
          taskId,
          title: ctx.task.title,
          objective: ctx.objective,
          taskType: ctx.task.taskType,
          brief: ctx.brief,
        },
        tools: createToolsForRole(ctx.employee.roleType, ctx.task.companyId),
        memories: {
          episodic: memories.episodic,
          semantic: memories.semantic,
          procedural: memories.procedural,
          appliedRules: memories.activeRules,
        },
        onEvent: handleEvent,
        provider,
      });

    try {
      let raced: Awaited<ReturnType<typeof attempt>> | "timeout";
      try {
        raced = await Promise.race([attempt(), hardStop]);
      } catch (err) {
        if (!(err instanceof ProviderQuotaError)) throw err;
        degraded = true;
        providerName = "stub";
        await db.insert(activityLog).values({
          companyId: ctx.task.companyId,
          aiEmployeeId: ctx.employee.id,
          actionType: "run_degraded_to_simulated",
          actionDetail: { taskId, provider: err.provider, status: err.status },
        }).catch((logErr) => {
          console.error("[runner] degrade activity_log insert failed:", logErr);
        });
        raced = await Promise.race([attempt(createStubProvider()), hardStop]);
      }

      if (raced === "timeout" || raced.durationMs > wallMs) {
        const durationMs = Date.now() - startTime;
        if (raced === "timeout") {
          const event: AgentEvent = {
            type: "error",
            message: `Run exceeded ${wallMs}ms wall clock`,
            recoverable: false,
          };
          emitToBus(taskId, event);
          await persistEvent(event);
        }
        // Partial trajectory is already persisted event-by-event above; only
        // the status flip remains. Guarded so a founder cancel mid-run wins.
        await db.update(tasks).set({ status: "timed_out", completedAt: new Date() })
          .where(and(eq(tasks.id, taskId), inArray(tasks.status, ["queued", "running"])));
        await cascadeFailureToParent(taskId, ctx.brief);
        return { status: "timed_out", durationMs };
      }
      result = raced;
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    const event: AgentEvent = {
      type: "error",
      message: err instanceof Error ? err.message : String(err),
      recoverable: false,
    };
    emitToBus(taskId, event);
    await persistEvent(event);

    // Only flip in-flight work to failed: a retry of an already-shipped run
    // must not regress in_review/accepted, and a founder cancellation must
    // not be overwritten. A later retry that succeeds flips failed -> in_review.
    await db.update(tasks).set({ status: "failed", completedAt: new Date() })
      .where(and(eq(tasks.id, taskId), inArray(tasks.status, ["queued", "running", "failed"])));
    await cascadeFailureToParent(taskId, ctx.brief);
    throw err;
  } finally {
    activeRuns.delete(taskId);
  }

  const deliverableType = resolveDeliverableType(ctx.task.taskType, ctx.brief);
  const baseContent = parseOutputContent(result.output);
  // trail feeds the "read N pages, ran M searches" pill; appliedRules feeds
  // the "remembered" panel on the review page.
  const content = {
    ...baseContent,
    ...(degraded ? { provenance: "simulated" } : {}),
    trail: result.toolCalls,
    appliedRules: result.appliedRules,
    citations: result.citations,
  };

  // Dedupe against redispatch/retry: a prior attempt that inserted a
  // deliverable but crashed post-stream must not surface two rows in
  // /reviews for one task.
  const existingDeliverable = await db.query.deliverables.findFirst({
    where: eq(deliverables.taskId, taskId),
    columns: { id: true, status: true },
  });

  let deliverable: { id: string } | undefined;
  if (existingDeliverable && existingDeliverable.status === "in_review") {
    // Pre-judgment row; replace its content with this attempt's output.
    await db.update(deliverables).set({
      content,
      renderedPreview: result.output.slice(0, 5000),
      updatedAt: new Date(),
    }).where(eq(deliverables.id, existingDeliverable.id));
    deliverable = { id: existingDeliverable.id };
  } else if (existingDeliverable) {
    // Already judged by founder or chain auto-advance; discard this output.
    deliverable = { id: existingDeliverable.id };
  } else {
    const inserted = await db.insert(deliverables).values({
      taskId,
      companyId: ctx.task.companyId,
      aiEmployeeId: ctx.employee.id,
      deliverableType,
      title: ctx.task.title,
      content,
      renderedPreview: result.output.slice(0, 5000),
      version: 1,
      status: "in_review",
      // A demo visitor's run stays inside their session overlay.
      demoSessionId: ctx.task.demoSessionId,
    }).returning({ id: deliverables.id });
    deliverable = inserted[0];
  }

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

  // Guarded so a cancel or timeout that landed mid-run is not clobbered.
  await db.update(tasks).set({ status: "in_review", completedAt: new Date() })
    .where(and(eq(tasks.id, taskId), inArray(tasks.status, ["queued", "running", "failed"])));

  const planStepId = ctx.brief._planStepId as string | undefined;
  if (planStepId) {
    const thisTask = await db.query.tasks.findFirst({
      where: eq(tasks.id, taskId),
      columns: { parentTaskId: true },
    });

    if (thisTask?.parentTaskId) {
      const parent = await db.query.tasks.findFirst({
        where: eq(tasks.id, thisTask.parentTaskId),
      });

      if (parent?.plan) {
        const plan = parent.plan as TaskPlan;
        const step = plan.steps.find((s) => s.stepId === planStepId);

        if (deliverable?.id) {
          const updatedPlan: TaskPlan = {
            ...plan,
            stepDeliverableMap: { ...plan.stepDeliverableMap, [planStepId]: deliverable.id },
          };
          await db.update(tasks).set({ plan: updatedPlan })
            .where(eq(tasks.id, thisTask.parentTaskId));
        }

        // No human gate on this step: auto-accept task + deliverable so the
        // /reviews pending list does not surface this chain by-product, then
        // advance the chain.
        if (step && !step.humanGate) {
          const autoApprovedAt = new Date();
          await db.update(tasks).set({ status: "accepted" }).where(eq(tasks.id, taskId));

          if (deliverable?.id) {
            await db.update(deliverables).set({
              status: "accepted",
              approvedAt: autoApprovedAt,
              updatedAt: autoApprovedAt,
            }).where(eq(deliverables.id, deliverable.id));
          }

          await advanceChain(thisTask.parentTaskId, spawn).catch((advErr) => {
            console.error("Chain advancement failed:", advErr);
          });
        }
      }
    }
  }

  if (opts.notify) {
    opts.notify({
      type: "review_request",
      companyId: ctx.task.companyId,
      employeeName: ctx.employee.name,
      deliverableTitle: ctx.task.title,
      deliverableType,
      deliverableId: deliverable?.id ?? "",
      version: 1,
    }).catch((err) => {
      console.error("[Slack] Failed to dispatch notification:", err);
    });
  }

  if (deliverable?.id) {
    checkForCollaboration({
      employeeId: ctx.employee.id,
      companyId: ctx.task.companyId,
      deliverableId: deliverable.id,
      deliverableTitle: ctx.task.title,
      deliverableType,
      taskType: ctx.task.taskType,
    }).catch((err) => {
      console.error("Collaboration check failed:", err);
    });
  }

  return {
    status: "completed",
    output: result.output,
    deliverableId: deliverable?.id,
    iterations: result.iterations,
    durationMs: result.durationMs,
    tokensUsed: result.tokensUsed,
  };
}

export interface DispatchResult {
  id: string;
  transport: "trigger" | "inline";
}

/**
 * The one dispatch seam: Trigger.dev when configured and a trigger fn is
 * injected by the caller (packages/ai never imports @trigger.dev/sdk),
 * otherwise fire-and-forget in-process.
 */
export async function dispatchRun(
  taskId: string,
  opts: { trigger?: TriggerExecuteTask } = {},
): Promise<DispatchResult> {
  if (env.TRIGGER_SECRET_KEY && opts.trigger) {
    const ctx = await loadRunContext(taskId);
    const handle = await opts.trigger(toSpawnPayload(ctx));
    await db.update(tasks)
      .set({ triggerRunId: handle.id, status: "running", startedAt: new Date() })
      .where(and(eq(tasks.id, taskId), inArray(tasks.status, ["queued", "failed", "timed_out"])));
    return { id: handle.id, transport: "trigger" };
  }

  await db.update(tasks).set({ status: "running", startedAt: new Date() })
    .where(and(eq(tasks.id, taskId), inArray(tasks.status, ["queued", "failed", "timed_out"])));
  const run = executeTaskRun(taskId).catch((err) => {
    console.error(`[runner] in-process run for task ${taskId} crashed:`, err);
  });
  backgroundScheduler?.(run);
  return { id: taskId, transport: "inline" };
}
