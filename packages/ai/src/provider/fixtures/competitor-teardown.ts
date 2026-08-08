import type { Fixture } from "./index";

export const competitorTeardownFixture: Fixture = {
  toolSteps: [
    {
      lead: (ctx) => `Starting the teardown for "${ctx.title}". First pass: how they position themselves publicly.\n\n`,
      tool: "web_search",
      input: (ctx) => ({ query: `${ctx.title} positioning pricing plans review`, numResults: 5 }),
    },
    {
      lead: () => `Their pricing page is where positioning meets reality. Pulling it directly.\n\n`,
      tool: "scan_competitor_website",
      input: (ctx) => ({ url: `https://example.com/pricing?ref=${encodeURIComponent(ctx.title.toLowerCase().replace(/\s+/g, "-"))}` }),
    },
    {
      lead: () => `Checking our own knowledge base for prior intel and brand-voice constraints before writing.\n\n`,
      tool: "search_company_kb",
      input: (ctx) => ({ query: `competitor intelligence ${ctx.title}`, topK: 5 }),
    },
  ],
  sections: [
    (ctx) => `# ${ctx.title}\n\n## Positioning\n\nThey sell an outcome, not a toolset: the homepage leads with time saved per week, and every section ties a feature back to that number. The pricing page repeats the framing, which tells us the message tested well.\n\n`,
    () => `## Pricing\n\nThree tiers, with the middle tier visually anchored as the default. The jump from starter to mid-tier is priced at roughly 2.4x, which pushes annual commitments hard. Notably there is no free tier, only a 14-day trial with a card required, so they are filtering for intent at the top of the funnel.\n\n`,
    () => `## Where they are weak\n\n1. Onboarding is demo-gated for the top tier, adding friction their reviews complain about.\n2. Their changelog has slowed over the last quarter; recent posts are marketing-led, not product-led.\n3. No public roadmap and no self-serve migration path, which is an opening for a comparison page.\n\n`,
    (ctx) => `## Recommended response\n\nPublish a comparison page targeting "${ctx.title} alternative" queries, lead with self-serve onboarding and transparent pricing, and route trial signups from that page into the outreach sequence. This is a two-week play with measurable search intent behind it.\n`,
  ],
};
