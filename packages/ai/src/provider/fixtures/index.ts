import { blogFixture } from "./blog";
import { competitorTeardownFixture } from "./competitor-teardown";
import { defaultFixture } from "./default";
import { emailFixture } from "./email";
import { faqFixture } from "./faq";
import { reportFixture } from "./report";
import { socialFixture } from "./social";

export interface FixtureContext {
  title: string;
  objective: string;
}

export interface FixtureToolStep {
  lead: (ctx: FixtureContext) => string;
  tool: string;
  input: (ctx: FixtureContext) => Record<string, unknown>;
}

export interface Fixture {
  toolSteps: FixtureToolStep[];
  sections: Array<(ctx: FixtureContext) => string>;
}

const FIXTURES: Record<string, Fixture> = {
  competitor_teardown: competitorTeardownFixture,
  blog: blogFixture,
  "write-blog-post": blogFixture,
  social_linkedin: socialFixture,
  social_twitter: socialFixture,
  "create-social-post": socialFixture,
  email: emailFixture,
  "draft-newsletter": emailFixture,
  "draft-outreach-email": emailFixture,
  "create-email-sequence": emailFixture,
  faq: faqFixture,
  "write-faq-article": faqFixture,
  "draft-ticket-response": faqFixture,
  report: reportFixture,
};

export function fixtureFor(taskType: string): Fixture {
  return FIXTURES[taskType] ?? defaultFixture;
}
