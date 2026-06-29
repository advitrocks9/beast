import { eq, and, desc, asc } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@beast/db";
import { companies, tasks, deliverables, aiEmployees, agentRunEvents } from "@beast/db";
import { GlassCard } from "@beast/ui";
import { PlanApprovalButtons } from "./_components/plan-approval-buttons";
import { TaskComments } from "./_components/task-comments";
import { CancelTaskButton } from "./_components/cancel-task-button";
import { roleColor, roleMeta, statusMeta } from "@/lib/colors";

const IN_FLIGHT_STATUSES = new Set(["pending", "in_progress", "working", "planned"]);

interface ToolCallTrace {
  toolCallId: string;
  name: string;
  inputSummary: string;
  resultSummary: string;
  durationMs: number;
  startedAt: string;
}

interface PlanStep {
  step: number;
  title: string;
  description?: string;
  assignedRole?: string;
}

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const company = await db.query.companies.findFirst({
    where: eq(companies.userId, user!.id),
    columns: { id: true },
  });

  const task = await db.query.tasks.findFirst({
    where: and(eq(tasks.id, id), eq(tasks.companyId, company!.id)),
  });

  if (!task) notFound();

  const employee = await db.query.aiEmployees.findFirst({
    where: eq(aiEmployees.id, task.aiEmployeeId),
    columns: { id: true, name: true, roleType: true, roleTitle: true },
  });

  const latestDeliverable = await db.query.deliverables.findFirst({
    where: eq(deliverables.taskId, task.id),
    orderBy: [desc(deliverables.version)],
  });

  const childTasks = await db.query.tasks.findMany({
    where: and(
      eq(tasks.parentTaskId, task.id),
      eq(tasks.companyId, company!.id),
    ),
    orderBy: (t, { asc }) => [asc(t.createdAt)],
  });

  const parentTask = task.parentTaskId
    ? await db.query.tasks.findFirst({
        where: and(eq(tasks.id, task.parentTaskId), eq(tasks.companyId, company!.id)),
        columns: { id: true, title: true },
      })
    : null;

  const childEmployeeIds = [...new Set(childTasks.map((t) => t.aiEmployeeId))];
  const childEmployees = childEmployeeIds.length > 0
    ? await db.query.aiEmployees.findMany({
        where: eq(aiEmployees.companyId, company!.id),
        columns: { id: true, name: true, roleType: true },
      })
    : [];
  const childEmployeeMap = new Map(childEmployees.map((e) => [e.id, e]));

  const runEvents = await db.query.agentRunEvents.findMany({
    where: eq(agentRunEvents.taskId, task.id),
    orderBy: [asc(agentRunEvents.createdAt)],
    limit: 100,
  });

  const status = statusMeta(task.status);
  const employeeMeta = roleMeta(employee?.roleType);

  const plan = task.plan as { steps?: PlanStep[] } | null;
  const planSteps = plan?.steps ?? [];

  const trail = (latestDeliverable?.content as Record<string, unknown> | null)?.trail as
    | ToolCallTrace[]
    | undefined;

  const previewText = latestDeliverable
    ? (() => {
        const c = latestDeliverable.content as Record<string, unknown>;
        const pick = (k: string) => (typeof c[k] === "string" ? (c[k] as string) : undefined);
        return pick("editedText") ?? pick("content") ?? pick("body") ?? pick("response") ?? null;
      })()
    : null;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <div className="flex items-center gap-2 text-xs font-medium text-text-muted uppercase tracking-wider">
          {parentTask ? (
            <>
              <Link
                href={`/dashboard/tasks/${parentTask.id}`}
                className="hover:text-text"
              >
                {parentTask.title}
              </Link>
              <span>/</span>
              <span className="text-text-secondary">Sub-task</span>
            </>
          ) : (
            <span>Task</span>
          )}
        </div>
        <h1 className="mt-1 font-(--font-display) text-2xl font-bold tracking-tight">
          {task.title}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <span
            className="rounded-full px-2.5 py-0.5 text-xs font-medium"
            style={{ backgroundColor: status.bg, color: status.fg }}
          >
            {status.label}
          </span>
          {employee && (
            <span className="flex items-center gap-1.5 text-text-secondary">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: employeeMeta.solid }}
              />
              {employee.name}
              <span className="text-text-muted">·</span>
              <span className="text-text-muted">{employee.roleTitle}</span>
            </span>
          )}
          {task.startedAt && (
            <span className="text-text-muted text-xs">
              Started {new Date(task.startedAt).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          )}
          {IN_FLIGHT_STATUSES.has(task.status) && (
            <CancelTaskButton taskId={task.id} taskTitle={task.title} />
          )}
        </div>
      </div>

      {planSteps.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold">
              Plan
              {!task.planApproved && (
                <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                  Awaiting approval
                </span>
              )}
              {task.planApproved && (
                <span className="ml-2 rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-700">
                  Approved
                </span>
              )}
            </h2>
            {!task.planApproved && <PlanApprovalButtons taskId={task.id} />}
          </div>
          <GlassCard hoverable={false} className="p-5">
            <ol className="space-y-3">
              {planSteps.map((step) => (
                <li key={step.step} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[oklch(0.97_0.005_260/0.6)] text-xs font-medium text-text-secondary">
                    {step.step}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{step.title}</p>
                    {step.description && (
                      <p className="text-xs text-text-secondary mt-0.5">{step.description}</p>
                    )}
                    {step.assignedRole && (
                      <p className="text-[11px] text-text-muted mt-0.5">
                        assigned to {step.assignedRole}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </GlassCard>
        </section>
      )}

      {childTasks.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold mb-2">
            Sub-tasks
            <span className="ml-2 text-xs font-normal text-text-muted">
              ({childTasks.filter((c) => c.status === "approved" || c.status === "completed").length} of {childTasks.length} done)
            </span>
          </h2>
          <div className="space-y-2">
            {childTasks.map((child) => {
              const cEmp = childEmployeeMap.get(child.aiEmployeeId);
              const cColor = roleColor(cEmp?.roleType);
              const cs = statusMeta(child.status);
              return (
                <Link key={child.id} href={`/dashboard/tasks/${child.id}`}>
                  <GlassCard className="p-3">
                    <div className="flex items-center gap-3">
                      <span
                        className="inline-block h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: cColor }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{child.title}</p>
                        <p className="text-xs text-text-secondary truncate">
                          {cEmp?.name ?? "Unknown"} · {child.taskType.replace(/_/g, " ")}
                        </p>
                      </div>
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0"
                        style={{ backgroundColor: cs.bg, color: cs.fg }}
                      >
                        {cs.label}
                      </span>
                    </div>
                  </GlassCard>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {!latestDeliverable && task.status !== "approved" && (
        <GlassCard hoverable={false} className="p-6">
          <div className="flex items-center gap-3">
            <span
              className="inline-flex h-8 w-8 items-center justify-center rounded-full"
              style={{ backgroundColor: employeeMeta.tint }}
            >
              <span
                className="inline-block h-2 w-2 animate-pulse rounded-full"
                style={{ backgroundColor: employeeMeta.solid }}
              />
            </span>
            <div>
              <p className="text-sm font-medium">
                {employee?.name ?? "Working"} is on it.
              </p>
              <p className="text-xs text-text-secondary mt-0.5">
                You will get a notification when the deliverable lands. Refresh this
                page to see the latest run state.
              </p>
            </div>
          </div>
        </GlassCard>
      )}

      {latestDeliverable && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold">
              Deliverable
              <span className="ml-2 text-xs font-normal text-text-muted">
                v{latestDeliverable.version}
              </span>
            </h2>
            <Link
              href={`/review/${latestDeliverable.id}`}
              className="text-xs font-medium text-brand hover:underline"
            >
              Open in review
            </Link>
          </div>
          <GlassCard hoverable={false} className="p-5">
            {previewText ? (
              <p className="whitespace-pre-wrap text-sm text-text leading-relaxed line-clamp-[12]">
                {previewText}
              </p>
            ) : (
              <p className="text-sm text-text-muted">
                Deliverable rendered in a non-text format. Open in review to see the full output.
              </p>
            )}
          </GlassCard>
        </section>
      )}

      {trail && trail.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold mb-2">Reasoning trail</h2>
          <div className="space-y-2">
            {trail.map((call) => (
              <GlassCard key={call.toolCallId} hoverable={false} className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium">{call.name}</p>
                    <p className="text-[11px] text-text-secondary mt-0.5 truncate">
                      {call.inputSummary}
                    </p>
                  </div>
                  <span className="text-[11px] text-text-muted shrink-0">
                    {Math.round(call.durationMs)}ms
                  </span>
                </div>
              </GlassCard>
            ))}
          </div>
        </section>
      )}

      {employee && (
        <TaskComments
          taskId={task.id}
          employeeName={employee.name}
          employeeRoleType={(employee.roleType ?? "marketing") as "marketing" | "sales" | "support"}
        />
      )}

      {runEvents.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold mb-2">Run timeline</h2>
          <GlassCard hoverable={false} className="p-4">
            <ol className="relative space-y-3">
              {runEvents.map((event, i) => {
                const eventColor = eventTypeColor(event.eventType);
                const isLast = i === runEvents.length - 1;
                return (
                  <li key={event.id} className="flex gap-3">
                    <div className="relative shrink-0">
                      <span
                        className="block h-2.5 w-2.5 rounded-full mt-1.5"
                        style={{ backgroundColor: eventColor }}
                      />
                      {!isLast && (
                        <span
                          className="absolute left-1/2 top-4 h-full w-px -translate-x-1/2 bg-[oklch(0.85_0.01_260/0.3)]"
                          aria-hidden
                        />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 pb-1">
                      <p className="text-xs text-text">
                        {formatTimelineEvent(event.eventType, event.payload as Record<string, unknown>)}
                      </p>
                      <p className="text-[10px] text-text-muted mt-0.5">
                        {new Date(event.createdAt).toLocaleTimeString("en-US", {
                          hour: "numeric",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </GlassCard>
        </section>
      )}
    </div>
  );
}

function formatTimelineEvent(type: string, payload: Record<string, unknown>): string {
  const pick = (k: string) => (typeof payload[k] === "string" ? (payload[k] as string) : undefined);
  switch (type) {
    case "run_start":
      return `Run started.`;
    case "tool_call_start": {
      const name = pick("toolName") ?? "tool";
      return `Calling ${name.replace(/_/g, " ")}.`;
    }
    case "tool_call_end": {
      const name = pick("toolName") ?? "tool";
      const result = pick("result");
      const snippet = result ? ` -> ${result.slice(0, 80)}${result.length > 80 ? "..." : ""}` : "";
      return `Finished ${name.replace(/_/g, " ")}.${snippet}`;
    }
    case "scratchpad_update":
      return `Updated plan scratchpad.`;
    case "error": {
      const msg = pick("message") ?? "ran into an error";
      return `Error: ${msg}`;
    }
    case "run_end": {
      const it = typeof payload.iterations === "number" ? payload.iterations : 0;
      const dur = typeof payload.durationMs === "number" ? Math.round(payload.durationMs / 1000) : null;
      return dur !== null
        ? `Done in ${it} iteration${it === 1 ? "" : "s"}, ${dur}s.`
        : `Done in ${it} iteration${it === 1 ? "" : "s"}.`;
    }
    default:
      return type.replace(/_/g, " ");
  }
}

function eventTypeColor(type: string): string {
  switch (type) {
    case "run_start": return statusMeta("running").dot;
    case "tool_call_start": return statusMeta("idle").dot;
    case "tool_call_end": return statusMeta("completed").dot;
    case "scratchpad_update": return statusMeta("review").dot;
    case "error": return statusMeta("error").dot;
    case "run_end": return statusMeta("completed").dot;
    default: return statusMeta("idle").dot;
  }
}
