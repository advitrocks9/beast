import type { Fixture } from "./index";

export const emailFixture: Fixture = {
  toolSteps: [
    {
      lead: (ctx) => `Pulling context for "${ctx.title}" so the email references something real about the recipient.\n\n`,
      tool: "search_company_kb",
      input: (ctx) => ({ query: `audience pain points ${ctx.title}`, topK: 5 }),
    },
  ],
  sections: [
    (ctx) => `Subject: ${ctx.title}\n\n`,
    () => `Hi {{firstName}},\n\nSaw your team announced the new product line last week; congrats. Launches like that usually mean the support queue doubles before headcount does.\n\n`,
    () => `We help teams in exactly that spot: replies drafted in your voice, reviewed by you, sent in minutes instead of hours. One of our customers cut first-response time 60% in their first month.\n\n`,
    () => `Worth a 15-minute look next week? I'll bring a draft response to one of your own public tickets so you can judge the quality directly.\n\nBest,\nJordan\n`,
  ],
};
