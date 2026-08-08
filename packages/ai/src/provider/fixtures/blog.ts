import type { Fixture } from "./index";

export const blogFixture: Fixture = {
  toolSteps: [
    {
      lead: (ctx) => `Researching "${ctx.title}" before drafting. Looking for current data points to anchor the argument.\n\n`,
      tool: "web_search",
      input: (ctx) => ({ query: `${ctx.title} statistics 2026`, numResults: 5 }),
    },
    {
      lead: () => `Pulling company context so the draft lands in our voice and references our own product accurately.\n\n`,
      tool: "search_company_kb",
      input: (ctx) => ({ query: `brand voice product details ${ctx.title}`, topK: 5 }),
    },
  ],
  sections: [
    (ctx) => `# ${ctx.title}\n\nMost teams get this wrong in the same way: they treat it as a tooling problem when it is a process problem. The teams that fix the process first end up needing less tooling, not more.\n\n`,
    () => `## The pattern worth copying\n\nStart with the smallest version of the workflow that produces a reviewable result. Ship it, review it, and only then automate the parts that survived review. Automating before review locks in mistakes at machine speed.\n\n`,
    () => `## What to do this week\n\n1. Pick one recurring task and write down its actual steps, not the idealized ones.\n2. Cut every step that exists only because "we've always done it".\n3. Automate the remaining steps one at a time, measuring each against the manual baseline.\n\n`,
    (ctx) => `## The takeaway\n\n${ctx.objective || ctx.title} is achievable in weeks, not quarters, if you resist the urge to boil the ocean. Small, reviewed, repeatable wins compound.\n`,
  ],
};
