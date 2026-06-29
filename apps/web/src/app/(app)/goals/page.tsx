import Link from "next/link";
import { eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@beast/db";
import { companies, goals, aiEmployees } from "@beast/db";
import { GlassCard } from "@beast/ui";
import { EditGoalButton } from "./_components/edit-goal-button";
import { AddGoalButton } from "./_components/add-goal-button";
import { ProgressSlider } from "./_components/progress-slider";

const STATUS_BADGE: Record<
  string,
  { color: string; bg: string; label: string }
> = {
  active: { color: "#1f6feb", bg: "#dbeafe", label: "Active" },
  paused: { color: "#92400e", bg: "#fef3c7", label: "Paused" },
  completed: { color: "#166534", bg: "#dcfce7", label: "Completed" },
};

const ROLE_COLORS: Record<string, string> = {
  marketing: "#E87B35",
  sales: "#3B82F6",
  support: "#22C55E",
};

export const metadata = {
  title: "Goals - Beast",
};

export default async function GoalsIndexPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const company = await db.query.companies.findFirst({
    where: eq(companies.userId, user!.id),
    columns: { id: true },
  });

  const [allGoals, employees] = await Promise.all([
    db.query.goals.findMany({
      where: eq(goals.companyId, company!.id),
      orderBy: (g, { desc }) => [desc(g.createdAt)],
    }),
    db.query.aiEmployees.findMany({
      where: eq(aiEmployees.companyId, company!.id),
      columns: { id: true, name: true, roleType: true },
    }),
  ]);

  const employeeById = new Map(employees.map((e) => [e.id, e]));
  const visibleGoals = allGoals.filter((g) => g.status !== "archived");
  const topLevel = visibleGoals.filter((g) => g.parentGoalId === null);
  const archivedCount = allGoals.length - visibleGoals.length;
  const subGoalsByParent = new Map<string, typeof allGoals>();
  for (const g of visibleGoals) {
    if (g.parentGoalId) {
      const arr = subGoalsByParent.get(g.parentGoalId) ?? [];
      arr.push(g);
      subGoalsByParent.set(g.parentGoalId, arr);
    }
  }

  const activeCount = topLevel.filter((g) => g.status === "active").length;

  return (
    <div className="space-y-8">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="font-(--font-display) text-3xl font-bold tracking-tight">
            Your goals
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            {topLevel.length === 0
              ? "You have not set any goals yet."
              : `${activeCount} active, ${topLevel.length} total. Sub-goals nested per top-level goal.`}
            {archivedCount > 0 && (
              <span className="ml-2 text-text-muted">
                ({archivedCount} archived hidden)
              </span>
            )}
          </p>
        </div>
        {topLevel.length > 0 && <AddGoalButton variant="header" />}
      </div>

      {topLevel.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-5">
          {topLevel.map((goal) => {
            const subs = subGoalsByParent.get(goal.id) ?? [];
            const owner = goal.aiEmployeeId
              ? employeeById.get(goal.aiEmployeeId)
              : undefined;
            return (
              <GoalCard
                key={goal.id}
                goal={goal}
                subs={subs}
                owner={owner}
                employeeById={employeeById}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

interface GoalRow {
  id: string;
  title: string;
  description: string | null;
  targetMetric: string | null;
  targetDate: string | null;
  status: string;
  progressPct: number;
  aiEmployeeId: string | null;
  parentGoalId: string | null;
  createdAt: Date;
  updatedAt: Date;
  companyId: string;
}

interface EmployeeRef {
  id: string;
  name: string;
  roleType: string;
}

function GoalCard({
  goal,
  subs,
  owner,
  employeeById,
}: {
  goal: GoalRow;
  subs: GoalRow[];
  owner: EmployeeRef | undefined;
  employeeById: Map<string, EmployeeRef>;
}) {
  const status = STATUS_BADGE[goal.status] ?? STATUS_BADGE.active!;
  const progressColor =
    goal.progressPct >= 75 ? "#22C55E" : goal.progressPct >= 40 ? "#F59E0B" : "#3B82F6";

  return (
    <GlassCard hoverable={false} className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <h2 className="font-(--font-display) text-xl font-bold tracking-tight">
              {goal.title}
            </h2>
            <span
              className="rounded-full px-2.5 py-0.5 text-xs font-medium"
              style={{ backgroundColor: status.bg, color: status.color }}
            >
              {status.label}
            </span>
            <EditGoalButton
              goal={{
                id: goal.id,
                title: goal.title,
                description: goal.description,
                targetMetric: goal.targetMetric,
                targetDate: goal.targetDate,
                status: goal.status,
              }}
            />
          </div>
          {goal.description && (
            <p className="mt-2 text-sm text-text-secondary">{goal.description}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-text-muted">
            {goal.targetMetric && (
              <span>
                <span className="font-medium text-text-secondary">Target:</span>{" "}
                {goal.targetMetric}
              </span>
            )}
            {goal.targetDate && (
              <span>
                <span className="font-medium text-text-secondary">By:</span>{" "}
                {formatGoalDate(goal.targetDate)}
              </span>
            )}
            {owner && (
              <span className="flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: ROLE_COLORS[owner.roleType] ?? "#9CA3AF" }}
                />
                <span className="font-medium text-text-secondary">Owner:</span>{" "}
                {owner.name}
              </span>
            )}
          </div>
        </div>
        <div className="text-right">
          <p className="font-(--font-display) text-2xl font-bold tracking-tight" style={{ color: progressColor }}>
            {goal.progressPct}%
          </p>
          <p className="text-xs text-text-muted">progress</p>
        </div>
      </div>

      <div className="mt-4">
        <ProgressSlider goalId={goal.id} initialPct={goal.progressPct} />
      </div>

      {subs.length > 0 && (
        <div className="mt-5 border-t border-gray-100 pt-4">
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-text-muted">
            Sub-goals
          </p>
          <div className="space-y-3">
            {subs.map((sub) => {
              const subOwner = sub.aiEmployeeId
                ? employeeById.get(sub.aiEmployeeId)
                : undefined;
              const subProgressColor =
                sub.progressPct >= 75 ? "#22C55E" : sub.progressPct >= 40 ? "#F59E0B" : "#3B82F6";
              return (
                <div
                  key={sub.id}
                  className="rounded-lg border border-gray-100 bg-white p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium">{sub.title}</p>
                    <span
                      className="text-xs font-medium"
                      style={{ color: subProgressColor }}
                    >
                      {sub.progressPct}%
                    </span>
                  </div>
                  {sub.targetMetric && (
                    <p className="mt-1 text-xs text-text-secondary">
                      {sub.targetMetric}
                    </p>
                  )}
                  <div className="mt-2">
                    <ProgressSlider goalId={sub.id} initialPct={sub.progressPct} size="compact" />
                    {subOwner && (
                      <p
                        className="mt-1 text-[11px]"
                        style={{ color: ROLE_COLORS[subOwner.roleType] ?? "#9CA3AF" }}
                      >
                        {subOwner.name}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </GlassCard>
  );
}

function EmptyState() {
  return (
    <GlassCard hoverable={false} className="p-10 text-center">
      <h2 className="font-(--font-display) text-xl font-bold tracking-tight">
        Set your first goal.
      </h2>
      <p className="mx-auto mt-3 max-w-md text-sm text-text-secondary mb-6">
        Goals tell your AI employees what to work on. Add one in 30 seconds, or
        run the 90-second interview from /onboarding to capture three at once.
      </p>
      <AddGoalButton variant="block" />
    </GlassCard>
  );
}

function formatGoalDate(raw: string | Date): string {
  const d = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(d.getTime())) return String(raw);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
