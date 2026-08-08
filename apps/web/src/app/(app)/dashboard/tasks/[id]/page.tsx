import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { eq, and, desc, asc } from "drizzle-orm";
import { ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { DEMO_MODE, demoSessionIdFromHeaders } from "@/lib/demo";
import { demoWhere, withDemoOverlay } from "@/lib/demo-overlay";
import { db } from "@beast/db";
import { companies, tasks, deliverables, aiEmployees, agentRunEvents } from "@beast/db";
import type { AgentRunEvent } from "@beast/shared";
import { Monogram } from "@/components/monogram";
import { StateChip } from "@/components/state-chip";
import { ProvenanceTag, type Provenance } from "@/components/provenance-tag";
import { TicketMasthead, type TicketMastheadData } from "./_components/ticket-masthead";
import { LiveTicket } from "./_components/live-ticket";
import { PlanApprovalButtons } from "./_components/plan-approval-buttons";
import { TaskComments } from "./_components/task-comments";
import { toTicketLines, lineToneClass, type TicketLine } from "./_components/ticket-lines";

const IN_FLIGHT_STATUSES = new Set(["queued", "planning", "plan_review", "running", "revising"]);
const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

interface PlanStep {
  step: number;
  title: string;
  description?: string;
  assignedRole?: string;
}

function stamp(d: Date): string {
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const demoSid = DEMO_MODE ? demoSessionIdFromHeaders(await headers()) : null;
  const scope = demoWhere(demoSid);

  const company = await db.query.companies.findFirst({
    where: eq(companies.userId, user!.id),
    columns: { id: true },
  });

  const task = await db.query.tasks.findFirst({
    where: and(
      eq(tasks.id, id),
      eq(tasks.companyId, company!.id),
      scope.seedOrMine(tasks.demoSessionId),
    ),
  });

  if (!task) notFound();

  const inFlight = IN_FLIGHT_STATUSES.has(task.status);

  const [employees, deliverableRows, childTasks, parentTask, runEventRows] = await Promise.all([
    db.query.aiEmployees.findMany({
      where: eq(aiEmployees.companyId, company!.id),
      columns: { id: true, name: true, roleType: true, roleTitle: true },
    }),
    db.query.deliverables.findMany({
      where: and(
        eq(deliverables.taskId, task.id),
        scope.seedOrMine(deliverables.demoSessionId),
      ),
      orderBy: [desc(deliverables.version)],
    }),
    db.query.tasks.findMany({
      where: and(
        eq(tasks.parentTaskId, task.id),
        eq(tasks.companyId, company!.id),
        scope.seedOrMine(tasks.demoSessionId),
      ),
      orderBy: (t, { asc: a }) => [a(t.createdAt)],
    }),
    task.parentTaskId
      ? db.query.tasks.findFirst({
          where: and(eq(tasks.id, task.parentTaskId), eq(tasks.companyId, company!.id)),
          columns: { id: true, title: true },
        })
      : Promise.resolve(null),
    inFlight
      ? Promise.resolve([])
      : db.query.agentRunEvents.findMany({
          where: eq(agentRunEvents.taskId, task.id),
          orderBy: [asc(agentRunEvents.createdAt)],
          limit: 100,
        }),
  ]);

  const employeeById = new Map(employees.map((e) => [e.id, e]));
  const employee = employeeById.get(task.aiEmployeeId);
  const latestDeliverable = withDemoOverlay(deliverableRows, demoSid)[0] ?? null;

  const plan = task.plan as { steps?: PlanStep[] } | null;
  const planSteps = plan?.steps ?? [];

  const masthead: TicketMastheadData = {
    jobNo: task.id.slice(0, 8),
    taskType: task.taskType.replace(/_/g, " "),
    parent: parentTask ? { id: parentTask.id, title: parentTask.title } : null,
    employeeName: employee?.name ?? "Employee",
    employeeRole: employee?.roleType ?? null,
    employeeRoleTitle: employee?.roleTitle ?? null,
    timestamps: [
      `commissioned ${stamp(task.createdAt)}`,
      task.startedAt && `started ${stamp(task.startedAt)}`,
      task.completedAt && `completed ${stamp(task.completedAt)}`,
    ]
      .filter(Boolean)
      .join(" · "),
  };

  const provenance: Provenance | null = DEMO_MODE
    ? task.demoSessionId
      ? "live"
      : "seeded"
    : null;

  const briefAndPlan = (
    <>
      <BriefBlock brief={task.brief as Record<string, unknown>} />
      {planSteps.length > 0 && (
        <PlanSection steps={planSteps} taskId={task.id} approved={task.planApproved} />
      )}
    </>
  );

  const record = toTicketLines(
    runEventRows.map((r) => ({ event: r.payload as AgentRunEvent, at: r.createdAt.toISOString() })),
  );

  return (
    <div className="mx-auto max-w-4xl">
      {inFlight ? (
        <LiveTicket
          taskId={task.id}
          taskTitle={task.title}
          taskStatus={task.status}
          provenance={provenance}
          masthead={masthead}
        >
          {briefAndPlan}
        </LiveTicket>
      ) : (
        <>
          <TicketMasthead
            {...masthead}
            title={task.title}
            state={
              <>
                {provenance && <ProvenanceTag kind={provenance} />}
                <StateChip status={task.status} />
              </>
            }
          />
          {briefAndPlan}
          <RecordSection lines={record.lines} />
        </>
      )}

      {latestDeliverable ? (
        <DeliverableSection deliverable={latestDeliverable} />
      ) : (
        !inFlight &&
        task.status !== "accepted" && (
          <p className="rule-t mt-5 pt-2.5 text-[13px] text-ink-muted">
            No deliverable was filed. The production record shows what happened.
          </p>
        )
      )}

      {childTasks.length > 0 && (
        <section aria-label="Sub-jobs" className="mt-5">
          <div className="rule-t flex items-baseline justify-between pt-2.5">
            <h2 className="text-[15px] font-semibold">Sub-jobs</h2>
            <span className="spec text-ink-muted">
              {childTasks.filter((c) => c.status === "accepted" || c.status === "published").length}{" "}
              of {childTasks.length} done
            </span>
          </div>
          <ul className="mt-1">
            {childTasks.map((child) => {
              const emp = employeeById.get(child.aiEmployeeId);
              return (
                <li key={child.id} className="hairline-b last:border-b-0">
                  <Link
                    href={`/dashboard/tasks/${child.id}`}
                    className={`flex items-center gap-3 py-2.5 transition-colors hover:bg-panel ${FOCUS}`}
                  >
                    <Monogram name={emp?.name ?? "?"} roleType={emp?.roleType} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] leading-tight font-medium">
                        {child.title}
                      </span>
                      <span className="spec-label">
                        {emp?.name ?? "Employee"} · {child.taskType.replace(/_/g, " ")}
                      </span>
                    </span>
                    {child.demoSessionId && <ProvenanceTag kind="live" />}
                    <StateChip status={child.status} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {employee && (
        <TaskComments
          taskId={task.id}
          employeeName={employee.name}
          employeeRoleType={(employee.roleType ?? "marketing") as "marketing" | "sales" | "support"}
        />
      )}
    </div>
  );
}

function BriefBlock({ brief }: { brief: Record<string, unknown> }) {
  const entries = Object.entries(brief).filter(
    ([, v]) => v !== null && v !== undefined && v !== "",
  );
  if (entries.length === 0) return null;
  return (
    <section aria-label="The brief" className="mt-5">
      <div className="rule-t pt-2.5">
        <h2 className="text-[15px] font-semibold">The brief</h2>
      </div>
      <dl className="panel-tinted mt-2.5 space-y-3 p-4">
        {entries.map(([k, v]) => (
          <div key={k}>
            <dt className="spec-label">{k.replace(/([A-Z])/g, " $1").toLowerCase()}</dt>
            <dd className="mt-0.5 text-[13.5px] leading-relaxed whitespace-pre-wrap">
              {typeof v === "string" ? v : <span className="spec">{JSON.stringify(v)}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function PlanSection({
  steps,
  taskId,
  approved,
}: {
  steps: PlanStep[];
  taskId: string;
  approved: boolean;
}) {
  return (
    <section aria-label="The plan" className="mt-5">
      <div className="rule-t flex flex-wrap items-center justify-between gap-2 pt-2.5">
        <h2 className="text-[15px] font-semibold">
          The plan
          {approved && <span className="spec-label ml-2">approved</span>}
        </h2>
        {!approved && <PlanApprovalButtons taskId={taskId} />}
      </div>
      <ol className="mt-1">
        {steps.map((step) => (
          <li key={step.step} className="hairline-b flex gap-3 py-2.5 last:border-b-0">
            <span className="spec w-6 shrink-0 pt-0.5 text-ink-muted">
              {String(step.step).padStart(2, "0")}
            </span>
            <div className="min-w-0">
              <p className="text-[13.5px] leading-tight font-medium">{step.title}</p>
              {step.description && (
                <p className="mt-0.5 text-[12.5px] leading-snug text-ink-secondary">
                  {step.description}
                </p>
              )}
              {step.assignedRole && <p className="spec-label mt-0.5">{step.assignedRole}</p>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function RecordSection({ lines }: { lines: TicketLine[] }) {
  return (
    <section aria-label="Production record" className="mt-5">
      <div className="rule-t flex items-baseline justify-between pt-2.5">
        <h2 className="text-[15px] font-semibold">Production record</h2>
        <span className="spec text-ink-muted">
          {lines.length} entr{lines.length === 1 ? "y" : "ies"}
        </span>
      </div>
      {lines.length === 0 ? (
        <p className="mt-2.5 text-[13px] text-ink-muted">
          No production record. The job never reached the press.
        </p>
      ) : (
        <ol className="mt-2 space-y-1.5">
          {lines.map((line) => (
            <li key={line.key} className="flex items-baseline gap-3">
              <span className="spec w-16 shrink-0 text-ink-muted">
                {line.at ? clock(line.at) : ""}
              </span>
              <span className={`spec min-w-[86px] shrink-0 font-semibold ${lineToneClass(line.tone)}`}>
                {line.label}
              </span>
              <span className="spec min-w-0 flex-1 break-words text-ink-secondary">
                {line.detail}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function DeliverableSection({
  deliverable,
}: {
  deliverable: {
    id: string;
    version: number;
    deliverableType: string;
    content: unknown;
    demoSessionId: string | null;
  };
}) {
  const c = deliverable.content as Record<string, unknown>;
  const pick = (k: string) => (typeof c[k] === "string" ? (c[k] as string) : undefined);
  const previewText = pick("editedText") ?? pick("content") ?? pick("body") ?? pick("response") ?? null;

  return (
    <section aria-label="Deliverable" className="mt-5">
      <div className="rule-t flex flex-wrap items-baseline justify-between gap-2 pt-2.5">
        <h2 className="text-[15px] font-semibold">Deliverable</h2>
        <span className="flex items-center gap-2">
          {deliverable.demoSessionId && <ProvenanceTag kind="live" />}
          <span className="spec text-ink-muted">
            v{deliverable.version} · {deliverable.deliverableType}
          </span>
        </span>
      </div>
      <div className="panel mt-2.5 p-4">
        {previewText ? (
          <p className="line-clamp-[10] text-[13.5px] leading-relaxed whitespace-pre-wrap">
            {previewText}
          </p>
        ) : (
          <p className="text-[13px] text-ink-muted">
            Non-text deliverable. Open it in review for the full output.
          </p>
        )}
      </div>
      <Link
        href={`/review/${deliverable.id}`}
        className={`rule-t mt-3 flex items-center justify-between py-3 text-[14px] font-semibold transition-colors hover:bg-panel ${FOCUS}`}
      >
        Open in review
        <ArrowRight size={16} strokeWidth={1.5} aria-hidden />
      </Link>
    </section>
  );
}
