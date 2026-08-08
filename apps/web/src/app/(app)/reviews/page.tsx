import Link from "next/link";
import { headers } from "next/headers";
import { eq, and, or, inArray, count } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { DEMO_MODE, demoSessionIdFromHeaders } from "@/lib/demo";
import { demoWhere, withDemoOverlay } from "@/lib/demo-overlay";
import { db } from "@beast/db";
import { companies, deliverables, aiEmployees, tasks } from "@beast/db";
import { Monogram } from "@/components/monogram";
import { HistoryList } from "./_components/history-list";
import { AutoPublishQueue } from "./_components/auto-publish-queue";
import { PendingList, type PendingItem } from "./_components/pending-list";

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function formatTurnaround(ms: number): string {
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

export default async function ReviewQueuePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const company = await db.query.companies.findFirst({
    where: eq(companies.userId, user!.id),
    columns: { id: true },
  });

  const demoSid = DEMO_MODE ? demoSessionIdFromHeaders(await headers()) : null;
  const scope = demoWhere(demoSid).seedOrMine(deliverables.demoSessionId);

  const [pendingRaw, finalRaw, totalDeliverablesResult, allEmployees] = await Promise.all([
    // In demo the fetch adds the session's clones regardless of status so a
    // clone that left in_review still supersedes its seed original below.
    db.query.deliverables.findMany({
      where: and(
        eq(deliverables.companyId, company!.id),
        demoSid
          ? and(
              scope,
              or(eq(deliverables.status, "in_review"), eq(deliverables.demoSessionId, demoSid)),
            )
          : eq(deliverables.status, "in_review"),
      ),
      orderBy: (d, { desc }) => [desc(d.createdAt)],
    }),
    db.query.deliverables.findMany({
      where: and(
        eq(deliverables.companyId, company!.id),
        scope,
        inArray(deliverables.status, ["accepted", "published", "rejected"]),
      ),
      columns: {
        id: true,
        status: true,
        createdAt: true,
        approvedAt: true,
        demoSessionId: true,
        supersedesDeliverableId: true,
      },
      orderBy: (d, { desc }) => [desc(d.updatedAt)],
      limit: 200,
    }),
    db
      .select({ value: count() })
      .from(deliverables)
      .where(and(eq(deliverables.companyId, company!.id), scope)),
    db.query.aiEmployees.findMany({
      where: eq(aiEmployees.companyId, company!.id),
      columns: { id: true, name: true, roleType: true },
    }),
  ]);

  const pendingDeliverables = withDemoOverlay(pendingRaw, demoSid)
    .filter((d) => d.status === "in_review");
  const finalRows = withDemoOverlay(finalRaw, demoSid);

  const totalDeliverables = totalDeliverablesResult[0]?.value ?? 0;
  const isFreshTenant = totalDeliverables === 0;

  const signedOff = finalRows.filter((d) => d.status === "accepted" || d.status === "published");
  const rejectedCount = finalRows.length - signedOff.length;
  const approvalRate = finalRows.length > 0
    ? Math.round((signedOff.length / finalRows.length) * 100)
    : null;
  const turnaround = median(
    signedOff
      .filter((d) => d.approvedAt !== null)
      .map((d) => d.approvedAt!.getTime() - d.createdAt.getTime())
      .filter((ms) => ms > 0),
  );

  const employeeById = new Map(allEmployees.map((e) => [e.id, e]));
  const taskIds = [...new Set(pendingDeliverables.map((d) => d.taskId).filter(Boolean))] as string[];
  const taskRows = taskIds.length > 0
    ? await db.query.tasks.findMany({
        where: inArray(tasks.id, taskIds),
        columns: { id: true, title: true },
      })
    : [];
  const taskById = new Map(taskRows.map((t) => [t.id, t]));

  const pendingItems: PendingItem[] = pendingDeliverables.map((d) => {
    const emp = employeeById.get(d.aiEmployeeId);
    return {
      id: d.id,
      title: d.title,
      deliverableType: d.deliverableType,
      version: d.version,
      createdAt: d.createdAt.toISOString(),
      employeeName: emp?.name ?? "Unknown",
      employeeRoleType: emp?.roleType ?? null,
      taskTitle: d.taskId ? taskById.get(d.taskId)?.title ?? null : null,
      isLive: d.demoSessionId !== null,
    };
  });

  return (
    <div className="mx-auto max-w-6xl">
      <header className="rule-b pb-4">
        <h1 className="display text-3xl">Review</h1>
        <p className="spec mt-1.5 text-ink-muted">
          {pendingItems.length} in the tray · every deliverable stops here for sign-off
        </p>
      </header>

      <div className="hairline-b flex flex-wrap items-baseline gap-x-6 gap-y-1 py-2.5">
        <SpecFigure label="approval rate" value={approvalRate === null ? "n/a" : `${approvalRate}%`} />
        <SpecFigure
          label="median turnaround"
          value={turnaround === null ? "n/a" : formatTurnaround(turnaround)}
        />
        <SpecFigure label="signed off" value={String(signedOff.length)} />
        <SpecFigure label="rejected" value={String(rejectedCount)} />
      </div>

      <AutoPublishQueue />

      <section aria-label="Pending review" className="mt-6">
        <div className="rule-t flex items-baseline justify-between pt-2.5">
          <h2 className="text-[15px] font-semibold">
            The docket
            <span className="spec ml-2 text-ink-muted">{pendingItems.length}</span>
          </h2>
        </div>

        {pendingItems.length === 0 ? (
          isFreshTenant ? (
            <FreshTenantEmptyState employees={allEmployees} />
          ) : (
            <p className="mt-2.5 text-[13px] text-ink-muted">
              Tray is clear. When an employee files a deliverable it lands here, with its full
              production record, for your sign-off.
            </p>
          )
        ) : (
          <PendingList items={pendingItems} />
        )}
      </section>

      <section id="history" className="mt-8 scroll-mt-6" aria-label="Review history">
        <div className="rule-t pt-2.5">
          <h2 className="text-[15px] font-semibold">History</h2>
        </div>
        <HistoryList />
      </section>
    </div>
  );
}

function SpecFigure({ label, value }: { label: string; value: string }) {
  return (
    <p className="spec text-ink-secondary">
      <span className="spec-label mr-1.5">{label}</span>
      {value}
    </p>
  );
}

interface EmployeeRef {
  id: string;
  name: string;
  roleType: string;
}

function FreshTenantEmptyState({ employees }: { employees: EmployeeRef[] }) {
  return (
    <div className="panel-tinted mt-3 p-6">
      <p className="spec-label">Nothing filed yet</p>
      <p className="mt-2 max-w-md text-[13.5px] leading-relaxed text-ink-secondary">
        Every deliverable stops at this desk before it counts. Commission a job, let an employee
        run it, and the result lands here with its full production record. Your edits become
        candidate rules; corroborated rules amend the operating manual.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Link href="/dashboard/tasks" className="btn-ink">
          Open jobs
        </Link>
        {employees.map((emp) => (
          <Link
            key={emp.id}
            href={`/employees/${emp.id}`}
            className="btn-ghost"
          >
            <Monogram name={emp.name} roleType={emp.roleType} size="sm" />
            {emp.name}
          </Link>
        ))}
      </div>
    </div>
  );
}
