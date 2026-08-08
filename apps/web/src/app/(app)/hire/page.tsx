import { eq } from "drizzle-orm";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { db } from "@beast/db";
import { companies, aiEmployees } from "@beast/db";
import { roleMeta } from "@/lib/colors";
import { Monogram } from "@/components/monogram";
import { HireButton } from "./_components/hire-button";

interface RoleApplication {
  roleType: "marketing" | "sales" | "support";
  name: string;
  roleTitle: string;
  blurb: string;
  willHandle: string[];
}

const ROLE_APPLICATIONS: RoleApplication[] = [
  {
    roleType: "marketing",
    name: "Alex",
    roleTitle: "Marketing Manager",
    blurb: "Writes blog posts, social copy, newsletters. Energetic and data-driven.",
    willHandle: ["Twitter / LinkedIn drafts", "Long-form blog posts", "Newsletter sections", "Competitor teardowns"],
  },
  {
    roleType: "sales",
    name: "Jordan",
    roleTitle: "Sales Development Rep",
    blurb: "Drafts outreach emails, sequences, and proposals. Direct, warm, consultative.",
    willHandle: ["Cold email sequences", "ICP company lists", "Outreach personalization", "Follow-up cadences"],
  },
  {
    roleType: "support",
    name: "Sam",
    roleTitle: "Support Lead",
    blurb: "Handles tickets, FAQ articles, KB updates. Calm, empathetic, thorough.",
    willHandle: ["Ticket replies", "FAQ + help-center articles", "Macros + canned responses", "Escalation triage"],
  },
];

export const metadata = {
  title: "Hire - Beast",
};

export default async function HirePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const company = await db.query.companies.findFirst({
    where: eq(companies.userId, user!.id),
    columns: { id: true },
  });

  const existing = await db.query.aiEmployees.findMany({
    where: eq(aiEmployees.companyId, company!.id),
    columns: { id: true, name: true, roleType: true, roleTitle: true },
  });

  const existingByRole = new Map(existing.map((e) => [e.roleType, e]));
  const rosterFull = ROLE_APPLICATIONS.every((a) => existingByRole.has(a.roleType));

  return (
    <div className="mx-auto max-w-5xl">
      <header className="rule-b pb-4">
        <h1 className="display text-3xl">Hire</h1>
        <p className="spec mt-1.5 text-ink-muted">
          {existingByRole.size} of 3 role applications filled
        </p>
      </header>

      {rosterFull ? (
        <section aria-label="Roster complete" className="panel-tinted mt-5 p-5">
          <p className="spec-label">Roster complete</p>
          <h2 className="mt-2 text-lg font-bold">All three roles are filled.</h2>
          <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-ink-secondary">
            The company does not grow by headcount. A role is configuration: tune autonomy,
            check-in cadence, and focus from each desk, and the manual&apos;s standing rules carry the
            rest forward.
          </p>
          <ul className="mt-4">
            {ROLE_APPLICATIONS.map((app) => {
              const emp = existingByRole.get(app.roleType)!;
              return (
                <li key={app.roleType} className="hairline-b last:border-b-0">
                  <Link
                    href={`/employees/${emp.id}`}
                    className="flex items-center gap-3 py-2.5 transition-colors hover:bg-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                  >
                    <Monogram name={emp.name} roleType={app.roleType} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">
                      {emp.name} · {emp.roleTitle}
                    </span>
                    <span className="spec-label shrink-0">Open desk</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        <div className="mt-1">
          {ROLE_APPLICATIONS.map((app, i) => {
            const hired = existingByRole.get(app.roleType);
            const role = roleMeta(app.roleType);
            return (
              <section
                key={app.roleType}
                aria-label={`${app.name} application`}
                className="rule-t mt-4 pt-4 pb-5 first:mt-5"
              >
                <div className="grid gap-4 md:grid-cols-[auto_1fr_240px] md:gap-6">
                  <span className="flex shrink-0 flex-col items-center gap-1">
                    <Monogram name={app.name} roleType={app.roleType} size="xl" />
                    <span className="spec text-ink-muted">{role.solid}</span>
                  </span>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2.5">
                      <h2 className="display text-2xl">{app.name}</h2>
                      <span className="spec text-ink-muted">
                        {String(i + 1).padStart(2, "0")} / {app.roleTitle}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-secondary">
                      {app.blurb}
                    </p>
                    <p className="spec-label mt-3">Will handle</p>
                    <ul className="mt-1.5 grid gap-x-4 gap-y-1 sm:grid-cols-2">
                      {app.willHandle.map((item) => (
                        <li
                          key={item}
                          className="flex items-baseline gap-2 text-[12.5px] text-ink-secondary"
                        >
                          <span
                            aria-hidden
                            className="inline-block h-1.5 w-1.5 shrink-0"
                            style={{ backgroundColor: role.solid }}
                          />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="md:pt-1">
                    {hired ? (
                      <div className="space-y-2">
                        <Link
                          href={`/employees/${hired.id}`}
                          className="btn-ghost w-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                        >
                          Open {hired.name}&apos;s desk
                        </Link>
                        <p className="spec-label text-center">On the roster</p>
                      </div>
                    ) : (
                      <HireButton roleType={app.roleType} name={app.name} hex={role.solid} />
                    )}
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}

      <p className="hairline-t mt-6 pt-3 spec-label">
        Marketing, sales, support. Functions outside these stay on the human side for now.
      </p>
    </div>
  );
}
