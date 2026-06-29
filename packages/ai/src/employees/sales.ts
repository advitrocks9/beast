import { z } from "zod";
import type { Skill } from "../skills/types";

export const draftOutreachEmail: Skill = {
  id: "draft-outreach-email",
  name: "Draft Outreach Email",
  employeeType: "sales",
  inputSchema: z.object({
    prospectName: z.string(),
    prospectCompany: z.string(),
    prospectRole: z.string().optional(),
    context: z.string().optional(),
    valueProposition: z.string().optional(),
  }),
  outputSchema: z.object({
    subject: z.string(),
    body: z.string(),
    cta: z.string(),
  }),
  steps: [
    {
      id: "research",
      name: "Research Prospect",
      prompt: `Research context for this outreach:

Prospect: {{input}}

Based on the prospect info and company context, identify:
1. Their likely pain points given their role and company
2. A specific hook (recent news, shared connection, or relevant trend)
3. Which of our product's value props resonates most

Produce a brief research summary.`,
    },
    {
      id: "draft",
      name: "Write Email",
      prompt: `Write a cold outreach email using this research:

Research:
{{research}}

Prospect info: {{input}}

Rules:
- Subject line: 6 words max, specific not generic
- Opening: reference something specific about them (not "I hope this finds you well")
- Body: 2-3 sentences connecting their pain to our solution
- CTA: one specific, low-friction ask (not "let me know if you'd like to chat")
- Total: under 150 words`,
      dependsOn: ["research"],
    },
    {
      id: "finalize",
      name: "Format Output",
      prompt: `Format this email as JSON:

Email:
{{draft}}

Return ONLY:
{
  "subject": "the subject line",
  "body": "the email body",
  "cta": "the specific call to action"
}`,
      dependsOn: ["draft"],
    },
  ],
  tools: [],
  qualityChecks: [
    {
      name: "brevity",
      check: (output) => {
        const words = output.split(/\s+/).length;
        return {
          passed: words < 300,
          feedback: words < 300 ? "OK" : `Too long (${words} words, keep under 200)`,
        };
      },
    },
  ],
  calibration: { exampleOutputs: [], avoidPatterns: [] },
  selfReviewPrompt: `Review this outreach email. Is it personalized? Is the subject under 6 words? Is the CTA specific and low-friction? Is it under 150 words?`,
  maxSelfRevisions: 1,
};

export const createEmailSequence: Skill = {
  id: "create-email-sequence",
  name: "Create Email Sequence",
  employeeType: "sales",
  inputSchema: z.object({
    targetAudience: z.string(),
    goal: z.string(),
    numberOfEmails: z.number().default(3),
    daysBetween: z.number().default(3),
  }),
  outputSchema: z.object({
    emails: z.array(z.object({
      day: z.number(),
      subject: z.string(),
      body: z.string(),
      purpose: z.string(),
    })),
  }),
  steps: [
    {
      id: "plan",
      name: "Plan Sequence",
      prompt: `Plan an email sequence: {{input}}

For each email, define: the day it sends, its purpose (intro, value, social proof, urgency, breakup), and the angle.
Each email should escalate differently, not just repeat the same ask.`,
    },
    {
      id: "write",
      name: "Write All Emails",
      prompt: `Write the full email sequence based on this plan:

Plan:
{{plan}}

Original brief: {{input}}

For each email, follow the same rules as cold outreach: short, personalized, specific CTA.
Return as JSON:
{
  "emails": [
    { "day": 1, "subject": "...", "body": "...", "purpose": "intro" },
    ...
  ]
}`,
      dependsOn: ["plan"],
    },
  ],
  tools: [],
  qualityChecks: [],
  calibration: { exampleOutputs: [], avoidPatterns: [] },
  selfReviewPrompt: `Review this email sequence. Does each email serve a different purpose? Are they all concise?`,
  maxSelfRevisions: 1,
};

export const salesSkills = [draftOutreachEmail, createEmailSequence];
