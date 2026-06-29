import { eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@beast/db";
import { companies, knowledgeItems, connectors } from "@beast/db";
import { GlassCard } from "@beast/ui";
import { statusMeta } from "@/lib/colors";
import { SlackConnector } from "../_components/slack-connector";

const CATEGORY_LABELS: Record<string, string> = {
  company_overview: "Company Overview",
  products: "Products & Services",
  audience: "Target Audience",
  brand_voice: "Brand Voice",
  competitors: "Competitors",
  team: "Team",
  processes: "Processes",
  historical: "Historical Outputs",
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

  const slackConnector = await db.query.connectors.findFirst({
    where: (c, { and, eq: eqOp }) => and(eqOp(c.companyId, company!.id), eqOp(c.platform, "slack")),
    columns: { id: true, platform: true, status: true, metadata: true },
  });

  const kbByCategory: Record<string, typeof kbItems> = {};
  for (const item of kbItems) {
    if (!kbByCategory[item.category]) kbByCategory[item.category] = [];
    kbByCategory[item.category]!.push(item);
  }

  return (
    <div className="space-y-8">
      <section>
        <h2 className="heading-gradient text-lg font-semibold mb-3">Account</h2>
        <GlassCard hoverable={false} className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{company!.name}</p>
              <p className="text-xs text-text-secondary">{user!.email}</p>
            </div>
            <span className="rounded-full bg-brand-light px-3 py-1 text-xs font-medium text-brand">
              Context Score: {company!.contextScore ?? 0}%
            </span>
          </div>
          {company!.industry && (
            <p className="text-xs text-text-muted">Industry: {company!.industry}</p>
          )}
          {company!.timezone && (
            <p className="text-xs text-text-muted">Timezone: {company!.timezone}</p>
          )}
        </GlassCard>
      </section>

      <section>
        <h2 className="heading-gradient text-lg font-semibold mb-3">Integrations</h2>
        <SlackConnector
          connector={slackConnector ? {
            id: slackConnector.id,
            platform: slackConnector.platform,
            status: slackConnector.status,
            metadata: slackConnector.metadata as Record<string, unknown> | null,
          } : null}
        />
      </section>

      <section>
        <h2 className="heading-gradient text-lg font-semibold mb-3">
          Knowledge Base
          <span className="ml-2 text-sm font-normal text-text-secondary">
            ({kbItems.length} items)
          </span>
        </h2>

        {Object.keys(CATEGORY_LABELS).map((category) => {
          const items = kbByCategory[category] ?? [];
          const label = CATEGORY_LABELS[category] ?? category;
          return (
            <div key={category} className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: items.length > 0 ? statusMeta("completed").dot : statusMeta().dot }}
                />
                <h3 className="text-sm font-medium">{label}</h3>
                <span className="text-xs text-text-muted">({items.length})</span>
              </div>

              {items.length > 0 ? (
                <div className="space-y-2 pl-4">
                  {items.map((item) => (
                    <GlassCard key={item.id} hoverable={false} className="p-3">
                      <p className="text-sm font-medium">{item.title}</p>
                      <p className="mt-0.5 text-xs text-text-secondary line-clamp-2">
                        {item.aiSummary ?? item.content}
                      </p>
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-text-muted">
                        <span>Source: {item.sourceType}</span>
                        {item.verified && <span className="text-green-600">Verified</span>}
                      </div>
                    </GlassCard>
                  ))}
                </div>
              ) : (
                <p className="pl-4 text-xs text-text-muted">No items in this category.</p>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}
