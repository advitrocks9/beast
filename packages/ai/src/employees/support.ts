import { z } from "zod";
import type { Skill } from "../skills/types";

export const draftTicketResponse: Skill = {
  id: "draft-ticket-response",
  name: "Draft Ticket Response",
  employeeType: "support",
  inputSchema: z.object({
    customerMessage: z.string(),
    customerName: z.string().optional(),
    ticketHistory: z.string().optional(),
    urgency: z.enum(["low", "medium", "high"]).optional(),
  }),
  outputSchema: z.object({
    response: z.string(),
    suggestedCategory: z.string(),
    needsEscalation: z.boolean(),
    escalationReason: z.string().optional(),
  }),
  steps: [
    {
      id: "analyze",
      name: "Analyze Ticket",
      prompt: `Analyze this support ticket:

{{input}}

Determine:
1. What is the customer's core issue?
2. What category does this fall into (billing, technical, how-to, bug, feature request)?
3. Does this need human escalation? (bugs, billing disputes, angry customers = yes)
4. What information do we need from our knowledge base to answer this?`,
    },
    {
      id: "draft",
      name: "Draft Response",
      prompt: `Write a support response based on this analysis:

Analysis:
{{analyze}}

Original ticket: {{input}}

Rules:
- Start by acknowledging their situation (1 sentence)
- Provide a clear solution or next step
- If it's a how-to: give numbered steps
- If it's a bug: acknowledge, give workaround if possible, confirm it's being looked at
- End with an offer to help further
- Keep tone calm and helpful, never defensive

Return as JSON:
{
  "response": "the full response text",
  "suggestedCategory": "billing|technical|how-to|bug|feature_request",
  "needsEscalation": false,
  "escalationReason": null
}`,
      dependsOn: ["analyze"],
    },
  ],
  tools: [],
  qualityChecks: [],
  calibration: { exampleOutputs: [], avoidPatterns: [] },
  selfReviewPrompt: `Review this support response. Does it acknowledge the customer? Does it provide actionable steps? Is the tone empathetic?`,
  maxSelfRevisions: 1,
};

export const writeFaqArticle: Skill = {
  id: "write-faq-article",
  name: "Write FAQ Article",
  employeeType: "support",
  inputSchema: z.object({
    question: z.string(),
    context: z.string().optional(),
    relatedQuestions: z.array(z.string()).optional(),
  }),
  outputSchema: z.object({
    title: z.string(),
    answer: z.string(),
    relatedArticles: z.array(z.string()),
  }),
  steps: [
    {
      id: "draft",
      name: "Write Article",
      prompt: `Write a FAQ/knowledge base article for:

{{input}}

Structure:
- Title: the question, phrased clearly
- Answer: direct answer in the first sentence, then detailed explanation
- Use numbered steps for processes
- Include screenshots or UI references where relevant (describe them)
- End with related questions the reader might also have

Return as JSON:
{
  "title": "the question as a title",
  "answer": "the full article in markdown",
  "relatedArticles": ["related question 1", "related question 2"]
}`,
    },
  ],
  tools: [],
  qualityChecks: [],
  calibration: { exampleOutputs: [], avoidPatterns: [] },
  selfReviewPrompt: `Review this FAQ article. Does the first sentence directly answer the question? Are steps numbered and clear?`,
  maxSelfRevisions: 1,
};

export const supportSkills = [draftTicketResponse, writeFaqArticle];
