import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, and, desc, or, isNull, gte, notInArray } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@beast/db";
import { companies, aiEmployees, tasks, deliverables, activityLog, goals } from "@beast/db";
import { GlassCard } from "@beast/ui";
import { DeskActions } from "./_components/desk-actions";
import { CheckInFrequencyPicker } from "./_components/check-in-frequency-picker";
import { formatActivityPhrase, LOW_SIGNAL_ACTIVITY_TYPES } from "@/lib/activity-format";

const TREND_WINDOW_DAYS = 30;

interface DayBucket {
  date: Date;
  shipped: number;
  rejected: number;
}

function buildTrendBuckets(rows: Array<{ status: string; updatedAt: Date | null; createdAt: Date }>): DayBucket[] {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (TREND_WINDOW_DAYS - 1));

  const buckets: DayBucket[] = [];
  for (let i = 0; i < TREND_WINDOW_DAYS; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    buckets.push({ date: d, shipped: 0, rejected: 0 });
  }

  for (const row of rows) {
    const ts = row.updatedAt ?? row.createdAt;
    if (!ts) continue;
    const dayMs = new Date(ts);
    dayMs.setHours(0, 0, 0, 0);
    const idx = Math.floor((dayMs.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
    if (idx < 0 || idx >= TREND_WINDOW_DAYS) continue;
    const bucket = buckets[idx]!;
    if (row.status === "approved" || row.status === "published") bucket.shipped += 1;
    else if (row.status === "rejected") bucket.rejected += 1;
  }
  return buckets;
}

const TASK_STATUS: Record<string, { color: string; label: string }> = {
  pending: { color: "#9CA3AF", label: "Pending" },
  in_progress: { color: "#3B82F6", label: "Working" },
  working: { color: "#3B82F6", label: "Working" },
  review: { color: "#F59E0B", label: "Ready to review" },
  approved: { color: "#22C55E", label: "Approved" },
  completed: { color: "#22C55E", label: "Completed" },
  rejected: { color: "#DC2626", label: "Rejected" },
};

const ROLE_HOOK_LINE: Record<string, string> = {
  marketing: "Tell me a competitor and I'll start a teardown pinned to your first goal.",
  sales: "Send me a target list and I'll draft outreach pinned to your first goal.",
  support: "Forward me a ticket and I'll draft a response pinned to your first goal.",
};

const ROLE_COLORS: Record<string, string> = {
  marketing: "#E87B35",
  sales: "#3B82F6",
  support: "#22C55E",
};

const STATUS_MAP: Record<string, { color: string; label: string }> = {
  idle: { color: "#9CA3AF", label: "Idle" },
  working: { color: "#3B82F6", label: "Working" },
  waiting_review: { color: "#F59E0B", label: "Needs review" },
};

const DELIVERABLE_STATUS: Record<string, { color: string; label: string }> = {
  draft: { color: "#9CA3AF", label: "Draft" },
  review: { color: "#F59E0B", label: "Ready to review" },
  approved: { color: "#22C55E", label: "Approved" },
  published: { color: "#3B82F6", label: "Published" },
  revision: { color: "#EF4444", label: "Revision requested" },
};

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

  // Fetch employee's tasks
  const employeeTasks = await db.query.tasks.findMany({
    where: and(eq(tasks.aiEmployeeId, employee.id), eq(tasks.companyId, company!.id)),
    orderBy: [desc(tasks.createdAt)],
    limit: 20,
  });

  // Fetch employee's deliverables
  const employeeDeliverables = await db.query.deliverables.findMany({
    where: and(eq(deliverables.aiEmployeeId, employee.id), eq(deliverables.companyId, company!.id)),
    orderBy: [desc(deliverables.createdAt)],
    limit: 20,
  });

  // Fetch recent activity
  const recentActivity = await db.query.activityLog.findMany({
    where: and(
      eq(activityLog.aiEmployeeId, employee.id),
      eq(activityLog.companyId, company!.id),
      notInArray(activityLog.actionType, [...LOW_SIGNAL_ACTIVITY_TYPES]),
    ),
    orderBy: [desc(activityLog.createdAt)],
    limit: 10,
  });

  // Fetch goals this employee should reference: active goals at the company,
  // either assigned to this employee or not yet assigned (the onboarding-captured
  // goals land with aiEmployeeId=null and get implicitly owned by
  // the role-matched employee on first hire).
  const employeeGoals = await db.query.goals.findMany({
    where: and(
      eq(goals.companyId, company!.id),
      eq(goals.status, "active"),
      or(eq(goals.aiEmployeeId, employee.id), isNull(goals.aiEmployeeId)),
    ),
    orderBy: (g, { desc: d }) => [d(g.createdAt)],
  });

  // 30d outcome trend: pull every final-state deliverable for this
  // employee in the trailing 30 days, then bucket per day. Used to
  // render a small per-day strip showing shipped (green) vs rejected
  // (red) so the founder sees the cadence and recent rejection clusters
  // alongside the static 30d card.
  const trendStart = new Date(Date.now() - TREND_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const trendRows = await db
    .select({
      status: deliverables.status,
      updatedAt: deliverables.updatedAt,
      createdAt: deliverables.createdAt,
    })
    .from(deliverables)
    .where(
      and(
        eq(deliverables.aiEmployeeId, employee.id),
        eq(deliverables.companyId, company!.id),
        gte(deliverables.updatedAt, trendStart),
      ),
    );
  const trendBuckets = buildTrendBuckets(trendRows);
  const trendTotals = trendBuckets.reduce(
    (acc, b) => ({ shipped: acc.shipped + b.shipped, rejected: acc.rejected + b.rejected }),
    { shipped: 0, rejected: 0 },
  );

  const roleHex = ROLE_COLORS[employee.roleType] ?? "#9CA3AF";
  const st = STATUS_MAP[employee.status ?? "idle"] ?? STATUS_MAP.idle!;
  const completedCount = employeeTasks.filter((t) => t.status === "completed").length;
  const reviewCount = employeeDeliverables.filter((d) => d.status === "review").length;

  return (
    <div className="space-y-6">
      {/* Employee header */}
      <GlassCard hoverable={false} className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div
              className="flex h-14 w-14 items-center justify-center rounded-full text-white text-xl font-bold"
              style={{ backgroundColor: roleHex }}
            >
              {employee.name[0]}
            </div>
            <div>
              <h1 className="font-(--font-display) text-2xl font-bold tracking-tight">
                {employee.name}
              </h1>
              <p className="text-sm text-text-secondary">{employee.roleTitle}</p>
              <div className="mt-1 flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: st.color }} />
                <span className="text-xs text-text-secondary">{st.label}</span>
              </div>
            </div>
          </div>

          <DeskActions employeeId={employee.id} employeeName={employee.name} />
        </div>
      </GlassCard>

      {/* Intro panel: names goals back to the founder */}
      {employeeGoals.length > 0 && (
        <GlassCard hoverable={false} className="p-6">
          <p className="text-sm text-text-secondary mb-3">
            <span style={{ color: roleHex }} className="font-medium">
              {employee.name}
            </span>{" "}
            says hi.
          </p>
          <p className="text-sm leading-relaxed mb-3">
            Hi, I&apos;m {employee.name}.{" "}
            {employeeGoals.length === 1 ? "Your goal:" : "Your goals:"}
          </p>
          <ul className="space-y-1.5 mb-4 ml-1">
            {employeeGoals.map((g) => (
              <li key={g.id} className="text-sm leading-relaxed">
                <span className="mr-2" style={{ color: roleHex }}>
                  &bull;
                </span>
                {g.title}
                {g.targetDate && (
                  <span className="text-text-muted">
                    {" "}
                    by {formatGoalDate(g.targetDate)}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p className="text-sm text-text-secondary">
            {ROLE_HOOK_LINE[employee.roleType] ?? ROLE_HOOK_LINE.marketing}
          </p>
        </GlassCard>
      )}

      {/* Metrics row */}
      <div className="grid grid-cols-3 gap-4">
        <MetricCard label="Tasks completed" value={completedCount} />
        <MetricCard label="Awaiting review" value={reviewCount} />
        <CheckInFrequencyPicker
          employeeId={employee.id}
          initialFrequency={(employee.checkInFrequency ?? "daily") as "daily" | "weekly" | "per_task"}
        />
      </div>

      {/* 30d outcome trend */}
      {(trendTotals.shipped > 0 || trendTotals.rejected > 0) && (
        <TrendStrip
          buckets={trendBuckets}
          shipped={trendTotals.shipped}
          rejected={trendTotals.rejected}
        />
      )}

      {/* Goals */}
      {employeeGoals.length > 0 && (
        <div>
          <h2 className="heading-gradient text-lg font-semibold mb-3">Goals</h2>
          <div className="space-y-3">
            {employeeGoals.map((goal) => {
              const progressColor = goal.progressPct >= 75 ? "#22C55E" : goal.progressPct >= 40 ? "#F59E0B" : "#3B82F6";
              return (
                <GlassCard key={goal.id} hoverable={false} className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium">{goal.title}</p>
                    <span className="text-xs font-medium" style={{ color: progressColor }}>
                      {goal.progressPct}%
                    </span>
                  </div>
                  {goal.targetMetric && (
                    <p className="text-xs text-text-secondary mb-2">{goal.targetMetric}</p>
                  )}
                  <div className="h-1.5 w-full rounded-full bg-[oklch(0.9_0.01_260/0.3)]">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{ width: `${goal.progressPct}%`, backgroundColor: progressColor }}
                    />
                  </div>
                </GlassCard>
              );
            })}
          </div>
        </div>
      )}

      {/* Tasks */}
      <div>
        <h2 className="heading-gradient text-lg font-semibold mb-3">Tasks</h2>
        {employeeTasks.length > 0 ? (
          <div className="space-y-3">
            {employeeTasks.slice(0, 8).map((t) => {
              const ts = TASK_STATUS[t.status] ?? TASK_STATUS.pending!;
              return (
                <Link key={t.id} href={`/dashboard/tasks/${t.id}`}>
                  <GlassCard className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{t.title}</p>
                        <p className="text-xs text-text-secondary truncate">
                          {t.taskType.replace(/_/g, " ")} · {new Date(t.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </p>
                      </div>
                      <span
                        className="rounded-full px-2.5 py-0.5 text-xs font-medium shrink-0"
                        style={{ backgroundColor: ts.color + "15", color: ts.color }}
                      >
                        {ts.label}
                      </span>
                    </div>
                  </GlassCard>
                </Link>
              );
            })}
          </div>
        ) : (
          <GlassCard hoverable={false} className="p-4">
            <p className="text-sm text-text-muted text-center py-6">
              No tasks yet. Assign one from the chat panel or the New Task button.
            </p>
          </GlassCard>
        )}
      </div>

      {/* Deliverables */}
      <div>
        <h2 className="heading-gradient text-lg font-semibold mb-3">Deliverables</h2>
        {employeeDeliverables.length > 0 ? (
          <div className="space-y-3">
            {employeeDeliverables.slice(0, 8).map((del) => {
              const ds = DELIVERABLE_STATUS[del.status] ?? DELIVERABLE_STATUS.draft!;
              return (
                <Link key={del.id} href={`/review/${del.id}`}>
                  <GlassCard className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{del.title}</p>
                        <p className="text-xs text-text-secondary truncate">
                          {del.deliverableType.replace(/_/g, " ")} · v{del.version}
                        </p>
                      </div>
                      <span
                        className="rounded-full px-2.5 py-0.5 text-xs font-medium shrink-0"
                        style={{
                          backgroundColor: ds.color + "15",
                          color: ds.color,
                        }}
                      >
                        {ds.label}
                      </span>
                    </div>
                  </GlassCard>
                </Link>
              );
            })}
          </div>
        ) : (
          <GlassCard hoverable={false} className="p-4">
            <p className="text-sm text-text-muted text-center py-6">
              No deliverables yet. Assign a task to {employee.name} to get started.
            </p>
          </GlassCard>
        )}
      </div>

      {/* Activity */}
      <div>
        <h2 className="heading-gradient text-lg font-semibold mb-3">Recent Activity</h2>
        {recentActivity.length > 0 ? (
          <GlassCard hoverable={false} className="divide-y divide-[oklch(0.8_0.01_260/0.1)]">
            {recentActivity.map((log) => {
              const phrase = formatActivityPhrase(log.actionType, log.actionDetail as Record<string, unknown>);
              return (
                <div key={log.id} className="flex items-center gap-3 px-4 py-3">
                  <div
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: roleHex }}
                  />
                  <p className="flex-1 text-sm">
                    <span className="font-medium">{employee.name}</span>{" "}
                    {phrase}
                  </p>
                  <span className="text-xs text-text-muted">
                    {formatRelativeTime(log.createdAt)}
                  </span>
                </div>
              );
            })}
          </GlassCard>
        ) : (
          <GlassCard hoverable={false} className="p-4">
            <p className="text-sm text-text-muted text-center py-6">
              No activity yet.
            </p>
          </GlassCard>
        )}
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <GlassCard hoverable={false} className="p-4 text-center">
      <p className="font-(--font-display) text-2xl font-bold tracking-tight">{value}</p>
      <p className="mt-0.5 text-xs text-text-secondary">{label}</p>
    </GlassCard>
  );
}

function TrendStrip({
  buckets,
  shipped,
  rejected,
}: {
  buckets: DayBucket[];
  shipped: number;
  rejected: number;
}) {
  const peak = Math.max(1, ...buckets.map((b) => b.shipped + b.rejected));
  const colWidth = 8;
  const colGap = 2;
  const height = 36;
  const width = buckets.length * (colWidth + colGap) - colGap;

  return (
    <GlassCard hoverable={false} className="p-4">
      <div className="flex items-baseline justify-between mb-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          30-day outcome trend
        </p>
        <p className="text-[11px] text-text-muted">
          <span className="text-[#22C55E] font-medium">{shipped} shipped</span>
          {" / "}
          <span className="text-[#DC2626] font-medium">{rejected} rejected</span>
        </p>
      </div>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="block">
        {buckets.map((b, i) => {
          const x = i * (colWidth + colGap);
          const total = b.shipped + b.rejected;
          if (total === 0) {
            return (
              <rect
                key={i}
                x={x}
                y={height - 1}
                width={colWidth}
                height={1}
                fill="#E5E7EB"
              />
            );
          }
          const totalH = (total / peak) * height;
          const shippedH = (b.shipped / total) * totalH;
          const rejectedH = totalH - shippedH;
          return (
            <g key={i}>
              {b.rejected > 0 && (
                <rect
                  x={x}
                  y={height - rejectedH}
                  width={colWidth}
                  height={rejectedH}
                  fill="#DC2626"
                />
              )}
              {b.shipped > 0 && (
                <rect
                  x={x}
                  y={height - rejectedH - shippedH}
                  width={colWidth}
                  height={shippedH}
                  fill="#22C55E"
                />
              )}
            </g>
          );
        })}
      </svg>
      <p className="mt-2 text-[10px] text-text-muted">
        Each column is a day. Green = approved or published. Red = rejected. Empty = no activity.
      </p>
    </GlassCard>
  );
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatGoalDate(raw: string | Date): string {
  const d = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(d.getTime())) return String(raw);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
