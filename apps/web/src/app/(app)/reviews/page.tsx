import { eq, and, inArray, count } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@beast/db";
import { companies, deliverables, aiEmployees, tasks } from "@beast/db";
import { GlassCard } from "@beast/ui";
import Link from "next/link";
import { HistoryList } from "./_components/history-list";
import { StatsStrip } from "./_components/stats-strip";
import { AutoPublishPill } from "./_components/auto-publish-pill";
import { PendingList, type PendingItem } from "./_components/pending-list";
import { roleColor } from "@/lib/colors";

export default async function ReviewQueuePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const company = await db.query.companies.findFirst({
    where: eq(companies.userId, user!.id),
    columns: { id: true },
  });

  const [pendingDeliverables, totalDeliverablesResult, allEmployees] = await Promise.all([
    db.query.deliverables.findMany({
      where: and(
        eq(deliverables.companyId, company!.id),
        inArray(deliverables.status, ["draft", "pending_review", "review"]),
      ),
      orderBy: (d, { desc }) => [desc(d.createdAt)],
    }),
    db
      .select({ value: count() })
      .from(deliverables)
      .where(eq(deliverables.companyId, company!.id)),
    db.query.aiEmployees.findMany({
      where: eq(aiEmployees.companyId, company!.id),
      columns: { id: true, name: true, roleType: true },
    }),
  ]);

  const totalDeliverables = totalDeliverablesResult[0]?.value ?? 0;
  const isFreshTenant = totalDeliverables === 0;

  const employeeIds = [...new Set(pendingDeliverables.map((d) => d.aiEmployeeId))];
  const taskIds = [...new Set(pendingDeliverables.map((d) => d.taskId).filter(Boolean))] as string[];

  const employeeRows = employeeIds.length > 0
    ? await db.query.aiEmployees.findMany({
        where: inArray(aiEmployees.id, employeeIds),
        columns: { id: true, name: true, roleType: true },
      })
    : [];

  const taskRows = taskIds.length > 0
    ? await db.query.tasks.findMany({
        where: inArray(tasks.id, taskIds),
        columns: { id: true, title: true },
      })
    : [];

  const employeeMap = Object.fromEntries(employeeRows.map((e) => [e.id, e]));
  const taskMap = Object.fromEntries(taskRows.map((t) => [t.id, t]));

  const pendingItems: PendingItem[] = pendingDeliverables.map((d) => {
    const emp = employeeMap[d.aiEmployeeId];
    const task = d.taskId ? taskMap[d.taskId] : null;
    const empColor = roleColor(emp?.roleType);
    return {
      id: d.id,
      title: d.title,
      deliverableType: d.deliverableType,
      version: d.version,
      createdAt: d.createdAt.toISOString(),
      employeeName: emp?.name ?? "Unknown",
      employeeInitial: emp?.name?.[0] ?? "?",
      employeeColor: empColor,
      taskTitle: task?.title ?? null,
    };
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-(--font-display) text-2xl font-bold tracking-tight">Reviews</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Pending deliverables and a running history of every approval, publish, and rejection.
        </p>
      </div>

      <StatsStrip />

      <AutoPublishPill />

      <section>
        <h2 className="heading-gradient text-lg font-semibold mb-3">
          Pending
          <span className="ml-2 text-sm font-normal text-text-secondary">
            ({pendingDeliverables.length})
          </span>
        </h2>

        {pendingItems.length === 0 ? (
          isFreshTenant ? (
            <FreshTenantEmptyState employees={allEmployees} />
          ) : (
            <GlassCard hoverable={false} className="p-6">
              <p className="text-sm text-text-muted text-center">
                All caught up. When AI employees complete work, it lands here for your review.
              </p>
            </GlassCard>
          )
        ) : (
          <PendingList items={pendingItems} />
        )}
      </section>

      <section id="history" className="scroll-mt-6">
        <h2 className="heading-gradient text-lg font-semibold mb-3">History</h2>
        <HistoryList />
      </section>
    </div>
  );
}

interface EmployeeRef {
  id: string;
  name: string;
  roleType: string;
}

function FreshTenantEmptyState({ employees }: { employees: EmployeeRef[] }) {
  return (
    <GlassCard hoverable={false} className="p-8 text-center">
      <h2 className="font-(--font-display) text-xl font-bold tracking-tight">
        Nothing to review yet.
      </h2>
      <p className="mx-auto mt-3 max-w-md text-sm text-text-secondary">
        This is where every deliverable lands for your sign-off. Open a desk
        and chat with an employee, or browse Tasks to see who is working.
      </p>

      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link
          href="/dashboard/tasks"
          className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          Open Tasks
        </Link>
        {employees.map((emp) => {
          const hex = roleColor(emp.roleType);
          return (
            <Link
              key={emp.id}
              href={`/employees/${emp.id}`}
              className="flex items-center gap-2 rounded-xl border border-[oklch(0.85_0.01_260/0.4)] bg-white px-3.5 py-2 text-sm font-medium text-text-secondary hover:border-text hover:text-text"
            >
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: hex }}
              />
              Chat with {emp.name}
            </Link>
          );
        })}
      </div>
    </GlassCard>
  );
}
