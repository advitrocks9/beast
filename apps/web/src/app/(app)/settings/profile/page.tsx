import { eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@beast/db";
import { companies, knowledgeItems } from "@beast/db";

const CATEGORY_LABELS: Record<string, string> = {
  company_overview: "Company overview",
  products: "Products & services",
  audience: "Target audience",
  brand_voice: "Brand voice",
  competitors: "Competitors",
  team: "Team",
  processes: "Processes",
  historical: "Historical outputs",
};

export default async function SettingsProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const company = await db.query.companies.findFirst({
    where: eq(companies.userId, user!.id),
  });

  const kbItems = await db.query.knowledgeItems.findMany({
    where: eq(knowledgeItems.companyId, company!.id),
    orderBy: (k, { asc }) => [asc(k.category), asc(k.createdAt)],
  });

  const kbByCategory = new Map<string, typeof kbItems>();
  for (const item of kbItems) {
    const list = kbByCategory.get(item.category) ?? [];
    list.push(item);
    kbByCategory.set(item.category, list);
  }

  return (
    <div className="space-y-6">
      <section aria-label="Company record">
        <div className="rule-t flex items-baseline justify-between pt-2.5">
          <h2 className="text-[15px] font-semibold">Company record</h2>
          <span className="spec text-ink-muted">context {company!.contextScore ?? 0}/100</span>
        </div>
        <dl className="mt-2">
          <SpecRow label="Company">{company!.name}</SpecRow>
          <SpecRow label="Manager">{user!.email ?? "—"}</SpecRow>
          <SpecRow label="Industry">{company!.industry ?? "not on file"}</SpecRow>
          <SpecRow label="Timezone">{company!.timezone}</SpecRow>
        </dl>
      </section>

      <section aria-label="Knowledge ledger">
        <div className="rule-t flex items-baseline justify-between pt-2.5">
          <h2 className="text-[15px] font-semibold">Knowledge ledger</h2>
          <span className="spec text-ink-muted">{kbItems.length} items on file</span>
        </div>
        <p className="mt-1.5 text-[13px] text-ink-secondary">
          What the company knows about itself. Every run reads from this file.
        </p>

        {Object.entries(CATEGORY_LABELS).map(([category, label]) => {
          const items = kbByCategory.get(category) ?? [];
          return (
            <div key={category} className="mt-4">
              <div className="hairline-b flex items-baseline justify-between pb-1.5">
                <h3 className="spec-label">{label}</h3>
                <span className="spec text-ink-muted">{items.length}</span>
              </div>
              {items.length === 0 ? (
                <p className="mt-1.5 text-[12.5px] text-ink-muted">
                  Nothing filed. Add it from the knowledge desk or re-run the interview.
                </p>
              ) : (
                <ul>
                  {items.map((item) => (
                    <li key={item.id} className="hairline-b py-2 last:border-b-0">
                      <p className="text-[13px] leading-tight font-medium">{item.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-ink-secondary">
                        {item.aiSummary ?? item.content}
                      </p>
                      <p className="spec-label mt-1">
                        source {item.sourceType}
                        {item.verified && <span className="ml-2 text-state-accepted">verified</span>}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}

function SpecRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="hairline-b flex items-baseline justify-between gap-4 py-2 last:border-b-0">
      <dt className="spec-label shrink-0">{label}</dt>
      <dd className="min-w-0 truncate text-right text-[13.5px]">{children}</dd>
    </div>
  );
}
