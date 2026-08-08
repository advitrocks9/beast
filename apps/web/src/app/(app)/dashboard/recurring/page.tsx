import { headers } from "next/headers";
import { eq, and, isNotNull, inArray, desc, sql } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { DEMO_MODE, demoSessionIdFromHeaders } from "@/lib/demo";
import { demoWhere } from "@/lib/demo-overlay";
import { db, companies, tasks, aiEmployees } from "@beast/db";
import { RecurringShell, type RecurringEmployee, type RecurringTaskRow } from "./_components/recurring-shell";

export const metadata = { title: "Recurring" };

export default async function RecurringTasksPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const demoSid = DEMO_MODE ? demoSessionIdFromHeaders(await headers()) : null;
  const scope = demoWhere(demoSid);

  const company = await db.query.companies.findFirst({
    where: eq(companies.userId, user!.id),
    columns: { id: true, timezone: true },
  });

  const [recurringRows, employeeRows] = await Promise.all([
    db.query.tasks.findMany({
      where: and(
        eq(tasks.companyId, company!.id),
        isNotNull(tasks.recurrence),
        scope.seedOrMine(tasks.demoSessionId),
      ),
      orderBy: (t, { desc: d }) => [d(t.createdAt)],
    }),
    db.query.aiEmployees.findMany({
      where: eq(aiEmployees.companyId, company!.id),
      columns: { id: true, name: true, roleType: true },
    }),
  ]);

  const templateIds = recurringRows.map((t) => t.id);
  const [countRows, instanceRows] = templateIds.length === 0
    ? [[], []]
    : await Promise.all([
        db
          .select({
            parentTaskId: tasks.parentTaskId,
            count: sql<number>`count(*)::int`,
          })
          .from(tasks)
          .where(
            and(
              inArray(tasks.parentTaskId, templateIds),
              scope.seedOrMine(tasks.demoSessionId),
            ),
          )
          .groupBy(tasks.parentTaskId),
        db.query.tasks.findMany({
          where: and(
            inArray(tasks.parentTaskId, templateIds),
            scope.seedOrMine(tasks.demoSessionId),
          ),
          columns: { parentTaskId: true, status: true, createdAt: true },
          orderBy: [desc(tasks.createdAt)],
          limit: 200,
        }),
      ]);

  const countByTemplate = new Map<string, number>();
  for (const r of countRows) {
    if (r.parentTaskId) countByTemplate.set(r.parentTaskId, r.count);
  }
  const lastByTemplate = new Map<string, { status: string; createdAt: Date }>();
  for (const r of instanceRows) {
    if (r.parentTaskId && !lastByTemplate.has(r.parentTaskId)) {
      lastByTemplate.set(r.parentTaskId, { status: r.status, createdAt: r.createdAt });
    }
  }

  const employees: RecurringEmployee[] = employeeRows.map((e) => ({
    id: e.id,
    name: e.name,
    roleType: e.roleType,
  }));
  const employeeById = new Map(employeeRows.map((e) => [e.id, e]));

  const rows: RecurringTaskRow[] = recurringRows.map((t) => {
    const config = (t.recurrence as Record<string, unknown> | null) ?? {};
    const emp = employeeById.get(t.aiEmployeeId);
    const last = lastByTemplate.get(t.id);
    return {
      id: t.id,
      title: t.title,
      taskType: t.taskType,
      employeeName: emp?.name ?? "Employee",
      employeeRoleType: emp?.roleType ?? "marketing",
      frequency: typeof config.frequency === "string" ? config.frequency : "weekly",
      dayOfWeek: typeof config.dayOfWeek === "number" ? config.dayOfWeek : null,
      dayOfMonth: typeof config.dayOfMonth === "number" ? config.dayOfMonth : null,
      hour: typeof config.hour === "number" ? config.hour : 9,
      minute: typeof config.minute === "number" ? config.minute : 0,
      nextOccurrenceAt: typeof config.nextOccurrenceAt === "string" ? config.nextOccurrenceAt : null,
      instanceCount: countByTemplate.get(t.id) ?? 0,
      lastInstanceStatus: last?.status ?? null,
      lastInstanceAt: last?.createdAt.toISOString() ?? null,
      live: t.demoSessionId !== null,
    };
  });

  // nextOccurrenceAt lives in the recurrence jsonb; sorting in memory beats a
  // jsonb cast at the SQL layer. Schedules with no next-run sink to the bottom.
  rows.sort((a, b) => {
    const aTs = a.nextOccurrenceAt ? new Date(a.nextOccurrenceAt).getTime() : Number.POSITIVE_INFINITY;
    const bTs = b.nextOccurrenceAt ? new Date(b.nextOccurrenceAt).getTime() : Number.POSITIVE_INFINITY;
    return aTs - bTs;
  });

  return (
    <RecurringShell
      rows={rows}
      employees={employees}
      timezone={company!.timezone ?? "UTC"}
    />
  );
}
