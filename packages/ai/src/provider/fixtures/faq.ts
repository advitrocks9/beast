import type { Fixture } from "./index";

export const faqFixture: Fixture = {
  toolSteps: [
    {
      lead: (ctx) => `Searching the knowledge base for prior answers and product facts relevant to "${ctx.title}".\n\n`,
      tool: "search_company_kb",
      input: (ctx) => ({ query: `product documentation ${ctx.title}`, topK: 5 }),
    },
  ],
  sections: [
    (ctx) => `# ${ctx.title}\n\n**Short answer:** Yes, and it takes about five minutes to set up.\n\n`,
    () => `**Details:**\n\n1. Open Settings and choose the integration tab.\n2. Connect your account; we only request read access at this step.\n3. Pick the workspace to sync and confirm.\n\n`,
    () => `**Common issues:**\n\n- If the connect button loops back to login, clear the third-party cookie block for our domain.\n- Sync runs every 15 minutes; a manual sync button is in the same tab.\n\nIf none of that resolves it, reply to this article and a human will pick it up within one business day.\n`,
  ],
};
