import { eq, and, isNotNull, inArray, sql } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db, companies, tasks, aiEmployees } from "@beast/db";
import { RecurringShell, type RecurringEmployee, type RecurringTaskRow } from "./_components/recurring-shell";

export const metadata = {
  title: "Recurring tasks - Beast",
};

export default async function RecurringTasksPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const company = await db.query.companies.findFirst({
    where: eq(companies.userId, user!.id),
    columns: { id: true, timezone: true },
  });

  const [recurringRows, employeeRows] = await Promise.all([
    db.query.tasks.findMany({
      where: and(
        eq(tasks.companyId, company!.id),
        isNotNull(tasks.recurrence),
      ),
      orderBy: (t, { desc }) => [desc(t.createdAt)],
    }),
    db.query.aiEmployees.findMany({
      where: eq(aiEmployees.companyId, company!.id),
      columns: { id: true, name: true, roleType: true },
    }),
  ]);

  const templateIds = recurringRows.map((t) => t.id);
  const spawnRows = templateIds.length === 0
    ? []
    : await db
        .select({
          parentTaskId: tasks.parentTaskId,
          count: sql<number>`count(*)::int`,
          lastSpawnedAt: sql<Date | null>`max(${tasks.createdAt})`,
        })
        .from(tasks)
        .where(inArray(tasks.parentTaskId, templateIds))
        .groupBy(tasks.parentTaskId);

  const spawnByTemplate = new Map<string, { count: number; lastSpawnedAt: string | null }>();
  for (const r of spawnRows) {
    if (!r.parentTaskId) continue;
    spawnByTemplate.set(r.parentTaskId, {
      count: r.count,
      lastSpawnedAt: r.lastSpawnedAt instanceof Date
        ? r.lastSpawnedAt.toISOString()
        : (r.lastSpawnedAt ?? null),
    });
  }

  const employees: RecurringEmployee[] = employeeRows.map((e) => ({
    id: e.id,
    name: e.name,
    roleType: e.roleType,
  }));

  const rows: RecurringTaskRow[] = recurringRows.map((t) => {
    const config = (t.recurrence as Record<string, unknown> | null) ?? {};
    const frequency = typeof config.frequency === "string" ? config.frequency : "weekly";
    const dayOfWeek = typeof config.dayOfWeek === "number" ? config.dayOfWeek : null;
    const dayOfMonth = typeof config.dayOfMonth === "number" ? config.dayOfMonth : null;
    const hour = typeof config.hour === "number" ? config.hour : 9;
    const minute = typeof config.minute === "number" ? config.minute : 0;
    const nextOccurrenceAt = typeof config.nextOccurrenceAt === "string"
      ? config.nextOccurrenceAt
      : null;
    const employeeName = employeeRows.find((e) => e.id === t.aiEmployeeId)?.name ?? "AI Employee";
    const employeeRoleType = employeeRows.find((e) => e.id === t.aiEmployeeId)?.roleType ?? "marketing";
    const spawn = spawnByTemplate.get(t.id);
    return {
      id: t.id,
      title: t.title,
      taskType: t.taskType,
      employeeId: t.aiEmployeeId,
      employeeName,
      employeeRoleType,
      frequency,
      dayOfWeek,
      dayOfMonth,
      hour,
      minute,
      nextOccurrenceAt,
      instanceCount: spawn?.count ?? 0,
      lastSpawnedAt: spawn?.lastSpawnedAt ?? null,
    };
  });

  // Sort by next-occurrence ascending so the schedule about to fire sits
  // at the top. nextOccurrenceAt lives in the recurrence JSONB so sorting
  // at the SQL layer needs a JSONB cast; in-memory after the map is
  // simpler and per-row data is already shaped. Templates with no
  // nextOccurrenceAt (never advanced past creation, or recurrence config
  // missing the field) sink to the bottom in creation order so a fresh
  // template lands visibly without overriding the "soonest" surface.
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
