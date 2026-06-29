import Link from "next/link";
import { eq, and, inArray, count, desc, gte } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@beast/db";
import { companies, aiEmployees, deliverables, activityLog } from "@beast/db";
import { GlassCard } from "@beast/ui";
import { roleColor, roleMeta, statusMeta, MUTED } from "@/lib/colors";

const PERFORMANCE_WINDOW_DAYS = 30;

interface Performance {
  shipped: number;
  rejected: number;
  approvalRate: number | null;
}

const ROLE_TAGLINE: Record<string, string> = {
  marketing: "Ships teardowns, posts, and cold drafts pinned to your goals.",
  sales: "Runs first-touch outreach and triages replies against pipeline targets.",
  support: "Drafts replies in your voice and digests the inbox weekly.",
};

const TEMPLATE_TIER: Record<string, { name: string; tier: string; price: string }> = {
  marketing: { name: "Alex", tier: "Starter", price: "$99/mo" },
  sales: { name: "Jordan", tier: "Team", price: "$299/mo" },
  support: { name: "Sam", tier: "Business", price: "$499/mo" },
};

export const metadata = {
  title: "Employees - Beast",
};

export default async function EmployeesIndexPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const company = await db.query.companies.findFirst({
    where: eq(companies.userId, user!.id),
    columns: { id: true },
  });

  const employees = await db.query.aiEmployees.findMany({
    where: eq(aiEmployees.companyId, company!.id),
    orderBy: (e, { asc }) => [asc(e.createdAt)],
  });

  // Per-employee review count, last-activity, and 30d performance in parallel
  const reviewCountsByEmployee = new Map<string, number>();
  const lastActivityByEmployee = new Map<string, Date>();
  const performanceByEmployee = new Map<string, Performance>();

  if (employees.length > 0) {
    const ids = employees.map((e) => e.id);
    const windowStart = new Date(
      Date.now() - PERFORMANCE_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );

    const [reviewRows, activityRows, perfRows] = await Promise.all([
      db
        .select({ id: deliverables.aiEmployeeId, value: count() })
        .from(deliverables)
        .where(
          and(
            eq(deliverables.companyId, company!.id),
            inArray(deliverables.aiEmployeeId, ids),
            inArray(deliverables.status, ["draft", "pending_review"]),
          ),
        )
        .groupBy(deliverables.aiEmployeeId),
      db
        .select({
          id: activityLog.aiEmployeeId,
          createdAt: activityLog.createdAt,
        })
        .from(activityLog)
        .where(
          and(
            eq(activityLog.companyId, company!.id),
            inArray(activityLog.aiEmployeeId, ids),
          ),
        )
        .orderBy(desc(activityLog.createdAt))
        .limit(50),
      db
        .select({
          id: deliverables.aiEmployeeId,
          status: deliverables.status,
          value: count(),
        })
        .from(deliverables)
        .where(
          and(
            eq(deliverables.companyId, company!.id),
            inArray(deliverables.aiEmployeeId, ids),
            gte(deliverables.createdAt, windowStart),
            inArray(deliverables.status, ["approved", "published", "revision", "rejected"]),
          ),
        )
        .groupBy(deliverables.aiEmployeeId, deliverables.status),
    ]);

    for (const row of reviewRows) {
      if (row.id) reviewCountsByEmployee.set(row.id, row.value);
    }
    for (const row of activityRows) {
      if (row.id && !lastActivityByEmployee.has(row.id)) {
        lastActivityByEmployee.set(row.id, row.createdAt);
      }
    }
    for (const row of perfRows) {
      if (!row.id) continue;
      const existing = performanceByEmployee.get(row.id) ?? {
        shipped: 0,
        rejected: 0,
        approvalRate: null,
      };
      const shipped = row.status === "approved" || row.status === "published"
        ? existing.shipped + row.value
        : existing.shipped;
      const rejected = row.status === "rejected"
        ? existing.rejected + row.value
        : existing.rejected;
      performanceByEmployee.set(row.id, { ...existing, shipped, rejected });
    }

    // Approval rate: approved+published vs (approved+published+revision+rejected)
    // over the same 30-day window. Rejections dilute the rate so a hire that
    // produces avoid-patterns is not flattered by the metric.
    const totalsByEmployee = new Map<string, { good: number; bad: number }>();
    for (const row of perfRows) {
      if (!row.id) continue;
      const totals = totalsByEmployee.get(row.id) ?? { good: 0, bad: 0 };
      if (row.status === "approved" || row.status === "published") {
        totals.good += row.value;
      } else if (row.status === "revision" || row.status === "rejected") {
        totals.bad += row.value;
      }
      totalsByEmployee.set(row.id, totals);
    }
    for (const [id, totals] of totalsByEmployee) {
      const denom = totals.good + totals.bad;
      const rate = denom > 0 ? totals.good / denom : null;
      const existing = performanceByEmployee.get(id) ?? {
        shipped: 0,
        rejected: 0,
        approvalRate: null,
      };
      performanceByEmployee.set(id, { ...existing, approvalRate: rate });
    }
  }

  const hiredRoles = new Set(employees.map((e) => e.roleType));
  const unhiredRoles = (["marketing", "sales", "support"] as const).filter(
    (role) => !hiredRoles.has(role),
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-(--font-display) text-3xl font-bold tracking-tight">
          Your team
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          {employees.length === 0
            ? "You have not hired any AI employees yet."
            : `${employees.length} AI ${employees.length === 1 ? "employee" : "employees"} on the team. Click any card to open their desk.`}
        </p>
      </div>

      {employees.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {employees.map((employee) => {
            const role = roleMeta(employee.roleType);
            const status = statusMeta(employee.status ?? "idle");
            const reviewCount = reviewCountsByEmployee.get(employee.id) ?? 0;
            const lastActivity = lastActivityByEmployee.get(employee.id);
            const perf = performanceByEmployee.get(employee.id);

            return (
              <Link
                key={employee.id}
                href={`/employees/${employee.id}`}
                className="block"
              >
                <GlassCard className="flex h-full flex-col p-6 transition-transform hover:-translate-y-0.5">
                  <div className="flex items-center gap-4">
                    <div
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-bold text-white"
                      style={{ backgroundColor: role.solid }}
                    >
                      {employee.name[0]}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate font-(--font-display) text-lg font-bold tracking-tight">
                        {employee.name}
                      </h2>
                      <p className="truncate text-xs text-text-secondary">
                        {employee.roleTitle}
                      </p>
                    </div>
                  </div>

                  <p className="mt-4 text-sm text-text-secondary">
                    {ROLE_TAGLINE[employee.roleType] ??
                      "Ready for your first task."}
                  </p>

                  <div className="mt-5 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: status.dot }}
                      />
                      <span className="text-text-secondary">{status.label}</span>
                    </div>
                    <span className="text-text-muted">
                      {lastActivity
                        ? `Active ${formatRelativeTime(lastActivity)}`
                        : "No activity yet"}
                    </span>
                  </div>

                  <PerformanceRow perf={perf} roleText={role.text} />

                  <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4 text-xs">
                    <span className="text-text-secondary">
                      {reviewCount > 0
                        ? `${reviewCount} ${reviewCount === 1 ? "deliverable" : "deliverables"} awaiting review`
                        : "Nothing waiting"}
                    </span>
                    <span className="font-medium text-foreground">
                      Open desk &rarr;
                    </span>
                  </div>
                </GlassCard>
              </Link>
            );
          })}
        </div>
      )}

      {unhiredRoles.length > 0 && (
        <div>
          <h2 className="font-(--font-display) text-xl font-bold tracking-tight">
            {employees.length === 0 ? "Available to hire" : "Add to your team"}
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
            {unhiredRoles.map((role) => {
              const tmpl = TEMPLATE_TIER[role]!;
              const hex = roleColor(role);
              return (
                <GlassCard
                  key={role}
                  hoverable={false}
                  className="flex flex-col p-5"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white"
                      style={{ backgroundColor: hex }}
                    >
                      {tmpl.name[0]}
                    </div>
                    <div>
                      <p className="font-(--font-display) text-base font-bold tracking-tight">
                        {tmpl.name}
                      </p>
                      <p className="text-xs text-text-muted">
                        {role.charAt(0).toUpperCase() + role.slice(1)}
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-text-secondary">
                    {ROLE_TAGLINE[role]}
                  </p>
                  <p className="mt-3 text-xs text-text-muted">
                    Available on {tmpl.tier} ({tmpl.price})
                  </p>
                  <Link
                    href="/onboarding"
                    className="mt-4 block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-center text-xs font-medium text-black hover:bg-gray-50"
                  >
                    Hire {tmpl.name}
                  </Link>
                </GlassCard>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function PerformanceRow({
  perf,
  roleText,
}: {
  perf: Performance | undefined;
  roleText: string;
}) {
  const shipped = perf?.shipped ?? 0;
  const rejected = perf?.rejected ?? 0;
  const rate = perf?.approvalRate;
  const hasData = shipped > 0 || rejected > 0 || rate !== null;

  if (!hasData) {
    return (
      <p className="mt-4 text-[11px] text-text-muted">
        No deliverables in the last 30 days.
      </p>
    );
  }

  const ratePct = rate !== null ? Math.round(rate! * 100) : null;
  const rateColor =
    ratePct === null
      ? MUTED
      : ratePct >= 80
        ? statusMeta("approved").fg
        : ratePct >= 50
          ? statusMeta("review").fg
          : statusMeta("rejected").fg;

  return (
    <div className="mt-4 flex items-center gap-4 text-[11px]">
      <Metric label="Shipped (30d)" value={String(shipped)} hex={roleText} />
      <Metric
        label="Approval"
        value={ratePct === null ? "no data" : `${ratePct}%`}
        hex={rateColor}
      />
      {rejected > 0 && (
        <Metric
          label="Rejected (30d)"
          value={String(rejected)}
          hex={statusMeta("rejected").fg}
        />
      )}
    </div>
  );
}

function Metric({ label, value, hex }: { label: string; value: string; hex: string }) {
  return (
    <div className="flex flex-col">
      <span className="font-(--font-display) text-base font-bold tracking-tight" style={{ color: hex }}>
        {value}
      </span>
      <span className="text-text-muted">{label}</span>
    </div>
  );
}

function EmptyState() {
  return (
    <GlassCard hoverable={false} className="p-10 text-center">
      <h2 className="font-(--font-display) text-xl font-bold tracking-tight">
        Hire your first AI employee.
      </h2>
      <p className="mx-auto mt-3 max-w-md text-sm text-text-secondary">
        Pick a role below or run the 90-second interview to get a recommendation.
      </p>
      <Link
        href="/onboarding"
        className="mt-6 inline-block rounded-xl bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800"
      >
        Start the interview
      </Link>
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
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}
