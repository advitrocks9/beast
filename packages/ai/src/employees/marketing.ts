import { z } from "zod";
import type { Skill } from "../skills/types";

export const writeBlogPost: Skill = {
  id: "write-blog-post",
  name: "Write Blog Post",
  employeeType: "marketing",
  inputSchema: z.object({
    topic: z.string(),
    keywords: z.array(z.string()).optional(),
    tone: z.string().optional(),
    wordCount: z.number().optional(),
    audience: z.string().optional(),
  }),
  outputSchema: z.object({
    title: z.string(),
    content: z.string(),
    metaDescription: z.string(),
    tags: z.array(z.string()),
  }),
  steps: [
    {
      id: "research",
      name: "Research Topic",
      prompt: `Research the following topic and gather key facts, statistics, and angles.
Topic: {{input}}
Produce a bullet-point research brief with 5-10 key points. Include any relevant data or trends.`,
      model: "sonnet",
    },
    {
      id: "outline",
      name: "Generate Outline",
      prompt: `Based on this research, create a detailed blog post outline.

Research:
{{research}}

Original brief: {{input}}

Produce: a title (H1), 4-6 section headings (H2), and 2-3 bullet points per section describing what to cover.`,
      dependsOn: ["research"],
    },
    {
      id: "draft",
      name: "Write Draft",
      prompt: `Write the full blog post based on this outline.

Outline:
{{outline}}

Research:
{{research}}

Original brief: {{input}}

Guidelines:
- Write in the company's brand voice
- Use short paragraphs (2-3 sentences max)
- Include a compelling hook in the introduction
- End with a clear call-to-action
- Target word count: around 800-1200 words unless specified otherwise
- Use subheadings for scannability`,
      dependsOn: ["outline", "research"],
    },
    {
      id: "finalize",
      name: "Finalize with Metadata",
      prompt: `Polish the blog post and add metadata.

Blog post:
{{draft}}

Return a JSON object with exactly these fields:
{
  "title": "the blog post title",
  "content": "the full blog post in markdown",
  "metaDescription": "a 150-160 character SEO meta description",
  "tags": ["relevant", "tags", "for", "categorization"]
}

Return ONLY the JSON, no other text.`,
      dependsOn: ["draft"],
    },
  ],
  tools: [],
  qualityChecks: [
    {
      name: "minimum_length",
      check: (output) => {
        const len = output.length;
        return {
          passed: len > 1000,
          feedback: len > 1000 ? "Length OK" : `Output too short (${len} chars, need >1000)`,
        };
      },
    },
  ],
  calibration: { exampleOutputs: [], avoidPatterns: [] },
  selfReviewPrompt: `Review this blog post for quality. Check:
- Is the hook compelling?
- Are paragraphs short and scannable?
- Is there a clear CTA?
- Does it match the requested tone?
- Are claims supported?`,
  maxSelfRevisions: 2,
};

export const createSocialPost: Skill = {
  id: "create-social-post",
  name: "Create Social Post",
  employeeType: "marketing",
  inputSchema: z.object({
    topic: z.string(),
    platform: z.enum(["twitter", "linkedin"]),
    tone: z.string().optional(),
    cta: z.string().optional(),
  }),
  outputSchema: z.object({
    content: z.string(),
    platform: z.string(),
    hashtags: z.array(z.string()),
  }),
  steps: [
    {
      id: "draft",
      name: "Draft Post",
      prompt: `Write a social media post for {{input}}.

Platform-specific rules:
- Twitter/X: max 280 characters. Punchy, conversational. Use 1-3 hashtags.
- LinkedIn: 1-3 short paragraphs. Professional but engaging. Use line breaks for readability. 3-5 hashtags.

Write the post content, then list hashtags separately.`,
    },
    {
      id: "finalize",
      name: "Format Output",
      prompt: `Format this social post as JSON:

Post:
{{draft}}

Brief: {{input}}

Return ONLY this JSON:
{
  "content": "the post text without hashtags",
  "platform": "twitter or linkedin",
  "hashtags": ["hashtag1", "hashtag2"]
}`,
      dependsOn: ["draft"],
    },
  ],
  tools: [],
  qualityChecks: [
    {
      name: "platform_length",
      check: (output) => {
        try {
          const parsed = JSON.parse(output);
          if (parsed.platform === "twitter" && parsed.content.length > 280) {
            return { passed: false, feedback: `Twitter post too long (${parsed.content.length}/280)` };
          }
        } catch { /* not JSON yet */ }
        return { passed: true, feedback: "OK" };
      },
    },
  ],
  calibration: { exampleOutputs: [], avoidPatterns: [] },
  selfReviewPrompt: `Review this social post. Check:
- Does it grab attention in the first line?
- Is it the right length for the platform?
- Does it include a CTA?
- Are hashtags relevant?`,
  maxSelfRevisions: 1,
};

export const draftNewsletter: Skill = {
  id: "draft-newsletter",
  name: "Draft Newsletter",
  employeeType: "marketing",
  inputSchema: z.object({
    theme: z.string(),
    sections: z.array(z.string()).optional(),
    audience: z.string().optional(),
  }),
  outputSchema: z.object({
    subject: z.string(),
    preheader: z.string(),
    content: z.string(),
  }),
  steps: [
    {
      id: "draft",
      name: "Write Newsletter",
      prompt: `Write an email newsletter based on: {{input}}

Structure:
- Subject line (compelling, under 50 chars)
- Preheader text (extends the subject, under 100 chars)
- Opening hook (1-2 sentences)
- Main sections with clear headers
- Each section: 2-3 short paragraphs
- Closing CTA

Write in a conversational, friendly tone unless the brief specifies otherwise.`,
    },
    {
      id: "finalize",
      name: "Format Output",
      prompt: `Format this newsletter as JSON:

Newsletter:
{{draft}}

Return ONLY this JSON:
{
  "subject": "email subject line",
  "preheader": "preheader text",
  "content": "full newsletter body in markdown"
}`,
      dependsOn: ["draft"],
    },
  ],
  tools: [],
  qualityChecks: [],
  calibration: { exampleOutputs: [], avoidPatterns: [] },
  selfReviewPrompt: `Review this newsletter. Is the subject line compelling? Is the content scannable? Is there a clear CTA?`,
  maxSelfRevisions: 1,
};

export const marketingSkills = [writeBlogPost, createSocialPost, draftNewsletter];
