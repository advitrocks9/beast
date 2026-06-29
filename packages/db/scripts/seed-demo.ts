import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@beast/db";
import {
  companies,
  aiEmployees,
  departments,
  functions,
  goals,
  tasks,
  deliverables,
  activityLog,
  checkIns,
  collaborationProposals,
  autonomySuggestions,
  proceduralMemories,
  semanticMemories,
  episodicMemories,
  knowledgeItems,
  chatMessages,
  employeeMemories,
  ruleCandidates,
  knowledgeEmbeddings,
  events,
  notificationReads,
} from "@beast/db";

const DEMO_USER_ID = "11111111-1111-4111-8111-111111111111";
const COMPANY_ID = "22222222-2222-4222-8222-222222222222";
const ALEX_ID = "a0000000-0000-4000-8000-000000000001";
const JORDAN_ID = "b0000000-0000-4000-8000-000000000002";
const SAM_ID = "c0000000-0000-4000-8000-000000000003";

const NOW = Date.now();
const days = (d: number) => new Date(NOW + d * 86_400_000);
const hours = (h: number) => new Date(NOW + h * 3_600_000);
const dateOnly = (d: number) => days(d).toISOString().slice(0, 10);
const iso = (d: number) => days(d).toISOString();

async function wipe() {
  // FK-safe child -> parent order. Several tables reference companies only by
  // companyId without an FK (activity_log, deliverables, tasks, check_ins, ...),
  // and a few employee FKs are restrict (goals.aiEmployeeId,
  // collaboration_proposals.from/toEmployeeId, semantic_memories.agentId), so
  // we clear everything explicitly rather than leaning on cascade.
  await db.delete(collaborationProposals).where(eq(collaborationProposals.companyId, COMPANY_ID));
  await db.delete(autonomySuggestions).where(eq(autonomySuggestions.companyId, COMPANY_ID));
  await db.delete(checkIns).where(eq(checkIns.companyId, COMPANY_ID));
  await db.delete(chatMessages).where(eq(chatMessages.companyId, COMPANY_ID));
  await db.delete(activityLog).where(eq(activityLog.companyId, COMPANY_ID));
  await db.delete(episodicMemories).where(eq(episodicMemories.tenantId, COMPANY_ID));
  await db.delete(ruleCandidates).where(eq(ruleCandidates.tenantId, COMPANY_ID));
  await db.delete(proceduralMemories).where(eq(proceduralMemories.tenantId, COMPANY_ID));
  await db.delete(semanticMemories).where(eq(semanticMemories.tenantId, COMPANY_ID));
  await db.delete(employeeMemories).where(eq(employeeMemories.companyId, COMPANY_ID));
  await db.delete(deliverables).where(eq(deliverables.companyId, COMPANY_ID));
  await db.delete(tasks).where(eq(tasks.companyId, COMPANY_ID));
  await db.delete(goals).where(eq(goals.companyId, COMPANY_ID));
  await db.delete(knowledgeEmbeddings).where(eq(knowledgeEmbeddings.companyId, COMPANY_ID));
  await db.delete(knowledgeItems).where(eq(knowledgeItems.companyId, COMPANY_ID));
  await db.delete(functions).where(eq(functions.companyId, COMPANY_ID));
  await db.delete(departments).where(eq(departments.companyId, COMPANY_ID));
  await db.delete(aiEmployees).where(eq(aiEmployees.companyId, COMPANY_ID));
  await db.delete(events).where(eq(events.companyId, COMPANY_ID));
  await db.delete(notificationReads).where(eq(notificationReads.companyId, COMPANY_ID));
  await db.delete(companies).where(eq(companies.userId, DEMO_USER_ID));
}

const SYSTEM_PROMPT_TAIL =
  "Write in Northwind's voice: plain, warm, and specific. Back claims with a real detail, not filler. Never use em-dashes. Avoid the words artisanal, curated, and premium.";

async function seed() {
  await db.insert(companies).values({
    id: COMPANY_ID,
    userId: DEMO_USER_ID,
    name: "Northwind",
    websiteUrl: "https://www.northwindcoffee.test",
    industry: "DTC e-commerce",
    companySize: "22",
    contextScore: 78,
    onboardingStatus: "complete",
    timezone: "America/New_York",
    founderEmail: "founder@northwind.test",
    billingTier: "trial",
    billingStatus: "trialing",
    trialEndsAt: days(10),
    createdAt: days(-12),
    updatedAt: days(-1),
  });

  await db.insert(aiEmployees).values([
    {
      id: ALEX_ID,
      companyId: COMPANY_ID,
      name: "Alex",
      roleTitle: "Marketing Manager",
      roleType: "marketing",
      personality: {
        communicationStyle: "energetic, professional, clear",
        strengths: ["content marketing", "SEO", "social media", "brand storytelling"],
        traits: ["data-backed", "audience-focused", "ready-to-publish quality"],
      },
      systemPrompt: `You are Alex, a Marketing Manager AI employee at Northwind. ${SYSTEM_PROMPT_TAIL}`,
      memorySummary:
        "Maya approves fastest when a post opens by naming the goal it advances and leads with the specific lot, farm, and process. She edits out filler words.",
      status: "working",
      autonomySettings: {
        publishSocial: "permission",
        sendEmail: "permission",
        reachOut: "permission",
        createContent: "auto",
        researchTopics: "auto",
      },
      checkInFrequency: "daily",
      createdAt: days(-12),
      updatedAt: days(-1),
    },
    {
      id: JORDAN_ID,
      companyId: COMPANY_ID,
      name: "Jordan",
      roleTitle: "SDR (Sales Development Rep)",
      roleType: "sales",
      personality: {
        communicationStyle: "direct, warm, consultative",
        strengths: ["prospect research", "email sequences", "objection handling", "personalization"],
        traits: ["personal-not-templated", "pain-point-led", "concise"],
      },
      systemPrompt: `You are Jordan, a Sales Development Representative AI employee at Northwind. ${SYSTEM_PROMPT_TAIL}`,
      memorySummary:
        "Office managers skim, so cold emails stay under 90 words and open on the prospect's pain, not the product.",
      status: "waiting_review",
      autonomySettings: {
        publishSocial: "permission",
        sendEmail: "permission",
        reachOut: "auto",
        createContent: "auto",
        researchTopics: "auto",
      },
      checkInFrequency: "daily",
      createdAt: days(-11),
      updatedAt: days(-1),
    },
    {
      id: SAM_ID,
      companyId: COMPANY_ID,
      name: "Sam",
      roleTitle: "Support Lead",
      roleType: "support",
      personality: {
        communicationStyle: "calm, empathetic, thorough",
        strengths: ["customer support", "KB management", "escalation triage", "pattern detection"],
        traits: ["first-reply-solving", "step-by-step", "knows-when-to-escalate"],
      },
      systemPrompt: `You are Sam, a Support Lead AI employee at Northwind. ${SYSTEM_PROMPT_TAIL}`,
      memorySummary:
        "Acknowledge the customer's frustration before the fix, and never blame them for a billing issue.",
      status: "idle",
      autonomySettings: {
        publishSocial: "permission",
        sendEmail: "permission",
        reachOut: "permission",
        createContent: "auto",
        researchTopics: "auto",
      },
      checkInFrequency: "weekly",
      createdAt: days(-11),
      updatedAt: days(-2),
    },
  ]);

  // Departments + functions: satisfies the org structure /settings/team reads
  // and mirrors an onboarding-complete company.
  const marketingDept = randomUUID();
  const salesDept = randomUUID();
  const supportDept = randomUUID();
  await db.insert(departments).values([
    { id: marketingDept, companyId: COMPANY_ID, name: "Marketing" },
    { id: salesDept, companyId: COMPANY_ID, name: "Sales" },
    { id: supportDept, companyId: COMPANY_ID, name: "Support" },
  ]);
  await db.insert(functions).values([
    { departmentId: marketingDept, companyId: COMPANY_ID, name: "Content and Social", mode: "ai", aiEmployeeId: ALEX_ID },
    { departmentId: salesDept, companyId: COMPANY_ID, name: "Outbound", mode: "ai", aiEmployeeId: JORDAN_ID },
    { departmentId: supportDept, companyId: COMPANY_ID, name: "Customer Support", mode: "ai", aiEmployeeId: SAM_ID },
  ]);

  const goalContentSeries = randomUUID();
  const goalLinkedIn = randomUUID();
  const goalDemos = randomUUID();
  const goalResponse = randomUUID();
  await db.insert(goals).values([
    {
      id: goalLinkedIn,
      companyId: COMPANY_ID,
      aiEmployeeId: ALEX_ID,
      title: "Grow LinkedIn following to 10,000",
      description: "Build a steady audience for the subscription with weekly sourcing and brewing content.",
      targetMetric: "10,000 followers",
      targetDate: dateOnly(60),
      status: "active",
      progressPct: 60,
      createdAt: days(-12),
      updatedAt: days(-1),
    },
    {
      id: goalContentSeries,
      companyId: COMPANY_ID,
      aiEmployeeId: ALEX_ID,
      title: "Ship the single-origin sourcing content series",
      description: "Eight posts and two blogs connecting named lots to the freshness story.",
      targetMetric: "10 pieces published",
      targetDate: dateOnly(21),
      status: "active",
      progressPct: 90,
      createdAt: days(-10),
      updatedAt: days(-1),
    },
    {
      id: goalDemos,
      companyId: COMPANY_ID,
      aiEmployeeId: JORDAN_ID,
      title: "Book 15 office-coffee demo calls",
      description: "Outbound to facilities and office managers at NYC companies of 20 to 100 people.",
      targetMetric: "15 booked demos",
      targetDate: dateOnly(45),
      status: "active",
      progressPct: 35,
      createdAt: days(-9),
      updatedAt: days(-1),
    },
    {
      id: goalResponse,
      companyId: COMPANY_ID,
      aiEmployeeId: SAM_ID,
      title: "Cut first-response time under 2 hours",
      description: "Templated replies and FAQ coverage for the most common subscription questions.",
      targetMetric: "median first response < 2h",
      targetDate: dateOnly(-2),
      status: "completed",
      progressPct: 100,
      createdAt: days(-11),
      updatedAt: days(-3),
    },
  ]);

  type TaskSeed = {
    id: string;
    employee: string;
    goalId: string | null;
    title: string;
    taskType: string;
    origin: string;
    status: string;
    brief: Record<string, unknown>;
    createdAt: Date;
    startedAt?: Date;
    completedAt?: Date;
    scheduledAt?: Date;
  };

  const pinned = (goalId: string, title: string) => ({ id: goalId, title });

  const t1 = randomUUID();
  const t2 = randomUUID();
  const t3 = randomUUID();
  const t4 = randomUUID();
  const t5 = randomUUID();
  const t6 = randomUUID();
  const t7 = randomUUID();
  const t8 = randomUUID();
  const t9 = randomUUID();
  const t10 = randomUUID();
  const t11 = randomUUID();
  const t12 = randomUUID();
  const t13 = randomUUID();

  const taskSeeds: TaskSeed[] = [
    {
      id: t1, employee: ALEX_ID, goalId: goalContentSeries, title: "Draft 3 LinkedIn posts on single-origin sourcing",
      taskType: "social_linkedin", origin: "user_created", status: "approved",
      brief: { objective: "Three LinkedIn posts that connect our Ethiopia and Colombia lots to the freshness story.", acceptanceCriteria: ["Each post under 150 words", "Name the farm and process", "Soft CTA to the subscription"], pinnedGoal: pinned(goalContentSeries, "Ship the single-origin sourcing content series") },
      createdAt: days(-7), startedAt: days(-7), completedAt: days(-6),
    },
    {
      id: t2, employee: ALEX_ID, goalId: goalContentSeries, title: "Write blog: the truth about coffee freshness dates",
      taskType: "blog", origin: "user_created", status: "published",
      brief: { objective: "Explain roast dates versus freshness in plain language.", acceptanceCriteria: ["800-1200 words", "One clear CTA"] },
      createdAt: days(-6), startedAt: days(-6), completedAt: days(-5),
    },
    {
      id: t3, employee: ALEX_ID, goalId: goalLinkedIn, title: "Competitor teardown: Blue Bottle subscription",
      taskType: "report", origin: "proactive", status: "review",
      brief: { objective: "Tear down the Blue Bottle subscription onboarding and positioning.", acceptanceCriteria: ["3-line TL;DR", "Where we win", "One thing to steal"] },
      createdAt: days(-2), startedAt: days(-2),
    },
    {
      id: t4, employee: ALEX_ID, goalId: goalLinkedIn, title: "Draft the October subscriber newsletter",
      taskType: "email", origin: "user_created", status: "review",
      brief: { objective: "Monthly newsletter featuring the new Guji lot and a brewing tip.", acceptanceCriteria: ["Subject under 50 chars", "Scannable sections"] },
      createdAt: days(-2), startedAt: days(-1),
    },
    {
      id: t5, employee: ALEX_ID, goalId: goalContentSeries, title: "LinkedIn post: behind the roast schedule",
      taskType: "social_linkedin", origin: "recurring", status: "working",
      brief: { objective: "Show how the weekly roast calendar keeps bags fresh.", acceptanceCriteria: ["Under 150 words"] },
      createdAt: hours(-6), startedAt: hours(-3),
    },
    {
      id: t6, employee: JORDAN_ID, goalId: goalDemos, title: "Cold email sequence to office managers",
      taskType: "email", origin: "user_created", status: "approved",
      brief: { objective: "Three-email sequence for office managers at 20 to 100 person NYC companies.", acceptanceCriteria: ["Each email under 90 words", "Different angle per email", "One low-friction CTA"], pinnedGoal: pinned(goalDemos, "Book 15 office-coffee demo calls") },
      createdAt: days(-5), startedAt: days(-5), completedAt: days(-4),
    },
    {
      id: t7, employee: JORDAN_ID, goalId: goalDemos, title: "Personalized outreach to a WeWork facilities lead",
      taskType: "email", origin: "user_created", status: "review",
      brief: { objective: "One personalized email to a named facilities lead.", acceptanceCriteria: ["Reference something specific about them", "Under 120 words"] },
      createdAt: days(-1), startedAt: days(-1),
    },
    {
      id: t8, employee: JORDAN_ID, goalId: goalDemos, title: "Build a prospect list of 50 NYC coworking spaces",
      taskType: "report", origin: "proactive", status: "approved",
      brief: { objective: "Research 50 coworking and startup offices with headcount and contact.", acceptanceCriteria: ["50 rows", "Decision-maker role per row"] },
      createdAt: days(-3), startedAt: days(-3), completedAt: days(-1),
    },
    {
      id: t9, employee: JORDAN_ID, goalId: goalDemos, title: "Follow-up email to last week's trial signups",
      taskType: "email", origin: "user_created", status: "pending",
      brief: { objective: "Re-engage trial signups who have not placed a first order.", acceptanceCriteria: ["Under 100 words"] },
      createdAt: hours(-20), scheduledAt: hours(8),
    },
    {
      id: t10, employee: SAM_ID, goalId: goalResponse, title: "Reply to this week's subscription-pause tickets",
      taskType: "custom", origin: "user_created", status: "published",
      brief: { objective: "Draft a warm reply for customers pausing after the billing email.", acceptanceCriteria: ["Acknowledge first", "Offer skip as an alternative to pause"] },
      createdAt: days(-4), startedAt: days(-4), completedAt: days(-3),
    },
    {
      id: t11, employee: SAM_ID, goalId: goalResponse, title: "Write FAQ: how to adjust grind size",
      taskType: "faq", origin: "collaboration", status: "approved",
      brief: { objective: "Step-by-step FAQ for adjusting grind on the new burr setting.", acceptanceCriteria: ["Numbered steps", "Direct answer first"] },
      createdAt: days(-3), startedAt: days(-3), completedAt: days(-2),
    },
    {
      id: t12, employee: SAM_ID, goalId: goalResponse, title: "Draft response to shipping-delay complaints",
      taskType: "faq", origin: "proactive", status: "review",
      brief: { objective: "A reusable reply for the carrier delay affecting the Northeast.", acceptanceCriteria: ["Own the delay", "Give a realistic window"] },
      createdAt: days(-1), startedAt: hours(-18),
    },
    {
      id: t13, employee: SAM_ID, goalId: goalResponse, title: "Reply to an escalated refund request",
      taskType: "custom", origin: "user_created", status: "revision",
      brief: { objective: "Reply to a customer asking for a full refund on a stale bag.", acceptanceCriteria: ["Empathetic", "Offer replacement or refund"] },
      createdAt: days(-2), startedAt: days(-2),
    },
  ];

  await db.insert(tasks).values(
    taskSeeds.map((t) => ({
      id: t.id,
      companyId: COMPANY_ID,
      aiEmployeeId: t.employee,
      goalId: t.goalId,
      parentTaskId: null,
      title: t.title,
      brief: t.brief,
      taskType: t.taskType,
      origin: t.origin,
      status: t.status,
      planApproved: t.status === "approved" || t.status === "published",
      scheduledAt: t.scheduledAt ?? null,
      startedAt: t.startedAt ?? null,
      completedAt: t.completedAt ?? null,
      createdAt: t.createdAt,
    })),
  );

  const aiTrail = (
    a: { in: string; out: string; ms: number; t: number },
    b?: { in: string; out: string; ms: number; t: number },
    c?: { in: string; out: string; ms: number; t: number },
  ) =>
    [a, b, c].filter(Boolean).map((s, i) => ({
      toolCallId: `tc-${randomUUID().slice(0, 8)}-${i}`,
      name: i === 0 ? "web_search" : "web_fetch",
      inputSummary: s!.in,
      resultSummary: s!.out,
      durationMs: s!.ms,
      startedAt: iso(-s!.t),
    }));

  const d1 = randomUUID();
  const d2 = randomUUID();
  const d3 = randomUUID();
  const d4 = randomUUID();
  const d6 = randomUUID();
  const d7 = randomUUID();
  const d8 = randomUUID();
  const d10 = randomUUID();
  const d11 = randomUUID();
  const d12 = randomUUID();
  const d13 = randomUUID();

  // Procedural rule ids are minted here so deliverable appliedRules can point
  // at the real rules the dashboard memory receipt renders.
  const alexRule1 = randomUUID();
  const alexRule2 = randomUUID();
  const alexRule3 = randomUUID();
  const alexRule4 = randomUUID();
  const jordanRule1 = randomUUID();
  const jordanRule2 = randomUUID();
  const samRule1 = randomUUID();
  const samRule2 = randomUUID();

  const d1Body =
    "This advances your goal: ship the single-origin sourcing content series.\n\n" +
    "Most coffee subscriptions print a roast date and call it transparency. You deserve the whole story.\n\n" +
    "Every Northwind bag now ships with the farm, the lot, and the week it was roasted. Our current Ethiopia Guji lot comes from 14 smallholder farmers near Hambela, picked at peak ripeness and dried on raised beds[^web-1]. The Colombia Huila lot is washed and dried for 18 days, which is why it tastes like brown sugar and stone fruit instead of generic dark roast[^web-2].\n\n" +
    "Knowing where your coffee comes from is not a luxury. It is the difference between a cup you drink and a cup you understand.\n\n" +
    "Tasting notes, farm photos, and the roast calendar are in every box. Pause or skip anytime.\n\n" +
    "What is in your cup this morning?";

  const d3Body =
    "TL;DR: Blue Bottle wins on brand and retail, but their subscription hides the origin story until checkout. That gap is ours to take.\n\n" +
    "Onboarding: Blue Bottle asks three taste questions, then routes you to a blend by default[^web-4]. Single-origin is a filter you have to find. Northwind leads with the lot.\n\n" +
    "Positioning: their pitch is convenience and consistency. Ours is knowing exactly what is in the bag, down to the farm and the drying time[^kb-1].\n\n" +
    "One thing to steal: their pause flow is one tap and guilt-free. We should match that wording in Sam's pause replies.";

  const d6Body =
    "Subject: your team's 3pm coffee run\n\n" +
    "Hi Dana,\n\n" +
    "Most 30-person offices burn an hour a week on coffee runs and still end up with lukewarm drip. Northwind ships fresh single-origin beans on a weekly cadence sized to your headcount, so the kitchen never runs dry[^kb-2].\n\n" +
    "Worth a 15-minute look at what a week of Office tier would cost your team?\n\n" +
    "Jordan, Northwind";

  const deliverableSeeds = [
    {
      id: d1, taskId: t1, employee: ALEX_ID, type: "social_linkedin",
      title: "LinkedIn post: what is actually in your cup",
      status: "approved", createdAt: days(-6), updatedAt: days(-6),
      approvedAt: days(-6), approvalRationale: "Loved the named-lot detail. Approved with no edits.",
      content: {
        content: d1Body,
        citations: [
          { id: "web-1", type: "web", title: "Hambela Guji growing region profile", url: "https://www.perfectdailygrind.test/ethiopia-guji", domain: "perfectdailygrind.test", snippet: "Guji's high-altitude smallholder farms are known for raised-bed processing and bright, floral cups.", lastModified: iso(-30) },
          { id: "web-2", type: "web", title: "Huila washed process drying times", url: "https://www.scanews.test/huila-washed", domain: "scanews.test", snippet: "Extended drying of 16 to 20 days in Huila concentrates sweetness and stone-fruit acidity.", lastModified: iso(-45) },
        ],
        trail: aiTrail(
          { in: "Ethiopia Guji Hambela smallholder processing", out: "Found 5 sources on raised-bed drying and floral cup profiles.", ms: 1300, t: 6 },
          { in: "https://www.perfectdailygrind.test/ethiopia-guji", out: "Confirmed 14-farmer cooperative and raised-bed method.", ms: 820, t: 6 },
          { in: "https://www.scanews.test/huila-washed", out: "Huila washed lots dried 16 to 20 days, sweet and stone-fruit forward.", ms: 760, t: 6 },
        ),
        appliedRules: [
          { ruleId: alexRule1, summary: "Open posts by tying back to the founder's goal", evidence: "Posts that lead with the goal get approved without edits.", extractedFromDeliverableId: d1, extractedFromTitle: "LinkedIn post: what is actually in your cup", extractedAt: iso(-8), confidence: 0.92 },
          { ruleId: alexRule2, summary: "Lead with the specific lot, farm, and process", evidence: "Named sourcing detail beats generic 'ethically sourced' language.", extractedFromDeliverableId: d1, extractedFromTitle: "LinkedIn post: what is actually in your cup", extractedAt: iso(-5), confidence: 0.88 },
        ],
      },
      renderedPreview: "Most coffee subscriptions print a roast date and call it transparency. You deserve the whole story. Every Northwind bag now ships with the farm, the lot, and the week it was roasted.",
    },
    {
      id: d2, taskId: t2, employee: ALEX_ID, type: "blog",
      title: "The truth about coffee freshness dates",
      status: "published", createdAt: days(-5), updatedAt: days(-5),
      approvedAt: days(-5), publishedUrl: "https://www.northwindcoffee.test/blog/coffee-freshness-dates", publishedAt: days(-5),
      content: {
        content:
          "This advances your goal: ship the single-origin sourcing content series.\n\n" +
          "A roast date tells you when the beans were roasted. It does not tell you when they will taste their best. Most beans hit their peak 4 to 14 days after roasting, then fade[^web-3].\n\n" +
          "That is why Northwind roasts to a weekly calendar and ships within 48 hours. You get beans in their window, not beans that sat in a warehouse for a season.\n\n" +
          "Check the roast date on your next bag. If it is more than a month old, your coffee is telling on itself.\n\n" +
          "Want beans in their window every week? Start with a single-origin box.",
        citations: [
          { id: "web-3", type: "web", title: "Coffee degassing and peak flavor window", url: "https://www.baristahustle.test/degassing", domain: "baristahustle.test", snippet: "Roasted coffee releases CO2 for days; most filter coffee peaks roughly 1 to 2 weeks post roast.", lastModified: iso(-20) },
        ],
        appliedRules: [
          { ruleId: alexRule3, summary: "Avoid filler words like artisanal and premium", evidence: "Maya edited those words out of two drafts.", extractedFromDeliverableId: d2, extractedFromTitle: "The truth about coffee freshness dates", extractedAt: iso(-3), confidence: 0.81 },
        ],
      },
      renderedPreview: "A roast date tells you when the beans were roasted. It does not tell you when they will taste their best. Most beans hit their peak 4 to 14 days after roasting, then fade.",
    },
    {
      id: d3, taskId: t3, employee: ALEX_ID, type: "report",
      title: "Teardown: Blue Bottle subscription",
      status: "pending_review", createdAt: days(-2), updatedAt: days(-2),
      content: {
        content: d3Body,
        citations: [
          { id: "web-4", type: "web", title: "Blue Bottle subscription onboarding walkthrough", url: "https://www.thespruceeats.test/blue-bottle-review", domain: "thespruceeats.test", snippet: "The flow asks a few taste questions then defaults new subscribers to a blend.", lastModified: iso(-15) },
          { id: "kb-1", type: "kb", title: "Northwind positioning: per-lot transparency", snippet: "We differentiate on farm, lot, and drying-time detail printed on every bag.", employeeId: ALEX_ID },
        ],
        trail: aiTrail(
          { in: "Blue Bottle subscription onboarding steps", out: "Found a walkthrough showing a blend-default flow.", ms: 1100, t: 2 },
          { in: "https://www.thespruceeats.test/blue-bottle-review", out: "Confirmed taste-quiz then blend default; single-origin is a filter.", ms: 700, t: 2 },
        ),
        appliedRules: [
          { ruleId: alexRule2, summary: "Lead with the specific lot, farm, and process", evidence: "Concrete sourcing detail is our wedge against blend-first competitors.", extractedFromDeliverableId: d1, extractedFromTitle: "LinkedIn post: what is actually in your cup", extractedAt: iso(-5), confidence: 0.88 },
        ],
      },
      renderedPreview: "TL;DR: Blue Bottle wins on brand and retail, but their subscription hides the origin story until checkout. That gap is ours to take.",
    },
    {
      id: d4, taskId: t4, employee: ALEX_ID, type: "email",
      title: "October subscriber newsletter",
      status: "pending_review", createdAt: days(-1), updatedAt: days(-1),
      content: {
        body:
          "Subject: a new Guji lot just landed\n\n" +
          "Hi there,\n\n" +
          "This month we are pouring a fresh Ethiopia Guji from 14 farmers near Hambela. Expect jasmine on the nose and a clean, tea-like finish.\n\n" +
          "Brewing tip: for the Guji, go a touch coarser and pour slower. It opens up the florals.\n\n" +
          "Your next box ships Thursday. Skip or swap anytime from your account.\n\n" +
          "Maya and the Northwind team",
        citations: [],
      },
      renderedPreview: "This month we are pouring a fresh Ethiopia Guji from 14 farmers near Hambela. Expect jasmine on the nose and a clean, tea-like finish.",
    },
    {
      id: d6, taskId: t6, employee: JORDAN_ID, type: "email",
      title: "Cold email: office coffee for Dana at Foundry Labs",
      status: "approved", createdAt: days(-4), updatedAt: days(-4),
      approvedAt: days(-4), approvalRationale: "Tight and specific. Good pain-led opener.",
      content: {
        body: d6Body,
        citations: [
          { id: "kb-2", type: "kb", title: "Office tier sizing and cadence", snippet: "Office tier ships 5 bags per week, sized to headcount, with weekly delivery.", employeeId: JORDAN_ID },
        ],
        appliedRules: [
          { ruleId: jordanRule1, summary: "Keep cold emails under 90 words", evidence: "Replies improved when emails dropped under 90 words.", extractedFromDeliverableId: d6, extractedFromTitle: "Cold email: office coffee for Dana at Foundry Labs", extractedAt: iso(-4), confidence: 0.84 },
          { ruleId: jordanRule2, summary: "Lead with the prospect's pain, not the product", evidence: "Opening on the 3pm coffee run beat opening on the subscription.", extractedFromDeliverableId: d6, extractedFromTitle: "Cold email: office coffee for Dana at Foundry Labs", extractedAt: iso(-6), confidence: 0.79 },
        ],
      },
      renderedPreview: "Most 30-person offices burn an hour a week on coffee runs and still end up with lukewarm drip. Northwind ships fresh single-origin beans on a weekly cadence sized to your headcount.",
    },
    {
      id: d7, taskId: t7, employee: JORDAN_ID, type: "email",
      title: "Outreach: WeWork facilities lead",
      status: "pending_review", createdAt: days(-1), updatedAt: days(-1),
      content: {
        body:
          "Subject: the coffee in your member lounges\n\n" +
          "Hi Marcus,\n\n" +
          "Saw that your Flatiron location just reopened its member cafe. Member coffee is one of those small things people notice every single day.\n\n" +
          "Northwind can supply fresh single-origin beans on a weekly cadence, with origin cards your members can read while they wait. Open to a quick taste sample for the lounge?\n\n" +
          "Jordan, Northwind",
        citations: [],
      },
      renderedPreview: "Saw that your Flatiron location just reopened its member cafe. Member coffee is one of those small things people notice every single day.",
    },
    {
      id: d8, taskId: t8, employee: JORDAN_ID, type: "report",
      title: "Prospect list: 50 NYC coworking and startup offices",
      status: "approved", createdAt: days(-1), updatedAt: days(-1),
      approvedAt: days(-1), approvalRationale: "Solid list. Headcounts and roles are what I needed.",
      content: {
        content:
          "Built a list of 50 NYC offices between 20 and 100 people, each with a named facilities or office manager and a headcount estimate.\n\n" +
          "Top 5 by fit:\n" +
          "1. Foundry Labs, Flatiron, ~45 people, Office Manager: Dana R.\n" +
          "2. Beacon Studios, SoHo, ~30 people, Ops Lead: Priya S.\n" +
          "3. North Loop Cowork, Williamsburg, ~80 desks, Community Manager: Theo M.\n" +
          "4. Hatch NYC, Midtown, ~60 people, Facilities: Marcus L.\n" +
          "5. Verdant Health, Chelsea, ~25 people, Office Manager: Kim T.\n\n" +
          "Full sheet attached with contact and tier recommendation per row.",
        citations: [],
      },
      renderedPreview: "Built a list of 50 NYC offices between 20 and 100 people, each with a named facilities or office manager and a headcount estimate.",
    },
    {
      id: d10, taskId: t10, employee: SAM_ID, type: "custom",
      title: "Reply template: subscription pause",
      status: "published", createdAt: days(-3), updatedAt: days(-3),
      approvedAt: days(-3), publishedUrl: "https://help.northwindcoffee.test/macros/pause-reply", publishedAt: days(-3),
      content: {
        response:
          "Hi {{first_name}},\n\n" +
          "Totally understand wanting to pause, and thanks for telling us instead of just letting bags pile up.\n\n" +
          "I have paused your subscription effective today, so you will not be billed again until you restart. If you are pausing because the coffee was arriving faster than you drink it, you can also switch to a skip every other week instead, which keeps your spot and your pricing.\n\n" +
          "Either way, no pressure. Want me to set up the skip, or leave the pause as is?\n\n" +
          "Sam, Northwind Support",
        citations: [],
      },
      renderedPreview: "Totally understand wanting to pause, and thanks for telling us instead of just letting bags pile up. I have paused your subscription effective today.",
    },
    {
      id: d11, taskId: t11, employee: SAM_ID, type: "faq",
      title: "FAQ: how to adjust your grind size",
      status: "approved", createdAt: days(-2), updatedAt: days(-2),
      approvedAt: days(-2), approvalRationale: "Clear steps. Ship it to the help center.",
      content: {
        content:
          "How do I adjust the grind size on the new burr setting?\n\n" +
          "Short answer: turn the collar one notch at a time and taste between changes.\n\n" +
          "1. Start at the middle setting (notch 8 of 16).\n" +
          "2. If your cup tastes sour or thin, go one notch finer.\n" +
          "3. If it tastes bitter or harsh, go one notch coarser.\n" +
          "4. Make one change at a time, brew, and taste before adjusting again.\n\n" +
          "For pour-over, aim a little coarser than you think. For espresso, finer. Still stuck? Reply here and we will dial it in with you.",
        citations: [],
      },
      renderedPreview: "How do I adjust the grind size on the new burr setting? Short answer: turn the collar one notch at a time and taste between changes.",
    },
    {
      id: d12, taskId: t12, employee: SAM_ID, type: "faq",
      title: "Reply template: shipping delay (Northeast carrier)",
      status: "pending_review", createdAt: days(-1), updatedAt: days(-1),
      content: {
        response:
          "Hi {{first_name}},\n\n" +
          "You are right that this one is running late, and I am sorry. Our Northeast carrier hit a backlog this week and your box is sitting a few days behind its usual window.\n\n" +
          "Here is where things stand: it is scanned and moving, and I expect it to reach you within 2 to 3 business days. If it has not arrived by then, reply here and I will ship a fresh bag overnight at no cost.\n\n" +
          "Thanks for your patience while we get it to you.\n\n" +
          "Sam, Northwind Support",
        citations: [],
      },
      renderedPreview: "You are right that this one is running late, and I am sorry. Our Northeast carrier hit a backlog this week and your box is sitting a few days behind its usual window.",
    },
    {
      id: d13, taskId: t13, employee: SAM_ID, type: "custom",
      title: "Reply: escalated refund request",
      status: "rejected", createdAt: days(-2), updatedAt: days(-1),
      content: {
        response:
          "Dear valued customer,\n\n" +
          "We have received your request for a refund regarding the product in question. Per our standard policy, we are able to process a replacement or a refund for items reported within the freshness window.\n\n" +
          "Please advise which resolution you would prefer and we will proceed accordingly.\n\n" +
          "Regards,\nNorthwind Support",
        citations: [],
      },
      renderedPreview: "We have received your request for a refund regarding the product in question. Per our standard policy, we are able to process a replacement or a refund.",
    },
  ];

  await db.insert(deliverables).values(
    deliverableSeeds.map((d) => ({
      id: d.id,
      taskId: d.taskId,
      companyId: COMPANY_ID,
      aiEmployeeId: d.employee,
      deliverableType: d.type,
      title: d.title,
      content: d.content,
      renderedPreview: d.renderedPreview,
      version: 1,
      status: d.status,
      publishedUrl: (d as { publishedUrl?: string }).publishedUrl ?? null,
      publishedAt: (d as { publishedAt?: Date }).publishedAt ?? null,
      approvalRationale: (d as { approvalRationale?: string }).approvalRationale ?? null,
      approvedAt: (d as { approvedAt?: Date }).approvedAt ?? null,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    })),
  );

  // Procedural memories. Dashboard memory receipt renders the primary
  // (earliest-created) employee's current rules with signalWeight >= 0.7.
  // sourceEpisodes[0] is read by the UI as the "extracted from" deliverable
  // link, so it points at a real deliverable id rather than an episode id.
  await db.insert(proceduralMemories).values([
    { id: alexRule1, agentId: ALEX_ID, tenantId: COMPANY_ID, ruleType: "style_rule", taskScope: ["social_linkedin", "blog"], title: "Open posts by tying back to the founder's goal", description: "Maya approves faster when the first line names the goal the post advances. Goal-led posts get approved without edits.", examples: { good: "This advances your goal: ship the sourcing series." }, version: 1, isCurrent: true, sourceEpisodes: [d1], signalCount: 7, signalWeight: 0.92, tasksAppliedTo: 7, approvalRateDelta: 0.22, createdAt: days(-8) },
    { id: alexRule2, agentId: ALEX_ID, tenantId: COMPANY_ID, ruleType: "approved_example", taskScope: ["social_linkedin", "blog", "report"], title: "Lead with the specific lot, farm, and process", description: "Concrete sourcing detail (farm, region, drying time) outperforms generic 'ethically sourced' language. Three approved posts used named lots.", examples: { good: "14 smallholder farmers near Hambela, dried on raised beds." }, version: 1, isCurrent: true, sourceEpisodes: [d1], signalCount: 5, signalWeight: 0.88, tasksAppliedTo: 5, approvalRateDelta: 0.18, createdAt: days(-5) },
    { id: alexRule3, agentId: ALEX_ID, tenantId: COMPANY_ID, ruleType: "avoid_pattern", taskScope: ["social_linkedin", "blog", "email"], title: "Avoid filler words like artisanal, curated, and premium", description: "Maya edited out artisanal, curated, and premium from two drafts. Use plain, concrete words instead.", examples: { avoid: ["artisanal", "curated", "premium"] }, version: 1, isCurrent: true, sourceEpisodes: [d2], signalCount: 4, signalWeight: 0.81, tasksAppliedTo: 4, approvalRateDelta: 0.12, createdAt: days(-3) },
    { id: alexRule4, agentId: ALEX_ID, tenantId: COMPANY_ID, ruleType: "style_rule", taskScope: ["social_linkedin"], title: "End with one soft question, not a hard sell", description: "Posts that close with an open question get more comments than posts ending in 'Subscribe now'.", examples: { good: "What is in your cup this morning?" }, version: 1, isCurrent: true, sourceEpisodes: [d1], signalCount: 3, signalWeight: 0.76, tasksAppliedTo: 3, approvalRateDelta: 0.09, createdAt: days(-9) },
    { id: jordanRule1, agentId: JORDAN_ID, tenantId: COMPANY_ID, ruleType: "style_rule", taskScope: ["email"], title: "Keep cold emails under 90 words", description: "Reply rate improved when emails dropped under 90 words. Office managers skim.", examples: { good: "Three sentences, one CTA." }, version: 1, isCurrent: true, sourceEpisodes: [d6], signalCount: 4, signalWeight: 0.84, tasksAppliedTo: 4, approvalRateDelta: 0.15, createdAt: days(-4) },
    { id: jordanRule2, agentId: JORDAN_ID, tenantId: COMPANY_ID, ruleType: "approved_example", taskScope: ["email"], title: "Lead with the prospect's pain, not the product", description: "Opening on 'your team's 3pm coffee run' beat opening on 'our subscription'.", examples: { good: "your team's 3pm coffee run" }, version: 1, isCurrent: true, sourceEpisodes: [d6], signalCount: 3, signalWeight: 0.79, tasksAppliedTo: 3, approvalRateDelta: 0.13, createdAt: days(-6) },
    { id: samRule1, agentId: SAM_ID, tenantId: COMPANY_ID, ruleType: "style_rule", taskScope: ["faq", "custom"], title: "Acknowledge the frustration before the fix", description: "Replies that name the customer's situation first get fewer follow-up complaints.", examples: { good: "You are right that this one is running late, and I am sorry." }, version: 1, isCurrent: true, sourceEpisodes: [d11], signalCount: 6, signalWeight: 0.86, tasksAppliedTo: 6, approvalRateDelta: 0.2, createdAt: days(-2) },
    { id: samRule2, agentId: SAM_ID, tenantId: COMPANY_ID, ruleType: "avoid_pattern", taskScope: ["custom"], title: "Never blame the customer for a billing issue", description: "Defensive phrasing on pause and refund tickets escalated twice. Own the issue instead.", examples: { avoid: "per our standard policy" }, version: 1, isCurrent: true, sourceEpisodes: [d11], signalCount: 2, signalWeight: 0.74, tasksAppliedTo: 2, approvalRateDelta: 0.05, createdAt: days(-7) },
  ]);

  await db.insert(semanticMemories).values([
    { tenantId: COMPANY_ID, scope: "shared", agentId: null, fact: "Northwind's voice is plain, warm, and specific. Avoid the words artisanal, curated, and premium.", context: "Learned from founder edits across approved posts.", category: "brand_voice", entityName: "Northwind", entityType: "brand", confidence: 0.95, source: "onboarding", validFrom: days(-12) },
    { tenantId: COMPANY_ID, scope: "shared", agentId: null, fact: "Core subscribers are home coffee drinkers aged 28 to 45 who care about origin and freshness over price.", context: "From the founder interview.", category: "audience", entityName: "Core subscriber", entityType: "segment", confidence: 0.9, source: "interview", validFrom: days(-12) },
    { tenantId: COMPANY_ID, scope: "shared", agentId: null, fact: "Subscription tiers are Single Origin (1 bag every 2 weeks, $19), Explorer (2 bags every 2 weeks, $34), and Office (5 bags weekly, $120).", context: "Pricing sheet.", category: "products", entityName: "Subscription tiers", entityType: "product", confidence: 1.0, source: "document", validFrom: days(-12) },
    { tenantId: COMPANY_ID, scope: "shared", agentId: null, fact: "Blue Bottle, Trade, and Atlas Coffee Club are the main subscription competitors. Northwind differentiates on per-lot sourcing transparency.", context: "Competitive scan.", category: "competitors", entityName: "Blue Bottle", entityType: "competitor", confidence: 0.85, source: "url_crawl", validFrom: days(-9) },
  ]);

  await db.insert(episodicMemories).values([
    { agentId: ALEX_ID, tenantId: COMPANY_ID, episodeType: "feedback_received", summary: "Maya approved the single-origin LinkedIn post with no edits", content: { deliverableId: d1, decision: "approved", note: "Loved the named-lot detail" }, occurredAt: days(-6), taskId: t1, salienceScore: 0.8, accessCount: 3, isConsolidated: false },
    { agentId: ALEX_ID, tenantId: COMPANY_ID, episodeType: "feedback_received", summary: "Maya edited out 'artisanal' from the freshness blog before publishing", content: { deliverableId: d2, decision: "approved_with_edits", removed: ["artisanal"] }, occurredAt: days(-5), taskId: t2, salienceScore: 0.7, accessCount: 2, isConsolidated: false },
    { agentId: JORDAN_ID, tenantId: COMPANY_ID, episodeType: "task_completed", summary: "Sent the cold email sequence to 50 office managers", content: { taskId: t6, count: 50 }, occurredAt: days(-4), taskId: t6, salienceScore: 0.6, accessCount: 1, isConsolidated: false },
    { agentId: SAM_ID, tenantId: COMPANY_ID, episodeType: "feedback_received", summary: "Founder rejected the refund reply as too formal", content: { deliverableId: d13, decision: "rejected", note: "Loosen the tone, drop the policy language" }, occurredAt: days(-1), taskId: t13, salienceScore: 0.75, accessCount: 1, isConsolidated: false },
  ]);

  await db.insert(collaborationProposals).values([
    { companyId: COMPANY_ID, fromEmployeeId: ALEX_ID, toEmployeeId: JORDAN_ID, sourceDeliverableId: d1, proposal: "The single-origin sourcing posts are landing well. Want me to package the top three as a one-pager you can attach to office-manager outreach?", status: "pending", createdAt: days(-2) },
    { companyId: COMPANY_ID, fromEmployeeId: SAM_ID, toEmployeeId: ALEX_ID, sourceDeliverableId: d11, proposal: "Three customers this week asked how to adjust grind size on the new burr setting. Worth a short how-to post from you?", status: "pending", createdAt: days(-1) },
  ]);

  await db.insert(autonomySuggestions).values([
    { companyId: COMPANY_ID, aiEmployeeId: ALEX_ID, action: "publishSocial", consecutiveApprovals: 4, message: "Alex has had 4 LinkedIn posts approved in a row with no edits. Want to let Alex publish approved social posts automatically?", state: "queued", createdAt: days(-2), updatedAt: days(-2) },
  ]);

  await db.insert(knowledgeItems).values([
    { companyId: COMPANY_ID, category: "company_overview", title: "About Northwind", content: "Northwind is a direct-to-consumer specialty coffee subscription brand. We source single-origin lots, roast to a weekly calendar, and ship within 48 hours so beans arrive in their flavor window. Founded by Maya Chen, 22 people, based in Brooklyn.", sourceType: "interview", aiSummary: "DTC single-origin coffee subscription, weekly roast cadence, founder Maya Chen.", verified: true, verifiedAt: days(-11) },
    { companyId: COMPANY_ID, category: "products", title: "Subscription tiers and pricing", content: "Single Origin: one bag every two weeks, $19. Explorer: two bags every two weeks, $34. Office: five bags weekly sized to headcount, $120. All tiers can pause, skip, or swap from the account page.", sourceType: "document", aiSummary: "Three tiers: Single Origin $19, Explorer $34, Office $120. Pause or skip anytime.", verified: true, verifiedAt: days(-11) },
    { companyId: COMPANY_ID, category: "audience", title: "Who we serve", content: "Home coffee drinkers aged 28 to 45 who care about origin and freshness over price, plus small offices of 20 to 100 people that want better coffee without the warehouse-club bulk. They value knowing the farm and the roast date.", sourceType: "interview", aiSummary: "Origin-curious home drinkers 28 to 45, and small offices of 20 to 100.", verified: true, verifiedAt: days(-10) },
    { companyId: COMPANY_ID, category: "brand_voice", title: "Northwind voice and tone", content: "Plain, warm, and specific. We sound like a knowledgeable friend, not a luxury catalog. Back claims with a real detail (farm, lot, drying time). Avoid the words artisanal, curated, and premium. Never use em-dashes. Close posts with a soft question, not a hard sell.", sourceType: "feedback_learned", aiSummary: "Plain, warm, specific. No artisanal or premium. Soft CTAs.", verified: true, verifiedAt: days(-3) },
    { companyId: COMPANY_ID, category: "competitors", title: "Competitive landscape", content: "Main subscription competitors are Blue Bottle, Trade, and Atlas Coffee Club. Blue Bottle leads on brand and retail but defaults new subscribers to blends. Trade is a marketplace matching engine. Atlas is travel-themed variety. Northwind wins on per-lot sourcing transparency printed on every bag.", sourceType: "url_crawl", aiSummary: "Blue Bottle, Trade, Atlas. We differentiate on per-lot transparency.", verified: true, verifiedAt: days(-9) },
    { companyId: COMPANY_ID, category: "processes", title: "Roasting and fulfillment cadence", content: "We roast Monday and Thursday, then ship within 48 hours. Orders placed before Sunday midnight make the Monday roast. The Northeast is served by a regional carrier that occasionally backs up; Sam owns the delay-reply macro.", sourceType: "document", aiSummary: "Roast Mon and Thu, ship within 48h. Northeast carrier can back up.", verified: true, verifiedAt: days(-8) },
    { companyId: COMPANY_ID, category: "historical_outputs", title: "Top performing content", content: "The 'what is actually in your cup' LinkedIn post drove the most profile visits and subscription clicks last month. Named-lot posts consistently beat generic origin posts. The freshness-dates blog is our best-performing evergreen piece.", sourceType: "feedback_learned", aiSummary: "Named-lot posts and the freshness blog perform best.", verified: false },
  ]);

  // Check-ins: post-approval follow-ups read by the dashboard inline card and
  // the /checkins page (both use content.deliverableTitle + deliverableType).
  await db.insert(checkIns).values([
    { aiEmployeeId: ALEX_ID, companyId: COMPANY_ID, checkInType: "post_approval_followup", taskId: t1, acknowledged: false, scheduledFor: hours(20), createdAt: days(-6), content: { deliverableId: d1, deliverableTitle: "LinkedIn post: what is actually in your cup", deliverableType: "social_linkedin", goalId: goalContentSeries, approvedAt: iso(-6), scheduledFor: hours(20).toISOString(), summary: "This post was approved with no edits. Want me to schedule it for Tuesday at 9am when your audience is most active?" } },
    { aiEmployeeId: JORDAN_ID, companyId: COMPANY_ID, checkInType: "post_approval_followup", taskId: t6, acknowledged: false, scheduledFor: hours(-2), createdAt: days(-4), content: { deliverableId: d6, deliverableTitle: "Cold email: office coffee for Dana at Foundry Labs", deliverableType: "email", goalId: goalDemos, approvedAt: iso(-4), scheduledFor: hours(-2).toISOString(), summary: "The Foundry Labs email is approved. Should I send it now, or hold for the rest of the 50-prospect batch to go together?" } },
    { aiEmployeeId: SAM_ID, companyId: COMPANY_ID, checkInType: "post_approval_followup", taskId: t11, acknowledged: false, scheduledFor: hours(40), createdAt: days(-2), content: { deliverableId: d11, deliverableTitle: "FAQ: how to adjust your grind size", deliverableType: "faq", goalId: null, approvedAt: iso(-2), scheduledFor: hours(40).toISOString(), summary: "The grind-size FAQ is approved. Want it published to the help center and linked from the grind macro?" } },
    { aiEmployeeId: ALEX_ID, companyId: COMPANY_ID, checkInType: "daily_summary", taskId: null, acknowledged: true, response: "used", scheduledFor: days(-1), createdAt: days(-1), content: { headline: "Two posts approved, one teardown in review", summary: "Shipped the freshness blog and got the sourcing post approved. The Blue Bottle teardown is waiting on your review.", deliverableTitle: "Daily wrap-up", deliverableType: "summary", completedTasks: [{ taskId: t1, title: "Draft 3 LinkedIn posts on single-origin sourcing", status: "approved" }, { taskId: t2, title: "Write blog: the truth about coffee freshness dates", status: "published" }], highlights: ["Named-lot posts keep getting approved with no edits"], suggestedActions: ["Review the Blue Bottle teardown"] } },
  ]);

  await db.insert(chatMessages).values([
    { companyId: COMPANY_ID, aiEmployeeId: ALEX_ID, role: "user", content: "Can you focus this week's posts on single-origin sourcing?", createdAt: days(-7) },
    { companyId: COMPANY_ID, aiEmployeeId: ALEX_ID, role: "assistant", content: "On it. I'll draft three posts that connect our Ethiopia Guji and Colombia Huila lots to the freshness story, each with a soft CTA to the subscription. First draft up for review today.", taskId: t1, createdAt: days(-7) },
    { companyId: COMPANY_ID, aiEmployeeId: JORDAN_ID, role: "user", content: "Who should we target for the office coffee push?", createdAt: days(-5) },
    { companyId: COMPANY_ID, aiEmployeeId: JORDAN_ID, role: "assistant", content: "Office and facilities managers at 20 to 100 person NYC companies. I'm building a list of 50 coworking and startup offices to start, then a three-email sequence that opens on their pain, not our product.", taskId: t6, createdAt: days(-5) },
    { companyId: COMPANY_ID, aiEmployeeId: SAM_ID, role: "user", content: "Anything trending in the support queue?", createdAt: days(-3) },
    { companyId: COMPANY_ID, aiEmployeeId: SAM_ID, role: "assistant", content: "Subscription-pause requests spiked after the billing email. I drafted a warm reply that offers skip as an alternative, and I flagged a grind-size FAQ so we get ahead of the repeat questions.", taskId: t10, createdAt: days(-3) },
  ]);

  const A = (
    aiEmployeeId: string | null,
    actionType: string,
    actionDetail: Record<string, unknown>,
    createdAt: Date,
    reasoning?: string,
  ) => ({ companyId: COMPANY_ID, aiEmployeeId, actionType, actionDetail, reasoning: reasoning ?? null, createdAt });

  await db.insert(activityLog).values([
    A(ALEX_ID, "employee_hired", { aiEmployeeId: ALEX_ID, name: "Alex", roleTitle: "Marketing Manager", roleType: "marketing" }, days(-12)),
    A(JORDAN_ID, "employee_hired", { aiEmployeeId: JORDAN_ID, name: "Jordan", roleTitle: "SDR (Sales Development Rep)", roleType: "sales" }, days(-11)),
    A(SAM_ID, "employee_hired", { aiEmployeeId: SAM_ID, name: "Sam", roleTitle: "Support Lead", roleType: "support" }, days(-11)),
    A(ALEX_ID, "deliverable_approved", { deliverableTitle: "LinkedIn post: what is actually in your cup", deliverableId: d1, taskType: "social_linkedin" }, days(-6)),
    A(ALEX_ID, "deliverable_published", { deliverableTitle: "The truth about coffee freshness dates", deliverableId: d2, platform: "blog" }, days(-5)),
    A(JORDAN_ID, "deliverable_approved", { deliverableTitle: "Cold email: office coffee for Dana at Foundry Labs", deliverableId: d6, taskType: "email" }, days(-4)),
    A(ALEX_ID, "patterns_learned", { count: 2, fromEpisodes: 5 }, days(-4), "Consolidated overnight from recent approvals."),
    A(SAM_ID, "deliverable_published", { deliverableTitle: "Reply template: subscription pause", deliverableId: d10, platform: "help center" }, days(-3)),
    A(SAM_ID, "goal_completed", { goalTitle: "Cut first-response time under 2 hours" }, days(-3)),
    A(SAM_ID, "deliverable_approved", { deliverableTitle: "FAQ: how to adjust your grind size", deliverableId: d11, taskType: "faq" }, days(-2)),
    A(ALEX_ID, "autonomy_suggestion", { message: "Alex has had 4 LinkedIn posts approved in a row with no edits.", action: "publishSocial" }, days(-2)),
    A(JORDAN_ID, "deliverable_approved", { deliverableTitle: "Prospect list: 50 NYC coworking and startup offices", deliverableId: d8, taskType: "report" }, days(-1)),
    A(SAM_ID, "deliverable_rejected", { deliverableTitle: "Reply: escalated refund request", deliverableId: d13, rejectionReason: "Tone too formal for our brand. Loosen it up and drop the policy language." }, days(-1)),
    A(JORDAN_ID, "checkin_response_applied", { taskTitle: "Cold email sequence to office managers", taskId: t6 }, days(-1)),
    A(ALEX_ID, "recurring_task_spawned", { taskType: "social_linkedin", instanceId: t5 }, hours(-8)),
    A(JORDAN_ID, "status_change", { from: "idle", to: "working", reason: "picked up the WeWork outreach task" }, hours(-7)),
    A(ALEX_ID, "task_completed", { taskTitle: "Draft 3 LinkedIn posts on single-origin sourcing", taskId: t1 }, hours(-30)),
    A(SAM_ID, "patterns_learned", { count: 1, fromEpisodes: 3 }, hours(-12), "Learned to acknowledge frustration before the fix."),
    A(JORDAN_ID, "collaboration_proposal_approved", { proposalText: "Package the sourcing posts as a one-pager for outreach.", resultingTaskId: t8 }, hours(-10)),
    A(ALEX_ID, "deliverable_approved", { deliverableTitle: "Cold email: office coffee for Dana at Foundry Labs", deliverableId: d6, taskType: "email" }, hours(-5)),
  ]);
}

async function counts() {
  const tableMap: Record<string, { col: "companyId" | "tenantId"; table: any }> = {
    companies: { col: "companyId", table: companies },
    ai_employees: { col: "companyId", table: aiEmployees },
    departments: { col: "companyId", table: departments },
    functions: { col: "companyId", table: functions },
    goals: { col: "companyId", table: goals },
    tasks: { col: "companyId", table: tasks },
    deliverables: { col: "companyId", table: deliverables },
    activity_log: { col: "companyId", table: activityLog },
    check_ins: { col: "companyId", table: checkIns },
    collaboration_proposals: { col: "companyId", table: collaborationProposals },
    autonomy_suggestions: { col: "companyId", table: autonomySuggestions },
    procedural_memories: { col: "tenantId", table: proceduralMemories },
    semantic_memories: { col: "tenantId", table: semanticMemories },
    episodic_memories: { col: "tenantId", table: episodicMemories },
    knowledge_items: { col: "companyId", table: knowledgeItems },
    chat_messages: { col: "companyId", table: chatMessages },
  };
  const out: Record<string, number> = {};
  for (const [label, { col, table }] of Object.entries(tableMap)) {
    const where =
      label === "companies"
        ? eq(companies.userId, DEMO_USER_ID)
        : eq(table[col], COMPANY_ID);
    const rows = await db.select().from(table).where(where);
    out[label] = rows.length;
  }
  return out;
}

async function main() {
  console.log("Seeding Northwind demo company...");
  await wipe();
  await seed();
  const c = await counts();
  console.log("Per-table row counts (scoped to demo company):");
  for (const [k, v] of Object.entries(c)) console.log(`  ${k.padEnd(24)} ${v}`);
  console.log("Done.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
