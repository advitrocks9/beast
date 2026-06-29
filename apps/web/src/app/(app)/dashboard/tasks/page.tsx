import Link from "next/link";
import { eq, and, desc, inArray } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@beast/db";
import { companies, tasks, aiEmployees } from "@beast/db";
import { GlassCard } from "@beast/ui";
import { roleColor, statusMeta, BRAND, BRAND_LIGHT, BRAND_DEEP } from "@/lib/colors";
import { TasksList, type TaskRow } from "./_components/tasks-list";

const STATUS_GROUPS: Record<string, { label: string; statuses: string[]; status: string }> = {
  in_flight: { label: "In flight", statuses: ["pending", "in_progress", "working"], status: "working" },
  ready: { label: "Ready to review", statuses: ["review"], status: "review" },
  done: { label: "Done", statuses: ["approved", "completed"], status: "approved" },
  rejected: { label: "Rejected", statuses: ["rejected"], status: "rejected" },
};

// Pill copy that intentionally diverges from the statusMeta default label; the
// color always comes from statusMeta().
const STATUS_LABELS: Record<string, string> = {
  in_progress: "Working",
  review: "Ready",
};

const VALID_FILTERS = ["all", "in_flight", "ready", "done", "rejected"] as const;
type Filter = (typeof VALID_FILTERS)[number];

interface PageProps {
  searchParams: Promise<{ filter?: string; parent?: string }>;
}

export default async function TasksIndexPage({ searchParams }: PageProps) {
  const { filter: filterParam, parent: parentParam } = await searchParams;
  const filter: Filter = (VALID_FILTERS as readonly string[]).includes(filterParam ?? "")
    ? (filterParam as Filter)
    : "all";
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const parentId = parentParam && UUID_RE.test(parentParam) ? parentParam : null;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const company = await db.query.companies.findFirst({
    where: eq(companies.userId, user!.id),
    columns: { id: true },
  });

  const conditions = [eq(tasks.companyId, company!.id)];
  if (filter !== "all") {
    const group = STATUS_GROUPS[filter];
    if (group) conditions.push(inArray(tasks.status, group.statuses));
  }
  if (parentId) {
    conditions.push(eq(tasks.parentTaskId, parentId));
  }

  // Resolve the recurring template's title for the scope banner copy. The
  // parent could also be a non-recurring chain root, but recurring is the
  // primary use case from /dashboard/recurring rows.
  const parentTask = parentId
    ? await db.query.tasks.findFirst({
        where: and(eq(tasks.id, parentId), eq(tasks.companyId, company!.id)),
        columns: { id: true, title: true },
      })
    : null;

  const taskRows = await db.query.tasks.findMany({
    where: and(...conditions),
    orderBy: [desc(tasks.createdAt)],
    limit: 50,
  });

  const allEmployees = await db.query.aiEmployees.findMany({
    where: eq(aiEmployees.companyId, company!.id),
    columns: { id: true, name: true, roleType: true, roleTitle: true },
  });
  const employeeMap = new Map(allEmployees.map((e) => [e.id, e]));

  // Group counts (computed once for the chips bar). Honor the parent
  // scope so the chip counts match what the founder is actually filtering
  // on, not the full company.
  const countWhere = parentId
    ? and(eq(tasks.companyId, company!.id), eq(tasks.parentTaskId, parentId))
    : eq(tasks.companyId, company!.id);
  const allTasks = await db.query.tasks.findMany({
    where: countWhere,
    columns: { status: true },
  });
  const groupCounts: Record<Filter, number> = {
    all: allTasks.length,
    in_flight: 0,
    ready: 0,
    done: 0,
    rejected: 0,
  };
  for (const t of allTasks) {
    for (const [k, group] of Object.entries(STATUS_GROUPS)) {
      if (group.statuses.includes(t.status)) {
        groupCounts[k as Filter] = (groupCounts[k as Filter] ?? 0) + 1;
      }
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-(--font-display) text-2xl font-bold tracking-tight">Tasks</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Every task your team has run. Click a row to open the run state and reasoning trail.
        </p>
      </div>

      {parentId && (
        <div
          className="flex items-center justify-between gap-3 rounded-xl border border-[oklch(0.85_0.05_260/0.4)] bg-[oklch(0.97_0.01_260/0.5)] px-4 py-2.5 text-xs"
          role="status"
        >
          <span>
            Scoped to runs of{" "}
            <span className="font-semibold">
              {parentTask?.title ?? "an unknown template"}
            </span>
            .
          </span>
          <Link
            href={filter === "all" ? "/dashboard/tasks" : `/dashboard/tasks?filter=${filter}`}
            className="font-medium text-text-secondary underline-offset-2 hover:underline"
          >
            Show all tasks
          </Link>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <FilterChip filter="all" label="All" count={groupCounts.all} active={filter === "all"} parent={parentId} />
        {Object.entries(STATUS_GROUPS).map(([key, group]) => {
          const m = statusMeta(group.status);
          return (
            <FilterChip
              key={key}
              filter={key as Filter}
              label={group.label}
              count={groupCounts[key as Filter]}
              active={filter === key}
              tone={{ bg: m.bg, fg: m.fg, border: m.dot }}
              parent={parentId}
            />
          );
        })}
      </div>

      {taskRows.length === 0 ? (
        filter === "all" ? (
          <EmptyState employees={allEmployees} />
        ) : (
          <GlassCard hoverable={false} className="p-8">
            <p className="text-sm text-text-muted text-center">
              Nothing in this state right now.
            </p>
          </GlassCard>
        )
      ) : (
        <TasksList rows={serializeRows(taskRows, employeeMap)} />
      )}
    </div>
  );
}

interface EmployeeRef {
  id: string;
  name: string;
  roleType: string;
  roleTitle?: string | null;
}

const IN_FLIGHT_STATUSES = new Set(["pending", "in_progress", "working", "planned"]);

function serializeRows(
  taskRows: Array<{
    id: string;
    title: string;
    taskType: string;
    status: string;
    aiEmployeeId: string;
    createdAt: Date;
  }>,
  employeeMap: Map<string, EmployeeRef>,
): TaskRow[] {
  return taskRows.map((t) => {
    const emp = employeeMap.get(t.aiEmployeeId);
    const status = statusMeta(t.status);
    return {
      id: t.id,
      title: t.title,
      taskType: t.taskType,
      status: t.status,
      statusLabel: STATUS_LABELS[t.status] ?? status.label,
      statusColor: status.dot,
      createdAt: t.createdAt.toISOString(),
      employeeName: emp?.name ?? "Unknown",
      employeeInitial: emp?.name?.[0] ?? "?",
      employeeColor: roleColor(emp?.roleType),
      inFlight: IN_FLIGHT_STATUSES.has(t.status),
    };
  });
}

const EMPTY_STATE_EXAMPLES: Array<{ role: string; example: string }> = [
  { role: "marketing", example: "Draft a tweet about our latest launch with one strong hook." },
  { role: "sales", example: "Research three competitors of ours and send me a one-page teardown." },
  { role: "support", example: "Write a calm canned response for refund requests over $200." },
];

function EmptyState({ employees }: { employees: EmployeeRef[] }) {
  return (
    <GlassCard hoverable={false} className="p-8 text-center">
      <h2 className="font-(--font-display) text-xl font-bold tracking-tight">
        Tell someone what to do.
      </h2>
      <p className="mx-auto mt-3 max-w-md text-sm text-text-secondary">
        Tasks land here once you assign work. Open a desk and chat, or use the
        New Task form for richer briefs.
      </p>

      {employees.length > 0 ? (
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {employees.map((emp) => {
            const hex = roleColor(emp.roleType);
            return (
              <Link
                key={emp.id}
                href={`/employees/${emp.id}`}
                className="flex items-center gap-2 rounded-full border border-[oklch(0.85_0.01_260/0.4)] bg-white px-3.5 py-1.5 text-xs font-medium text-text-secondary hover:border-text hover:text-text"
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
      ) : (
        <Link
          href="/hire"
          className="mt-6 inline-block rounded-xl bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800"
        >
          Hire your first AI employee
        </Link>
      )}

      <div className="mt-8 mx-auto max-w-md text-left">
        <p className="text-[11px] font-medium uppercase tracking-wider text-text-muted mb-2">
          Try one of these
        </p>
        <ul className="space-y-1.5">
          {EMPTY_STATE_EXAMPLES.map((ex) => (
            <li
              key={ex.role}
              className="rounded-xl border border-[oklch(0.85_0.01_260/0.3)] bg-white px-3.5 py-2 text-xs text-text-secondary"
            >
              <span
                className="mr-2 inline-block h-1.5 w-1.5 rounded-full align-middle"
                style={{ backgroundColor: roleColor(ex.role) }}
              />
              &ldquo;{ex.example}&rdquo;
            </li>
          ))}
        </ul>
      </div>
    </GlassCard>
  );
}

function FilterChip({
  filter,
  label,
  count,
  active,
  tone,
  parent,
}: {
  filter: Filter;
  label: string;
  count: number;
  active: boolean;
  tone?: { bg: string; fg: string; border: string };
  parent?: string | null;
}) {
  const t = tone ?? { bg: BRAND_LIGHT, fg: BRAND_DEEP, border: BRAND };
  const params = new URLSearchParams();
  if (filter !== "all") params.set("filter", filter);
  if (parent) params.set("parent", parent);
  const qs = params.toString();
  const href = qs ? `/dashboard/tasks?${qs}` : "/dashboard/tasks";
  return (
    <Link
      href={href}
      className="rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
      style={{
        backgroundColor: active ? t.bg : "white",
        borderColor: active ? t.border : "oklch(0.85 0.01 260 / 0.4)",
        color: active ? t.fg : "var(--color-text-secondary)",
      }}
    >
      {label}
      <span className="ml-1.5 text-text-muted">({count})</span>
    </Link>
  );
}
