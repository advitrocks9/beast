import { eq } from "drizzle-orm";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { db } from "@beast/db";
import { companies, aiEmployees } from "@beast/db";
import { GlassCard } from "@beast/ui";
import { HireButton } from "./_components/hire-button";

interface RoleCard {
  roleType: "marketing" | "sales" | "support";
  name: string;
  roleTitle: string;
  hex: string;
  blurb: string;
  willHandle: string[];
}

const ROLE_CARDS: RoleCard[] = [
  {
    roleType: "marketing",
    name: "Alex",
    roleTitle: "Marketing Manager",
    hex: "#E87B35",
    blurb: "Writes blog posts, social copy, newsletters. Energetic and data-driven.",
    willHandle: ["Twitter / LinkedIn drafts", "Long-form blog posts", "Newsletter sections", "Competitor teardowns"],
  },
  {
    roleType: "sales",
    name: "Jordan",
    roleTitle: "Sales Development Rep",
    hex: "#3B82F6",
    blurb: "Drafts outreach emails, sequences, and proposals. Direct, warm, consultative.",
    willHandle: ["Cold email sequences", "ICP company lists", "Outreach personalization", "Follow-up cadences"],
  },
  {
    roleType: "support",
    name: "Sam",
    roleTitle: "Support Lead",
    hex: "#22C55E",
    blurb: "Handles tickets, FAQ articles, KB updates. Calm, empathetic, thorough.",
    willHandle: ["Ticket replies", "FAQ + help-center articles", "Macros + canned responses", "Escalation triage"],
  },
];

export default async function HirePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const company = await db.query.companies.findFirst({
    where: eq(companies.userId, user!.id),
    columns: { id: true },
  });

  const existing = await db.query.aiEmployees.findMany({
    where: eq(aiEmployees.companyId, company!.id),
    columns: { id: true, name: true, roleType: true },
  });

  const existingByRole = new Map(existing.map((e) => [e.roleType, e]));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-(--font-display) text-2xl font-bold tracking-tight">Hire an AI employee</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Three roles cover the most common SMB workloads. Hire the ones you need; you can always adjust autonomy and check-ins later from each desk.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {ROLE_CARDS.map((card) => {
          const already = existingByRole.get(card.roleType);
          return (
            <GlassCard key={card.roleType} hoverable={false} className="p-5 flex flex-col">
              <div className="flex items-start gap-3 mb-3">
                <div
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white text-lg font-bold"
                  style={{ backgroundColor: card.hex }}
                >
                  {card.name[0]}
                </div>
                <div>
                  <p className="text-base font-semibold">{card.name}</p>
                  <p className="text-xs text-text-secondary">{card.roleTitle}</p>
                </div>
              </div>

              <p className="text-sm text-text leading-relaxed mb-4">{card.blurb}</p>

              <p className="text-[11px] font-medium uppercase tracking-wider text-text-muted mb-2">
                Will handle
              </p>
              <ul className="space-y-1 text-xs text-text-secondary mb-5">
                {card.willHandle.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span
                      className="mt-1.5 inline-block h-1 w-1 rounded-full shrink-0"
                      style={{ backgroundColor: card.hex }}
                    />
                    {item}
                  </li>
                ))}
              </ul>

              <div className="mt-auto">
                {already ? (
                  <Link
                    href={`/employees/${already.id}`}
                    className="block rounded-xl border border-[oklch(0.85_0.01_260/0.4)] bg-white px-4 py-2 text-center text-sm font-medium text-text-secondary hover:border-text hover:text-text"
                  >
                    Open {already.name}&rsquo;s desk
                  </Link>
                ) : (
                  <HireButton roleType={card.roleType} hex={card.hex} />
                )}
              </div>
            </GlassCard>
          );
        })}
      </div>

      <p className="text-center text-xs text-text-muted">
        Need a role we do not list? Functions outside marketing, sales, and support stay on the human side for now.
      </p>
    </div>
  );
}
