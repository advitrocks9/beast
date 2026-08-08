import type { Fixture } from "./index";

export const socialFixture: Fixture = {
  toolSteps: [
    {
      lead: (ctx) => `Checking the knowledge base for voice guidelines and proof points before writing "${ctx.title}".\n\n`,
      tool: "search_company_kb",
      input: (ctx) => ({ query: `brand voice proof points ${ctx.title}`, topK: 5 }),
    },
  ],
  sections: [
    (ctx) => `Everyone talks about ${ctx.title.toLowerCase()}. Almost nobody measures it.\n\nHere's what we found when we actually did:\n\n`,
    () => `1. The bottleneck was never where the team thought it was.\n2. The fix took two days once it was visible.\n3. The measurement itself changed behavior before any fix shipped.\n\n`,
    () => `The lesson: instrument first, opine second.\n\nWhat's the one process in your company everyone complains about but nobody has measured?\n`,
  ],
};
