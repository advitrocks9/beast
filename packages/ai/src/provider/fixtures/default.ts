import type { Fixture } from "./index";

export const defaultFixture: Fixture = {
  toolSteps: [
    {
      lead: (ctx) => `Reviewing the brief for "${ctx.title}" and gathering relevant company context.\n\n`,
      tool: "search_company_kb",
      input: (ctx) => ({ query: ctx.title, topK: 5 }),
    },
  ],
  sections: [
    (ctx) => `# ${ctx.title}\n\n${ctx.objective ? `Objective: ${ctx.objective}\n\n` : ""}`,
    () => `## Approach\n\nWorked the brief end to end: reviewed the available context, drafted against the acceptance criteria, and self-checked the result before handing it over.\n\n`,
    () => `## Deliverable\n\nThe requested work is complete and ready for review. Key points:\n\n1. Scope matches the brief; nothing was added that was not asked for.\n2. Claims are grounded in the retrieved company context.\n3. Open questions, if any, are listed below rather than guessed at.\n\n`,
    () => `## Next step\n\nReview and approve, or leave an edit; either signal teaches me your preference for future runs of this task type.\n`,
  ],
};
