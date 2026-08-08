import type { Fixture } from "./index";

export const reportFixture: Fixture = {
  toolSteps: [
    {
      lead: (ctx) => `Gathering external signal for "${ctx.title}" before compiling the report.\n\n`,
      tool: "web_search",
      input: (ctx) => ({ query: `${ctx.title} market trends`, numResults: 5 }),
    },
    {
      lead: () => `Cross-referencing against internal knowledge so the report reflects our actual position.\n\n`,
      tool: "search_company_kb",
      input: (ctx) => ({ query: ctx.title, topK: 5 }),
    },
  ],
  sections: [
    (ctx) => `# ${ctx.title}\n\n## Summary\n\nThree findings this period, one of which needs a decision from you this week.\n\n`,
    () => `## Findings\n\n1. **Inbound is shifting channels.** Search-driven signups are flat while referral signups grew 18%; the referral loop deserves budget before the next paid experiment.\n2. **One competitor moved downmarket.** Their new entry tier undercuts ours by design; our mid-tier value story absorbs this, but the pricing page should say so explicitly.\n3. **Support themes are converging.** Two of the top five ticket categories trace to the same onboarding step; a single fix removes both.\n\n`,
    () => `## Recommended decision\n\nApprove the onboarding fix this sprint. It is the only item on this list that compounds: it reduces tickets, improves activation, and strengthens the referral loop that finding one says is our growth channel.\n`,
  ],
};
