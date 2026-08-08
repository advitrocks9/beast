import Link from "next/link";
import { headers } from "next/headers";
import { eq, and, desc, inArray } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { DEMO_MODE, demoSessionIdFromHeaders } from "@/lib/demo";
import { demoWhere } from "@/lib/demo-overlay";
import { db } from "@beast/db";
import { companies, tasks, aiEmployees } from "@beast/db";
import { TasksList, type TaskRow, type TaskSection } from "./_components/tasks-list";

export const metadata = { title: "Jobs" };

const GROUPS = [
  {
    key: "press",
    title: "On the press",
    statuses: ["running", "revising"],
    teach: "Press is idle. Commission a job from the office and watch it print here.",
  },
  {
    key: "waiting",
    title: "Waiting on you",
    statuses: ["plan_review", "in_review"],
    teach: "Nothing waiting on your sign-off.",
  },
  {
    key: "queued",
    title: "Queued",
    statuses: ["queued", "planning"],
    teach: "Queue is clear. The orchestrator picks up recurring work on its own.",
  },
  {
    key: "history",
    title: "Done / failed",
    statuses: ["accepted", "published", "rejected", "failed", "timed_out", "cancelled"],
    teach: "No filed jobs yet. Accepted and failed work lands here as the company record.",
  },
] as const;

type GroupKey = (typeof GROUPS)[number]["key"];
type Filter = "all" | GroupKey;

const VALID_FILTERS: readonly Filter[] = ["all", "press", "waiting", "queued", "history"];
const IN_FLIGHT_STATUSES = new Set(["queued", "planning", "plan_review", "running", "revising"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function when(d: Date): string {
  const m = Math.floor((Date.now() - d.getTime()) / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface PageProps {
  searchParams: Promise<{ filter?: string; parent?: string }>;
}

export default async function TasksIndexPage({ searchParams }: PageProps) {
  const { filter: filterParam, parent: parentParam } = await searchParams;
  const filter: Filter = (VALID_FILTERS as readonly string[]).includes(filterParam ?? "")
    ? (filterParam as Filter)
    : "all";
  const parentId = parentParam && UUID_RE.test(parentParam) ? parentParam : null;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const company = await db.query.companies.findFirst({
    where: eq(companies.userId, user!.id),
    columns: { id: true },
  });

  const demoSid = DEMO_MODE ? demoSessionIdFromHeaders(await headers()) : null;
  const scope = demoWhere(demoSid);

  const baseConditions = [
    eq(tasks.companyId, company!.id),
    scope.seedOrMine(tasks.demoSessionId),
  ];
  if (parentId) baseConditions.push(eq(tasks.parentTaskId, parentId));

  const rowConditions = [...baseConditions];
  for (const g of GROUPS) {
    if (g.key === filter) rowConditions.push(inArray(tasks.status, [...g.statuses]));
  }

  const [taskRows, statusRows, employees, parentTask] = await Promise.all([
    db.query.tasks.findMany({
      where: and(...rowConditions),
      orderBy: [desc(tasks.createdAt)],
      limit: 80,
    }),
    db.query.tasks.findMany({
      where: and(...baseConditions),
      columns: { status: true },
    }),
    db.query.aiEmployees.findMany({
      where: eq(aiEmployees.companyId, company!.id),
      columns: { id: true, name: true, roleType: true },
    }),
    parentId
      ? db.query.tasks.findFirst({
          where: and(eq(tasks.id, parentId), eq(tasks.companyId, company!.id)),
          columns: { id: true, title: true },
        })
      : Promise.resolve(null),
  ]);

  const employeeById = new Map(employees.map((e) => [e.id, e]));

  const counts: Record<Filter, number> = {
    all: statusRows.length,
    press: 0,
    waiting: 0,
    queued: 0,
    history: 0,
  };
  for (const t of statusRows) {
    for (const g of GROUPS) {
      if ((g.statuses as readonly string[]).includes(t.status)) counts[g.key] += 1;
    }
  }

  const toRow = (t: (typeof taskRows)[number]): TaskRow => {
    const emp = employeeById.get(t.aiEmployeeId);
    return {
      id: t.id,
      title: t.title,
      taskType: t.taskType.replace(/_/g, " "),
      status: t.status,
      when: when(t.createdAt),
      employeeName: emp?.name ?? "Employee",
      employeeRole: emp?.roleType ?? null,
      live: t.demoSessionId !== null,
      inFlight: IN_FLIGHT_STATUSES.has(t.status),
    };
  };

  const sections: TaskSection[] = GROUPS.filter((g) => filter === "all" || g.key === filter).map(
    (g) => ({
      key: g.key,
      title: g.title,
      teach: g.teach,
      count: counts[g.key],
      collapsed: filter === "all" && g.key === "history",
      rows: taskRows
        .filter((t) => (g.statuses as readonly string[]).includes(t.status))
        .map(toRow),
    }),
  );

  const waitingCount = counts.waiting;

  return (
    <div className="mx-auto max-w-4xl">
      <header className="rule-b pb-4">
        <h1 className="display text-3xl">Jobs</h1>
        <p className="spec mt-1.5 text-ink-muted">
          {counts.all} on the docket · {counts.press} on the press · {waitingCount} waiting on you
        </p>
      </header>

      {parentTask && (
        <div className="hairline-b flex flex-wrap items-baseline justify-between gap-2 py-2.5" role="status">
          <span className="spec text-ink-secondary">
            instances of <span className="font-semibold text-ink">{parentTask.title}</span>
          </span>
          <Link
            href={filter === "all" ? "/dashboard/tasks" : `/dashboard/tasks?filter=${filter}`}
            className="spec-label transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            Show all jobs
          </Link>
        </div>
      )}

      <nav aria-label="Filter jobs" className="hairline-b mt-3 flex gap-1 overflow-x-auto">
        <FilterTab filter="all" label="All" count={counts.all} active={filter === "all"} parent={parentId} />
        {GROUPS.map((g) => (
          <FilterTab
            key={g.key}
            filter={g.key}
            label={g.title}
            count={counts[g.key]}
            active={filter === g.key}
            parent={parentId}
          />
        ))}
      </nav>

      {counts.all === 0 ? (
        parentTask ? (
          <p className="mt-4 text-[13.5px] text-ink-secondary">
            No instances yet. The orchestrator spawns one on the schedule&apos;s next-run time.
          </p>
        ) : (
          <EmptyDocket />
        )
      ) : (
        <TasksList sections={sections} />
      )}
    </div>
  );
}

function FilterTab({
  filter,
  label,
  count,
  active,
  parent,
}: {
  filter: Filter;
  label: string;
  count: number;
  active: boolean;
  parent: string | null;
}) {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("filter", filter);
  if (parent) params.set("parent", parent);
  const qs = params.toString();
  return (
    <Link
      href={qs ? `/dashboard/tasks?${qs}` : "/dashboard/tasks"}
      aria-current={active ? "page" : undefined}
      className={`-mb-px whitespace-nowrap px-3 py-2 text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
        active
          ? "border-b-2 border-ink font-semibold text-ink"
          : "text-ink-secondary hover:text-ink"
      }`}
    >
      {label}
      <span className="spec ml-1.5 text-ink-muted">{count}</span>
    </Link>
  );
}

const EXAMPLE_BRIEFS = [
  { role: "marketing", example: "Draft a tweet about our latest launch with one strong hook." },
  { role: "sales", example: "Research three competitors and file a one-page teardown." },
  { role: "support", example: "Write a calm canned response for refund requests over $200." },
];

function EmptyDocket() {
  return (
    <div className="mt-5 max-w-lg">
      <h2 className="text-[15px] font-semibold">The docket is empty.</h2>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-secondary">
        Commission a job and it stamps through the stations: queued, on the press, your review.
        Accepted work files back here as the company record.
      </p>
      <ul className="mt-4">
        {EXAMPLE_BRIEFS.map((ex) => (
          <li key={ex.role} className="hairline-b flex items-baseline gap-3 py-2 last:border-b-0">
            <span className="spec-label w-20 shrink-0">{ex.role}</span>
            <span className="text-[13px] text-ink-secondary">&ldquo;{ex.example}&rdquo;</span>
          </li>
        ))}
      </ul>
      <Link
        href="/dashboard"
        className="btn-ink mt-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        Commission from the office
      </Link>
    </div>
  );
}
