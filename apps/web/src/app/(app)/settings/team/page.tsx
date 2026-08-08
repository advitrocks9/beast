import Link from "next/link";
import { eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@beast/db";
import { companies, aiEmployees } from "@beast/db";
import { Monogram } from "@/components/monogram";
import { StateChip } from "@/components/state-chip";

export default async function SettingsTeamPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const company = await db.query.companies.findFirst({
    where: eq(companies.userId, user!.id),
    columns: { id: true },
  });

  const employees = await db.query.aiEmployees.findMany({
    where: eq(aiEmployees.companyId, company!.id),
    columns: {
      id: true,
      name: true,
      roleTitle: true,
      roleType: true,
      checkInFrequency: true,
      autonomySettings: true,
      status: true,
    },
  });

  return (
    <div className="space-y-6">
      <section aria-label="Roster">
        <div className="rule-t flex items-baseline justify-between pt-2.5">
          <h2 className="text-[15px] font-semibold">Roster</h2>
          <span className="spec text-ink-muted">{employees.length} employed</span>
        </div>
        <p className="mt-1.5 text-[13px] text-ink-secondary">
          Autonomy, check-in cadence, and pause controls live on each employee desk.
        </p>

        {employees.length === 0 ? (
          <p className="mt-3 text-[13px] text-ink-muted">
            Nobody on the roster.{" "}
            <Link
              href="/hire"
              className="font-semibold text-ink underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              Hire an employee
            </Link>{" "}
            and brief the first job.
          </p>
        ) : (
          <ul className="mt-2">
            {employees.map((emp) => {
              const autonomy = (emp.autonomySettings ?? {}) as Record<string, string>;
              return (
                <li key={emp.id} className="hairline-b last:border-b-0">
                  <Link
                    href={`/employees/${emp.id}`}
                    className="flex items-center gap-3 py-3 transition-colors hover:bg-panel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                  >
                    <Monogram name={emp.name} roleType={emp.roleType} size="md" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] leading-tight font-semibold">
                        {emp.name}
                      </span>
                      <span className="spec-label">{emp.roleTitle}</span>
                    </span>
                    <span className="hidden text-right sm:block">
                      <span className="spec block text-ink-muted">
                        check-in {emp.checkInFrequency}
                      </span>
                      <span className="spec block text-ink-muted">
                        publishing {autonomy.publishSocial ?? "permission"}
                      </span>
                    </span>
                    <StateChip status={emp.status ?? "idle"} />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-label="Human seats">
        <div className="rule-t pt-2.5">
          <h2 className="text-[15px] font-semibold">Human seats</h2>
        </div>
        <div className="hairline-b flex items-center justify-between gap-3 py-3">
          <div className="min-w-0">
            <p className="truncate text-[13.5px] font-semibold">{user!.email}</p>
            <p className="spec-label">Owner</p>
          </div>
          <span className="spec text-ink-muted">1 of 1</span>
        </div>
        <p className="mt-2 text-[13px] text-ink-muted">
          One human seat for now. Inviting other reviewers arrives with the Team plan.
        </p>
      </section>
    </div>
  );
}
