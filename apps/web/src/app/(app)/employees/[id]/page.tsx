import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { eq, and, desc, gte, inArray } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { DEMO_MODE, demoSessionIdFromHeaders } from "@/lib/demo";
import { demoWhere, withDemoOverlay } from "@/lib/demo-overlay";
import { db } from "@beast/db";
import { companies, aiEmployees, tasks, deliverables, proceduralMemories } from "@beast/db";
import { roleMeta } from "@/lib/colors";
import { splitRuleTitle } from "@/lib/rule-title";
import { Monogram } from "@/components/monogram";
import { StateChip } from "@/components/state-chip";
import { ProvenanceTag } from "@/components/provenance-tag";
import { DeskActions } from "./_components/desk-actions";
import { CheckInFrequencyPicker } from "./_components/check-in-frequency-picker";

const PERFORMANCE_WINDOW_DAYS = 30;
const DESK_STATUSES = ["running", "plan_review", "planning", "queued"] as const;

function relativeTime(d: Date): string {
  const m = Math.floor((Date.now() - d.getTime()) / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EmployeeDeskPage({ params }: PageProps) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const company = await db.query.companies.findFirst({
    where: eq(companies.userId, user!.id),
    columns: { id: true },
  });

  const employee = await db.query.aiEmployees.findFirst({
    where: and(eq(aiEmployees.id, id), eq(aiEmployees.companyId, company!.id)),
  });

  if (!employee) {
    notFound();
  }

  const demoSid = DEMO_MODE ? demoSessionIdFromHeaders(await headers()) : null;
  const scope = demoWhere(demoSid);
  const windowStart = new Date(Date.now() - PERFORMANCE_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [deskTasks, deliverableRowsRaw, rules, outcomeRowsRaw] = await Promise.all([
    db.query.tasks.findMany({
      where: and(
        eq(tasks.aiEmployeeId, employee.id),
        eq(tasks.companyId, company!.id),
        inArray(tasks.status, [...DESK_STATUSES]),
        scope.seedOrMine(tasks.demoSessionId),
      ),
      orderBy: [desc(tasks.createdAt)],
      limit: 8,
    }),
    db.query.deliverables.findMany({
      where: and(
        eq(deliverables.aiEmployeeId, employee.id),
        eq(deliverables.companyId, company!.id),
        scope.seedOrMine(deliverables.demoSessionId),
      ),
      orderBy: [desc(deliverables.updatedAt)],
      limit: 12,
    }),
    db.query.proceduralMemories.findMany({
      where: and(
        eq(proceduralMemories.agentId, employee.id),
        eq(proceduralMemories.tenantId, company!.id),
        eq(proceduralMemories.isCurrent, true),
      ),
      columns: { id: true, title: true, confidence: true },
      orderBy: (m, { asc }) => [asc(m.createdAt)],
    }),
    db.query.deliverables.findMany({
      where: and(
        eq(deliverables.aiEmployeeId, employee.id),
        eq(deliverables.companyId, company!.id),
        gte(deliverables.updatedAt, windowStart),
        inArray(deliverables.status, ["accepted", "published", "revised", "rejected"]),
        scope.seedOrMine(deliverables.demoSessionId),
      ),
      columns: { id: true, status: true, demoSessionId: true, supersedesDeliverableId: true },
    }),
  ]);

  const deliverableRows = withDemoOverlay(deliverableRowsRaw, demoSid).slice(0, 8);
  const outcomeRows = withDemoOverlay(outcomeRowsRaw, demoSid);
  const shipped = outcomeRows.filter(
    (r) => r.status === "accepted" || r.status === "published",
  ).length;
  const approval =
    outcomeRows.length > 0 ? `${Math.round((shipped / outcomeRows.length) * 100)}%` : "—";

  const stationOrder: Record<string, number> = { running: 0, plan_review: 1, planning: 2, queued: 3 };
  const currentWork = [...deskTasks].sort(
    (a, b) =>
      (stationOrder[a.status] ?? 9) - (stationOrder[b.status] ?? 9) ||
      b.createdAt.getTime() - a.createdAt.getTime(),
  );

  const role = roleMeta(employee.roleType);

  return (
    <div className="mx-auto max-w-6xl">
      <header className="rule-b pb-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <span className="flex shrink-0 flex-col items-center gap-1">
              <Monogram name={employee.name} roleType={employee.roleType} size="xl" />
              <span className="spec text-ink-muted">{role.solid}</span>
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="display text-3xl">{employee.name}</h1>
                <StateChip status={employee.status ?? "idle"} />
              </div>
              <p className="mt-1 text-[13.5px] text-ink-secondary">{employee.roleTitle}</p>
              <p className="spec mt-1.5 text-ink-muted">
                {shipped} shipped 30d · {approval} approval · {rules.length} standing rule
                {rules.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-start gap-2.5 sm:items-end">
            <DeskActions employeeId={employee.id} employeeName={employee.name} />
            <CheckInFrequencyPicker
              employeeId={employee.id}
              initialFrequency={(employee.checkInFrequency ?? "daily") as "daily" | "weekly" | "per_task"}
            />
          </div>
        </div>
      </header>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <div className="min-w-0 space-y-5">
          <section aria-label="On the desk">
            <div className="rule-t flex items-baseline justify-between pt-2.5">
              <h2 className="text-[15px] font-semibold">On the desk</h2>
              <Link
                href="/dashboard/tasks"
                className="spec-label transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                All jobs
              </Link>
            </div>
            {currentWork.length === 0 ? (
              <p className="mt-2.5 text-[13px] text-ink-muted">
                Nothing on the desk. Brief a job and it stamps through the stations here.
              </p>
            ) : (
              <ul className="mt-2">
                {currentWork.map((t) => (
                  <li key={t.id} className="hairline-b last:border-b-0">
                    <Link
                      href={`/dashboard/tasks/${t.id}`}
                      className="flex flex-col gap-1.5 py-2.5 transition-colors hover:bg-panel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink sm:flex-row sm:items-center sm:gap-3"
                    >
                      <span className="line-clamp-2 min-w-0 text-[13.5px] font-medium sm:line-clamp-1 sm:flex-1">
                        {t.title}
                      </span>
                      <span className="flex shrink-0 items-center gap-3">
                        {t.demoSessionId && <ProvenanceTag kind="live" />}
                        <StateChip status={t.status} />
                        <span className="spec w-8 text-right text-ink-muted">
                          {relativeTime(t.createdAt)}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-label="Deliverables">
            <div className="rule-t pt-2.5">
              <h2 className="text-[15px] font-semibold">Deliverables</h2>
            </div>
            {deliverableRows.length === 0 ? (
              <p className="mt-2.5 text-[13px] text-ink-muted">
                No deliverables on file. The first accepted job opens {employee.name}&apos;s record.
              </p>
            ) : (
              <ul className="mt-2">
                {deliverableRows.map((d) => (
                  <li key={d.id} className="hairline-b last:border-b-0">
                    <Link
                      href={`/review/${d.id}`}
                      className="flex flex-col gap-1.5 py-2.5 transition-colors hover:bg-panel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink sm:flex-row sm:items-center sm:gap-3"
                    >
                      <span className="min-w-0 sm:flex-1">
                        <span className="line-clamp-2 text-[13.5px] leading-tight font-medium sm:line-clamp-1">
                          {d.title}
                        </span>
                        <span className="spec-label">
                          {d.deliverableType} · v{d.version}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-3">
                        {d.demoSessionId && <ProvenanceTag kind="live" />}
                        <StateChip status={d.status} />
                        <span className="spec w-8 text-right text-ink-muted">
                          {relativeTime(d.updatedAt)}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="min-w-0 space-y-5">
          <section aria-label="Manual slice" className="panel p-4">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-[15px] font-semibold">{employee.name}&apos;s slice of the manual</h2>
              <Link
                href="/memory"
                className="spec-label shrink-0 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                The manual
              </Link>
            </div>
            {rules.length === 0 ? (
              <p className="mt-2 text-[13px] leading-snug text-ink-muted">
                No standing rules yet. Edit {employee.name}&apos;s deliverables in review; corroborated
                edits become numbered rules here.
              </p>
            ) : (
              <ol className="mt-2.5 space-y-2.5">
                {rules.map((r) => {
                  const { number, text } = splitRuleTitle(r.title);
                  return (
                    <li key={r.id} className="flex items-baseline gap-2.5">
                      {number && <span className="spec shrink-0 font-semibold">{number}</span>}
                      <span className="min-w-0 flex-1 text-[13px] leading-snug">{text}</span>
                      <span className="spec shrink-0 text-ink-muted">{r.confidence.toFixed(2)}</span>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          <section aria-label="Memos" className="panel-tinted p-4">
            <h2 className="text-[15px] font-semibold">Memos</h2>
            <p className="mt-1.5 text-[13px] leading-snug text-ink-secondary">
              Write {employee.name} a memo; anything past a sentence becomes a job on the queue and
              comes back through review.
            </p>
            <Link
              href={`/employees/${employee.id}/chat`}
              className="btn-ink mt-3 w-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              Open chat
            </Link>
          </section>
        </div>
      </div>
    </div>
  );
}
