import Link from "next/link";
import { headers } from "next/headers";
import { eq, and, inArray, count, gte } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { DEMO_MODE, demoSessionIdFromHeaders } from "@/lib/demo";
import { demoWhere, withDemoOverlay } from "@/lib/demo-overlay";
import { db } from "@beast/db";
import { companies, aiEmployees, deliverables, proceduralMemories } from "@beast/db";
import { roleMeta } from "@/lib/colors";
import { Monogram } from "@/components/monogram";
import { StateChip } from "@/components/state-chip";

const PERFORMANCE_WINDOW_DAYS = 30;

const ROLE_TAGLINE: Record<string, string> = {
  marketing: "Ships teardowns, posts, and cold drafts pinned to your goals.",
  sales: "Runs first-touch outreach and triages replies against pipeline targets.",
  support: "Drafts replies in your voice and digests the inbox weekly.",
};

const OPEN_ROLE: Record<string, { name: string; roleTitle: string }> = {
  marketing: { name: "Alex", roleTitle: "Marketing Manager" },
  sales: { name: "Jordan", roleTitle: "Sales Development Rep" },
  support: { name: "Sam", roleTitle: "Support Lead" },
};

export const metadata = {
  title: "Roster - Beast",
};

export default async function EmployeesIndexPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const demoSid = DEMO_MODE ? demoSessionIdFromHeaders(await headers()) : null;

  const company = await db.query.companies.findFirst({
    where: eq(companies.userId, user!.id),
    columns: { id: true },
  });

  const employees = await db.query.aiEmployees.findMany({
    where: eq(aiEmployees.companyId, company!.id),
    orderBy: (e, { asc }) => [asc(e.createdAt)],
  });

  const windowStart = new Date(Date.now() - PERFORMANCE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const scope = demoWhere(demoSid);

  const [outcomeRowsRaw, ruleRows] = await Promise.all([
    db.query.deliverables.findMany({
      where: and(
        eq(deliverables.companyId, company!.id),
        gte(deliverables.updatedAt, windowStart),
        inArray(deliverables.status, ["accepted", "published", "revised", "rejected"]),
        scope.seedOrMine(deliverables.demoSessionId),
      ),
      columns: {
        id: true,
        aiEmployeeId: true,
        status: true,
        demoSessionId: true,
        supersedesDeliverableId: true,
      },
    }),
    db
      .select({ agentId: proceduralMemories.agentId, value: count() })
      .from(proceduralMemories)
      .where(
        and(
          eq(proceduralMemories.tenantId, company!.id),
          eq(proceduralMemories.isCurrent, true),
        ),
      )
      .groupBy(proceduralMemories.agentId),
  ]);

  const outcomeRows = withDemoOverlay(outcomeRowsRaw, demoSid);
  const shippedByEmployee = new Map<string, number>();
  const totalsByEmployee = new Map<string, { good: number; bad: number }>();
  for (const row of outcomeRows) {
    if (!row.aiEmployeeId) continue;
    const totals = totalsByEmployee.get(row.aiEmployeeId) ?? { good: 0, bad: 0 };
    // revised and rejected dilute approval so a hire producing avoid-patterns is not flattered
    if (row.status === "accepted" || row.status === "published") {
      totals.good += 1;
      shippedByEmployee.set(row.aiEmployeeId, (shippedByEmployee.get(row.aiEmployeeId) ?? 0) + 1);
    } else {
      totals.bad += 1;
    }
    totalsByEmployee.set(row.aiEmployeeId, totals);
  }
  const rulesByEmployee = new Map(ruleRows.map((r) => [r.agentId, r.value]));

  const shippedTotal = [...shippedByEmployee.values()].reduce((a, b) => a + b, 0);
  const rulesTotal = [...rulesByEmployee.values()].reduce((a, b) => a + b, 0);

  const hiredRoles = new Set(employees.map((e) => e.roleType));
  const unhiredRoles = (["marketing", "sales", "support"] as const).filter(
    (role) => !hiredRoles.has(role),
  );

  return (
    <div className="mx-auto max-w-6xl">
      <header className="rule-b pb-4">
        <h1 className="display text-3xl">Roster</h1>
        <p className="spec mt-1.5 text-ink-muted">
          {employees.length} of 3 roles filled · {shippedTotal} shipped 30d · {rulesTotal} standing
          rule{rulesTotal === 1 ? "" : "s"}
        </p>
      </header>

      {employees.length === 0 ? (
        <section aria-label="Empty roster" className="panel-tinted mt-5 p-6">
          <p className="spec-label">Roster empty</p>
          <h2 className="mt-2 text-lg font-bold">No one on the roster.</h2>
          <p className="mt-1.5 max-w-xl text-[13.5px] leading-relaxed text-ink-secondary">
            The company runs on three roles: marketing, sales, support. Hire one, brief a job, and
            the deliverable comes back through your review tray.
          </p>
          <Link
            href="/hire"
            className="btn-identity mt-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            Open hiring
          </Link>
        </section>
      ) : (
        <section aria-label="Personnel index" className="mt-5">
          <ul>
            {employees.map((employee, i) => {
              const role = roleMeta(employee.roleType);
              const shipped = shippedByEmployee.get(employee.id) ?? 0;
              const totals = totalsByEmployee.get(employee.id);
              const denom = (totals?.good ?? 0) + (totals?.bad ?? 0);
              const approval = denom > 0 ? `${Math.round(((totals?.good ?? 0) / denom) * 100)}%` : "—";
              const ruleCount = rulesByEmployee.get(employee.id) ?? 0;
              return (
                <li key={employee.id} className="hairline-b last:border-b-0">
                  <Link
                    href={`/employees/${employee.id}`}
                    className="flex items-center gap-4 px-1 py-4 transition-colors hover:bg-panel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                  >
                    <span className="spec hidden w-6 shrink-0 text-ink-muted sm:block">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="flex shrink-0 flex-col items-center gap-1">
                      <Monogram name={employee.name} roleType={employee.roleType} size="xl" />
                      <span className="spec text-ink-muted">{role.solid}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="display block text-xl">{employee.name}</span>
                      <span className="mt-0.5 block text-[13px] text-ink-secondary">
                        {employee.roleTitle}
                      </span>
                      <span className="spec mt-1.5 block text-ink-muted">
                        {shipped} shipped 30d · {approval} approval · {ruleCount} rule
                        {ruleCount === 1 ? "" : "s"}
                      </span>
                    </span>
                    <StateChip status={employee.status ?? "idle"} className="shrink-0" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {employees.length > 0 && unhiredRoles.length > 0 && (
        <section aria-label="Open roles" className="mt-6">
          <div className="rule-t flex items-baseline justify-between pt-2.5">
            <h2 className="text-[15px] font-semibold">Open roles</h2>
            <Link
              href="/hire"
              className="spec-label transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              Hiring
            </Link>
          </div>
          <ul>
            {unhiredRoles.map((roleType) => {
              const open = OPEN_ROLE[roleType]!;
              return (
                <li key={roleType} className="hairline-b last:border-b-0">
                  <Link
                    href="/hire"
                    className="flex items-center gap-4 px-1 py-3.5 transition-colors hover:bg-panel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                  >
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[2px] border border-hairline font-mono text-[12px] uppercase"
                      style={{ color: roleMeta(roleType).solid }}
                    >
                      {open.name.slice(0, 2)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-semibold">
                        {open.name} · {open.roleTitle}
                      </span>
                      <span className="block truncate text-[12.5px] text-ink-secondary">
                        {ROLE_TAGLINE[roleType]}
                      </span>
                    </span>
                    <span className="spec-label shrink-0">Open application</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
