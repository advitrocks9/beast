import { eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@beast/db";
import { companies, goals, aiEmployees } from "@beast/db";
import { Monogram } from "@/components/monogram";
import { EditGoalButton } from "./_components/edit-goal-button";
import { AddGoalButton } from "./_components/add-goal-button";
import { ProgressSlider } from "./_components/progress-slider";

export const metadata = {
  title: "Goals - Beast",
};

const STATUS_CHIP: Record<string, { label: string; style: React.CSSProperties }> = {
  active: { label: "Active", style: { borderColor: "var(--color-ink)", color: "var(--color-ink)" } },
  paused: { label: "Paused", style: { borderColor: "var(--color-ink-muted)", color: "var(--color-ink-muted)" } },
  completed: { label: "Met", style: { backgroundColor: "var(--color-state-accepted)", color: "#fff" } },
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
    <div className="mx-auto max-w-4xl">
      <header className="rule-b flex flex-wrap items-end justify-between gap-3 pb-4">
        <div>
          <h1 className="display text-3xl">Goals</h1>
          <p className="spec mt-1.5 text-ink-muted">
            {topLevel.length === 0
              ? "no targets set"
              : `${activeCount} active · ${topLevel.length} target${topLevel.length === 1 ? "" : "s"}`}
            {archivedCount > 0 && ` · ${archivedCount} archived hidden`}
          </p>
        </div>
        {topLevel.length > 0 && <AddGoalButton />}
      </header>

      {topLevel.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="mt-5 space-y-7">
          {topLevel.map((goal) => {
            const subs = subGoalsByParent.get(goal.id) ?? [];
            const owner = goal.aiEmployeeId ? employeeById.get(goal.aiEmployeeId) : undefined;
            return <GoalSection key={goal.id} goal={goal} subs={subs} owner={owner} employeeById={employeeById} />;
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
}

interface EmployeeRef {
  id: string;
  name: string;
  roleType: string;
}

function GoalStatusChip({ status }: { status: string }) {
  const chip = STATUS_CHIP[status] ?? STATUS_CHIP.paused!;
  return (
    <span className="chip" style={chip.style}>
      {chip.label}
    </span>
  );
}

function GoalSection({
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
  return (
    <section aria-label={goal.title} className="rule-t pt-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-[17px] leading-tight font-semibold">{goal.title}</h2>
            <GoalStatusChip status={goal.status} />
          </div>
          {goal.description && (
            <p className="mt-1.5 text-[13px] leading-snug text-ink-secondary">{goal.description}</p>
          )}
          <p className="spec mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-ink-muted">
            {goal.targetMetric && <span>target {goal.targetMetric}</span>}
            {goal.targetMetric && goal.targetDate && <span aria-hidden>·</span>}
            {goal.targetDate && <span>by {formatGoalDate(goal.targetDate)}</span>}
            {owner && (
              <>
                {(goal.targetMetric || goal.targetDate) && <span aria-hidden>·</span>}
                <span className="inline-flex items-center gap-1.5">
                  <Monogram name={owner.name} roleType={owner.roleType} size="sm" className="h-4 w-4 text-[8px]" />
                  {owner.name}
                </span>
              </>
            )}
          </p>
        </div>
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

      <div className="mt-3">
        <ProgressSlider goalId={goal.id} initialPct={goal.progressPct} />
      </div>

      {subs.length > 0 && (
        <div className="mt-4">
          <p className="spec-label">Sub-goals</p>
          <ul className="mt-1">
            {subs.map((sub) => {
              const subOwner = sub.aiEmployeeId ? employeeById.get(sub.aiEmployeeId) : undefined;
              return (
                <li key={sub.id} className="hairline-t py-2.5 first:border-t-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 text-[13.5px] font-medium">{sub.title}</p>
                    {subOwner && <span className="spec shrink-0 text-ink-muted">{subOwner.name}</span>}
                  </div>
                  {sub.targetMetric && (
                    <p className="spec mt-0.5 text-ink-muted">target {sub.targetMetric}</p>
                  )}
                  <div className="mt-1.5">
                    <ProgressSlider goalId={sub.id} initialPct={sub.progressPct} size="compact" />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

function EmptyState() {
  return (
    <div className="panel-tinted mt-5 p-8">
      <h2 className="text-[17px] font-semibold">Set the first target.</h2>
      <p className="mt-2 max-w-md text-[13px] leading-snug text-ink-secondary">
        Goals are the targets your roster works against: jobs get briefed toward them and progress
        is reviewed like everything else. Add one, or run the 90-second interview from /onboarding
        to capture three at once.
      </p>
      <div className="mt-4">
        <AddGoalButton first />
      </div>
    </div>
  );
}

function formatGoalDate(raw: string | Date): string {
  const d = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(d.getTime())) return String(raw);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
