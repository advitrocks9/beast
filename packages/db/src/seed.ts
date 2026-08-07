import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db as client } from "./client";
import {
  companies,
  aiEmployees,
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
  notificationReads,
  agentRunEvents,
  signals,
} from "./schema";

type Db = typeof client;

const DEMO_USER_ID = "11111111-1111-4111-8111-111111111111";
const COMPANY_ID = "22222222-2222-4222-8222-222222222222";
const ALEX_ID = "a0000000-0000-4000-8000-000000000001";
const JORDAN_ID = "b0000000-0000-4000-8000-000000000002";
const SAM_ID = "c0000000-0000-4000-8000-000000000003";

// Mirrors confidenceFrom in packages/ai/src/memory/extraction.ts so seeded
// candidate/rule confidences are exactly what the real math would produce.
const conf = (weightSum: number) => 1 - Math.exp(-weightSum / 2);

async function wipeDemoSessionTables(db: Db): Promise<void> {
  // demo_sessions and its carriers land from a parallel migration; probe
  // instead of importing so the seed works before and after that schema exists.
  const carriers = await db.execute(sql`
    select table_name from information_schema.columns
    where table_schema = 'public' and column_name = 'demo_session_id'
  `);
  for (const row of carriers) {
    const name = String(row.table_name);
    await db.execute(
      sql`delete from ${sql.identifier(name)} where demo_session_id is not null`,
    );
  }

  const sessionTables = await db.execute(sql`
    select table_name from information_schema.tables
    where table_schema = 'public' and table_name in ('demo_sessions', 'demo_visitors')
  `);
  for (const row of sessionTables) {
    await db.execute(sql`delete from ${sql.identifier(String(row.table_name))}`);
  }
}

/** Deletes demo_sessions older than maxAgeHours plus their carrier rows. No-op when the table has not landed. */
export async function purgeExpiredDemoSessions(db: Db, maxAgeHours = 24): Promise<number> {
  const exists = await db.execute(sql`
    select table_name from information_schema.tables
    where table_schema = 'public' and table_name = 'demo_sessions'
  `);
  if (exists.length === 0) return 0;

  const cutoff = sql`now() - make_interval(hours => ${maxAgeHours})`;
  const carriers = await db.execute(sql`
    select table_name from information_schema.columns
    where table_schema = 'public' and column_name = 'demo_session_id'
  `);
  for (const row of carriers) {
    const name = String(row.table_name);
    await db.execute(sql`
      delete from ${sql.identifier(name)}
      where demo_session_id in (select id from demo_sessions where created_at < ${cutoff})
    `);
  }
  const deleted = await db.execute(sql`delete from demo_sessions where created_at < ${cutoff}`);
  return deleted.count;
}

async function wipe(db: Db): Promise<void> {
  // FK-safe child -> parent order. Several tables reference companies only by
  // companyId without an FK, episodic_memories references tasks and
  // procedural_memories, and a few employee FKs are restrict, so clear
  // everything explicitly rather than leaning on cascade.
  await db.delete(collaborationProposals).where(eq(collaborationProposals.companyId, COMPANY_ID));
  await db.delete(autonomySuggestions).where(eq(autonomySuggestions.companyId, COMPANY_ID));
  await db.delete(checkIns).where(eq(checkIns.companyId, COMPANY_ID));
  await db.delete(chatMessages).where(eq(chatMessages.companyId, COMPANY_ID));
  await db.delete(activityLog).where(eq(activityLog.companyId, COMPANY_ID));
  await db.delete(signals).where(eq(signals.companyId, COMPANY_ID));
  await db.delete(episodicMemories).where(eq(episodicMemories.tenantId, COMPANY_ID));
  await db.delete(ruleCandidates).where(eq(ruleCandidates.tenantId, COMPANY_ID));
  await db.delete(proceduralMemories).where(eq(proceduralMemories.tenantId, COMPANY_ID));
  await db.delete(semanticMemories).where(eq(semanticMemories.tenantId, COMPANY_ID));
  await db.delete(employeeMemories).where(eq(employeeMemories.companyId, COMPANY_ID));
  await db.delete(agentRunEvents).where(eq(agentRunEvents.companyId, COMPANY_ID));
  await db.delete(deliverables).where(eq(deliverables.companyId, COMPANY_ID));
  await db.delete(tasks).where(eq(tasks.companyId, COMPANY_ID));
  await db.delete(goals).where(eq(goals.companyId, COMPANY_ID));
  await db.delete(knowledgeEmbeddings).where(eq(knowledgeEmbeddings.companyId, COMPANY_ID));
  await db.delete(knowledgeItems).where(eq(knowledgeItems.companyId, COMPANY_ID));
  await db.delete(aiEmployees).where(eq(aiEmployees.companyId, COMPANY_ID));
  await db.delete(notificationReads).where(eq(notificationReads.companyId, COMPANY_ID));
  await db.delete(companies).where(eq(companies.userId, DEMO_USER_ID));
  await wipeDemoSessionTables(db);
}

const SYSTEM_PROMPT_TAIL =
  "Write in Northwind Coffee's voice: plain, warm, and specific. Back every claim with a real detail (a farm, a lot, a number). Say 'craft', never 'artisanal'. Never use em-dashes.";

async function seed(db: Db): Promise<void> {
  const NOW = Date.now();
  const days = (d: number) => new Date(NOW + d * 86_400_000);
  const hours = (h: number) => new Date(NOW + h * 3_600_000);
  const minutes = (m: number) => new Date(NOW + m * 60_000);
  const dateOnly = (d: number) => days(d).toISOString().slice(0, 10);
  const iso = (d: number) => days(d).toISOString();

  await db.insert(companies).values({
    id: COMPANY_ID,
    userId: DEMO_USER_ID,
    name: "Northwind Coffee",
    websiteUrl: "https://www.northwindcoffee.test",
    industry: "Specialty coffee, DTC subscriptions",
    companySize: "12",
    contextScore: 82,
    onboardingStatus: "complete",
    timezone: "America/Los_Angeles",
    founderEmail: "founder@northwind.test",
    billingTier: "trial",
    billingStatus: "trialing",
    trialEndsAt: days(9),
    createdAt: days(-24),
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
        communicationStyle: "energetic, concrete, allergic to filler",
        strengths: ["competitor teardowns", "newsletters", "social posts", "positioning"],
        traits: ["cites sources", "leads with the lot and the farm", "ready-to-send quality"],
      },
      systemPrompt: `You are Alex, the Marketing Manager AI employee at Northwind Coffee, a 12-person specialty roaster and subscription business in Portland, OR. ${SYSTEM_PROMPT_TAIL}`,
      memorySummary:
        "Maya approves fastest when subjects stay short, price comparisons include shipping, and every competitor claim carries two sources. She keeps swapping 'guys' for 'folks'.",
      status: "working",
      currentTaskId: null,
      autonomySettings: {
        publishSocial: "permission",
        sendEmail: "permission",
        reachOut: "permission",
        createContent: "auto",
        researchTopics: "auto",
      },
      checkInFrequency: "weekly",
      createdAt: days(-21),
      updatedAt: hours(-1),
    },
    {
      id: JORDAN_ID,
      companyId: COMPANY_ID,
      name: "Jordan",
      roleTitle: "Wholesale Sales Rep",
      roleType: "sales",
      personality: {
        communicationStyle: "direct, warm, specific to the cafe",
        strengths: ["wholesale outreach", "reply triage", "prospect research", "objection handling"],
        traits: ["names the neighborhood", "no exclamation marks", "short emails"],
      },
      systemPrompt: `You are Jordan, the Wholesale Sales Rep AI employee at Northwind Coffee, a 12-person specialty roaster in Portland, OR launching a wholesale line this quarter. ${SYSTEM_PROMPT_TAIL}`,
      memorySummary:
        "Cafe buyers skim. Open on their room, not our beans, keep it under 120 words, and never put an exclamation mark in a subject line.",
      status: "waiting_review",
      autonomySettings: {
        publishSocial: "permission",
        sendEmail: "permission",
        reachOut: "auto",
        createContent: "auto",
        researchTopics: "auto",
      },
      checkInFrequency: "weekly",
      createdAt: days(-21),
      updatedAt: days(-1),
    },
    {
      id: SAM_ID,
      companyId: COMPANY_ID,
      name: "Sam",
      roleTitle: "Support Lead",
      roleType: "support",
      personality: {
        communicationStyle: "calm, owns the problem, writes in Maya's voice",
        strengths: ["inbox replies", "FAQ drafts", "pattern detection", "escalation triage"],
        traits: ["names the exact issue", "realistic timelines", "signs off as the crew"],
      },
      systemPrompt: `You are Sam, the Support Lead AI employee at Northwind Coffee. You reply to customers in founder Maya Chen's voice. ${SYSTEM_PROMPT_TAIL}`,
      memorySummary:
        "Replies sign off 'Maya + the Northwind crew' and never promise a roast date earlier than Thursday. We roast Tuesdays and ship Thursdays.",
      status: "idle",
      autonomySettings: {
        publishSocial: "permission",
        sendEmail: "permission",
        reachOut: "permission",
        createContent: "auto",
        researchTopics: "auto",
      },
      checkInFrequency: "weekly",
      createdAt: days(-20),
      updatedAt: days(-2),
    },
  ]);

  const goalSubs = randomUUID();
  const goalSupport = randomUUID();
  const goalWholesale = randomUUID();
  const goalNewsletter = randomUUID();
  await db.insert(goals).values([
    {
      id: goalSubs,
      companyId: COMPANY_ID,
      aiEmployeeId: ALEX_ID,
      title: "Grow the subscription base 20% this quarter",
      description: "Explorer, Regular, and Obsessive tiers. Growth comes from the quiz page, the newsletter, and teardown-driven positioning.",
      targetMetric: "+20% active subscribers",
      targetDate: dateOnly(52),
      status: "active",
      progressPct: 62,
      createdAt: days(-24),
      updatedAt: days(-1),
    },
    {
      id: goalSupport,
      companyId: COMPANY_ID,
      aiEmployeeId: SAM_ID,
      title: "Cut support first-response time under 4 hours",
      description: "FAQ coverage for the top ten questions plus reply templates in Maya's voice.",
      targetMetric: "median first response < 4h",
      targetDate: dateOnly(38),
      status: "active",
      progressPct: 78,
      createdAt: days(-24),
      updatedAt: days(-2),
    },
    {
      id: goalWholesale,
      companyId: COMPANY_ID,
      aiEmployeeId: JORDAN_ID,
      title: "Land 10 wholesale accounts for the new line",
      description: "Portland cafes first, then Seattle. Lead with the neighborhood and the Tuesday roast, Thursday delivery cadence.",
      targetMetric: "10 signed accounts",
      targetDate: dateOnly(60),
      status: "active",
      progressPct: 30,
      createdAt: days(-22),
      updatedAt: days(-1),
    },
    {
      id: goalNewsletter,
      companyId: COMPANY_ID,
      aiEmployeeId: ALEX_ID,
      title: "Newsletter list to 5,000 subscribers",
      description: "Monthly lot announcements plus the brewing-tip series. The freshness story is the hook.",
      targetMetric: "5,000 subscribers",
      targetDate: dateOnly(45),
      status: "active",
      progressPct: 45,
      createdAt: days(-22),
      updatedAt: days(-3),
    },
  ]);

  const pinned = (goalId: string, title: string) => ({ id: goalId, title });

  const tRun = randomUUID();
  const tNews = randomUUID();
  const tBb = randomUUID();
  const tPm = randomUUID();
  const tFaq = randomUUID();
  const tA1 = randomUUID();
  const tA2 = randomUUID();
  const tA3 = randomUUID();
  const tA4 = randomUUID();
  const tA5 = randomUUID();
  const tPub = randomUUID();
  const tFail = randomUUID();
  const tTo = randomUUID();
  const tQ1 = randomUUID();
  const tQ2 = randomUUID();
  const tRecDigest = randomUUID();
  const tRecNews = randomUUID();

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
    orchestratorRetries?: number;
    recurrence?: Record<string, unknown>;
  };

  const nextWeekdayUtc = (dow: number, hourUtc: number): string => {
    const d = new Date(NOW);
    d.setUTCHours(hourUtc, 0, 0, 0);
    do {
      d.setUTCDate(d.getUTCDate() + 1);
    } while (d.getUTCDay() !== dow);
    return d.toISOString();
  };
  const firstOfNextMonthUtc = (hourUtc: number): string => {
    const d = new Date(NOW);
    d.setUTCMonth(d.getUTCMonth() + 1, 1);
    d.setUTCHours(hourUtc, 0, 0, 0);
    return d.toISOString();
  };

  const taskSeeds: TaskSeed[] = [
    {
      id: tRun, employee: ALEX_ID, goalId: goalSubs, title: "Teardown: Stumptown subscription tiers",
      taskType: "report", origin: "user_created", status: "running",
      brief: {
        objective: "Tear down Stumptown's subscription tiers and pricing against ours.",
        acceptanceCriteria: ["Tier table with delivered price, shipping included", "At least two cited sources", "One thing to steal"],
        pinnedGoal: pinned(goalSubs, "Grow the subscription base 20% this quarter"),
      },
      createdAt: hours(-1), startedAt: minutes(-10),
    },
    {
      id: tNews, employee: ALEX_ID, goalId: goalNewsletter, title: "Draft the October subscriber newsletter",
      taskType: "email", origin: "user_created", status: "in_review",
      brief: {
        objective: "Monthly newsletter: the two new lots, one brewing tip, and an honest note on the Northeast shipping delay.",
        acceptanceCriteria: ["Subject under 45 characters", "Two named coffees with tasting notes", "Own the delay plainly"],
        pinnedGoal: pinned(goalNewsletter, "Newsletter list to 5,000 subscribers"),
      },
      createdAt: days(-1), startedAt: hours(-21),
    },
    {
      id: tBb, employee: ALEX_ID, goalId: goalSubs, title: "Teardown: Blue Bottle subscription",
      taskType: "report", origin: "proactive", status: "in_review",
      brief: {
        objective: "Tear down the Blue Bottle subscription with delivered pricing and where our origin story wins.",
        acceptanceCriteria: ["Tier table with shipping included", "Two sources per competitor claim", "One thing to steal"],
      },
      createdAt: days(-2), startedAt: days(-2),
    },
    {
      id: tPm, employee: JORDAN_ID, goalId: goalWholesale, title: "Wholesale outreach: Proud Mary",
      taskType: "email", origin: "user_created", status: "in_review",
      brief: {
        objective: "First-touch email to Proud Mary's cafe manager for the new wholesale line.",
        acceptanceCriteria: ["Name the neighborhood in the first line", "Under 120 words", "One low-friction ask"],
        pinnedGoal: pinned(goalWholesale, "Land 10 wholesale accounts for the new line"),
      },
      createdAt: days(-1), startedAt: hours(-23),
    },
    {
      id: tFaq, employee: SAM_ID, goalId: goalSupport, title: "FAQ draft: why did my grind setting change?",
      taskType: "faq", origin: "proactive", status: "in_review",
      brief: {
        objective: "Reusable reply for customers whose pre-ground coffee brews differently since the burr swap.",
        acceptanceCriteria: ["Name the exact issue up front", "Give the fix, not just the apology", "Maya's voice"],
      },
      createdAt: hours(-30), startedAt: hours(-17),
    },
    {
      id: tA1, employee: ALEX_ID, goalId: goalNewsletter, title: "Draft the September subscriber newsletter",
      taskType: "email", origin: "user_created", status: "accepted",
      brief: {
        objective: "Monthly newsletter: the new Kenya lot and the returning-subscriber credit.",
        acceptanceCriteria: ["Short subject", "Lead the credit with the dollar amount"],
      },
      createdAt: days(-17), startedAt: days(-17), completedAt: days(-16),
    },
    {
      id: tA2, employee: ALEX_ID, goalId: goalSubs, title: "Teardown: Trade Coffee subscriptions",
      taskType: "report", origin: "user_created", status: "accepted",
      brief: {
        objective: "Tear down Trade's matching-quiz subscription against our named-lot model.",
        acceptanceCriteria: ["Delivered pricing", "Cited sources"],
      },
      createdAt: days(-13), startedAt: days(-13), completedAt: days(-12),
    },
    {
      id: tA3, employee: SAM_ID, goalId: goalSupport, title: "Reply batch: roast-date questions",
      taskType: "custom", origin: "user_created", status: "accepted",
      brief: {
        objective: "One reusable reply for 'when was my coffee roasted and when does it ship?'",
        acceptanceCriteria: ["True to the Tuesday roast, Thursday ship cadence", "Maya's voice"],
      },
      createdAt: days(-11), startedAt: days(-11), completedAt: days(-10),
    },
    {
      id: tA4, employee: JORDAN_ID, goalId: goalWholesale, title: "Outreach: Heart Roasters guest slot",
      taskType: "email", origin: "user_created", status: "accepted",
      brief: {
        objective: "Pitch Heart's Burnside cafe on a Northwind guest-roaster rotation.",
        acceptanceCriteria: ["Neighborhood in the first line", "Under 120 words"],
      },
      createdAt: days(-13), startedAt: days(-13), completedAt: days(-12),
    },
    {
      id: tA5, employee: ALEX_ID, goalId: goalSubs, title: "Win-back email: lapsed Explorer subscribers",
      taskType: "email", origin: "user_created", status: "accepted",
      brief: {
        objective: "Re-engage subscribers who paused more than 60 days ago.",
        acceptanceCriteria: ["Lead with the coffee, not the discount", "Under 150 words"],
      },
      createdAt: days(-9), startedAt: days(-9), completedAt: days(-8),
    },
    {
      id: tPub, employee: ALEX_ID, goalId: goalNewsletter, title: "Blog: what 'washed process' actually means",
      taskType: "blog", origin: "user_created", status: "published",
      brief: {
        objective: "Explain washed vs natural processing in plain language, tied to our current lots.",
        acceptanceCriteria: ["800-1200 words", "One clear CTA"],
      },
      createdAt: days(-15), startedAt: days(-15), completedAt: days(-14),
    },
    {
      id: tFail, employee: ALEX_ID, goalId: goalSubs, title: "Crawl: Trade Coffee pricing page",
      taskType: "report", origin: "proactive", status: "failed",
      brief: {
        objective: "Pull Trade's current pricing page to refresh the teardown numbers.",
        acceptanceCriteria: ["Current tier prices", "Shipping policy"],
      },
      createdAt: days(-3), startedAt: days(-3), completedAt: days(-3),
      orchestratorRetries: 2,
    },
    {
      id: tTo, employee: JORDAN_ID, goalId: goalWholesale, title: "Enrich 40 cafe contacts with buyer names",
      taskType: "report", origin: "user_created", status: "timed_out",
      brief: {
        objective: "Find the buying contact for each cafe on the Portland wholesale list.",
        acceptanceCriteria: ["Name and role per cafe"],
      },
      createdAt: days(-8), startedAt: days(-8), completedAt: days(-8),
    },
    {
      id: tQ1, employee: JORDAN_ID, goalId: goalWholesale, title: "Q3 wholesale one-pager",
      taskType: "report", origin: "user_created", status: "queued",
      brief: {
        objective: "One page cafes can keep: pricing, margin at suggested retail, roast and delivery cadence.",
        acceptanceCriteria: ["Fits one page", "Names the 38% margin target"],
      },
      createdAt: hours(-20), scheduledAt: hours(6),
    },
    {
      id: tQ2, employee: SAM_ID, goalId: goalSupport, title: "Reply batch: 12 unanswered inbox threads",
      taskType: "custom", origin: "user_created", status: "queued",
      brief: {
        objective: "Clear the backlog: 12 threads, mostly pause requests and the grind-setting question.",
        acceptanceCriteria: ["Every reply names the customer's exact issue", "Maya's voice"],
      },
      createdAt: hours(-6), scheduledAt: hours(20),
    },
    {
      id: tRecDigest, employee: SAM_ID, goalId: goalSupport, title: "Weekly inbox digest",
      taskType: "custom", origin: "recurring", status: "queued",
      brief: {
        objective: "Summarize the week's inbox: volumes, top three themes, anything trending.",
        acceptanceCriteria: ["Top themes with counts", "One suggested FAQ"],
      },
      createdAt: days(-18),
      recurrence: {
        frequency: "weekly",
        dayOfWeek: 1,
        hour: 9,
        minute: 0,
        timezone: "America/Los_Angeles",
        nextOccurrenceAt: nextWeekdayUtc(1, 16),
        lastOccurrenceAt: iso(-4),
      },
    },
    {
      id: tRecNews, employee: ALEX_ID, goalId: goalNewsletter, title: "Monthly newsletter draft",
      taskType: "email", origin: "recurring", status: "queued",
      brief: {
        objective: "Draft the monthly subscriber newsletter around the incoming lots.",
        acceptanceCriteria: ["Subject under 45 characters", "Two named coffees"],
      },
      createdAt: days(-19),
      recurrence: {
        frequency: "monthly",
        dayOfMonth: 1,
        hour: 8,
        minute: 0,
        timezone: "America/Los_Angeles",
        nextOccurrenceAt: firstOfNextMonthUtc(15),
        lastOccurrenceAt: iso(-6),
      },
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
      planApproved: t.status === "accepted" || t.status === "published",
      orchestratorRetries: t.orchestratorRetries ?? 0,
      recurrence: t.recurrence ?? null,
      scheduledAt: t.scheduledAt ?? null,
      startedAt: t.startedAt ?? null,
      completedAt: t.completedAt ?? null,
      createdAt: t.createdAt,
    })),
  );

  await db.update(aiEmployees).set({ currentTaskId: tRun }).where(eq(aiEmployees.id, ALEX_ID));

  // ── Operating manual: promoted rules R-001..R-008 + the deprecated R-009 ──

  const r1 = randomUUID();
  const r2 = randomUUID();
  const r3 = randomUUID();
  const r4 = randomUUID();
  const r5 = randomUUID();
  const r6 = randomUUID();
  const r7 = randomUUID();
  const r8 = randomUUID();
  const rDep = randomUUID();

  const dNews = randomUUID();
  const dBb = randomUUID();
  const dPm = randomUUID();
  const dFaq = randomUUID();
  const dA1 = randomUUID();
  const dA2 = randomUUID();
  const dA3 = randomUUID();
  const dA4 = randomUUID();
  const dA5 = randomUUID();
  const dPub = randomUUID();

  // sourceEpisodes[0] is read by the UI as the "extracted from" deliverable link.
  await db.insert(proceduralMemories).values([
    {
      id: r1, agentId: ALEX_ID, tenantId: COMPANY_ID, ruleType: "style_rule", taskScope: ["email"],
      title: "R-001 Subject lines stay under 45 characters",
      description: "Born in the September newsletter: Maya cut 'Fresh crop Kenya Karimikui has landed at the roastery' down to 'New crop Kenya and a $6 credit'. Two more trimmed subjects made it stick. Mobile inboxes truncate at about 45.",
      examples: { good: "New crop Kenya and a $6 credit", avoid: "Fresh crop Kenya Karimikui has landed at the roastery" },
      version: 1, isCurrent: true, sourceEpisodes: [dA1],
      signalCount: 3, signalWeight: 3.03, confidence: conf(3.03), tasksAppliedTo: 6, approvalRateDelta: 0.18, createdAt: days(-15),
    },
    {
      id: r2, agentId: ALEX_ID, tenantId: COMPANY_ID, ruleType: "style_rule", taskScope: ["report"],
      title: "R-002 Price comparisons always include shipping",
      description: "The Trade teardown got both of its edits on sticker-price framing. Subscriptions hide the real cost in shipping, so every comparison quotes the delivered price.",
      examples: { good: "$34 sticker, $34 delivered (free over $35)", avoid: "cheaper than us at $15/bag" },
      version: 1, isCurrent: true, sourceEpisodes: [dA2],
      signalCount: 3, signalWeight: 3.32, confidence: conf(3.32), tasksAppliedTo: 5, approvalRateDelta: 0.15, createdAt: days(-11),
    },
    {
      id: r3, agentId: SAM_ID, tenantId: COMPANY_ID, ruleType: "style_rule", taskScope: ["custom", "faq"],
      title: "R-003 Support replies sign off 'Maya + the Northwind crew'",
      description: "Maya rewrote four sign-offs the same way before this stuck. Customers reply to a person, not a help desk, and the crew sign-off keeps it honest that support is shared.",
      examples: { good: "Maya + the Northwind crew", avoid: "Best regards, Northwind Support Team" },
      version: 1, isCurrent: true, sourceEpisodes: [dA3],
      signalCount: 4, signalWeight: 4.24, confidence: conf(4.24), tasksAppliedTo: 9, approvalRateDelta: 0.22, createdAt: days(-9),
    },
    {
      id: r4, agentId: SAM_ID, tenantId: COMPANY_ID, ruleType: "avoid_pattern", taskScope: ["custom", "faq"],
      title: "R-004 Never promise roast dates earlier than Thursday",
      description: "A reply once promised a Monday roast; we roast Tuesdays and ship Thursdays, and the customer emailed back angry. Two edits plus Maya's written rationale on the reply batch set this.",
      examples: { good: "Your bag comes off Tuesday's roast and ships Thursday.", avoid: "We'll roast a fresh batch for you tomorrow." },
      version: 1, isCurrent: true, sourceEpisodes: [dA3],
      signalCount: 3, signalWeight: 2.48, confidence: conf(2.48), tasksAppliedTo: 7, approvalRateDelta: 0.11, createdAt: days(-9),
    },
    {
      id: r5, agentId: ALEX_ID, tenantId: COMPANY_ID, ruleType: "style_rule", taskScope: ["report"],
      title: "R-005 Competitor claims cite at least two sources",
      description: "Maya added a second source to three separate teardown claims before approving. One review can be stale or wrong; two independent sources per claim is the floor.",
      examples: { good: "quiz defaults to blends [pricing page + review walkthrough]" },
      version: 1, isCurrent: true, sourceEpisodes: [dA2],
      signalCount: 3, signalWeight: 3.67, confidence: conf(3.67), tasksAppliedTo: 4, approvalRateDelta: 0.13, createdAt: days(-11),
    },
    {
      id: r6, agentId: ALEX_ID, tenantId: COMPANY_ID, ruleType: "style_rule", taskScope: ["email"],
      title: "R-006 Discounts lead with the dollar amount, not the percent",
      description: "September's '15% off your next box' became 'a $6 credit' in Maya's edit, and the win-back email got the same treatment. Dollars are concrete; percents make people do math.",
      examples: { good: "a $6 credit on your next box", avoid: "15% off your next box" },
      version: 1, isCurrent: true, sourceEpisodes: [dA1],
      signalCount: 2, signalWeight: 2.04, confidence: conf(2.04), tasksAppliedTo: 3, approvalRateDelta: 0.08, createdAt: days(-15),
    },
    {
      id: r7, agentId: JORDAN_ID, tenantId: COMPANY_ID, ruleType: "avoid_pattern", taskScope: ["email"],
      title: "R-007 No exclamation marks in outreach subject lines",
      description: "Three outreach drafts lost their exclamation marks in review. Cafe buyers read excitement as spam; flat subjects got the replies.",
      examples: { good: "guest roaster slot on Burnside", avoid: "Amazing coffee for your cafe!" },
      version: 1, isCurrent: true, sourceEpisodes: [dA4],
      signalCount: 3, signalWeight: 2.85, confidence: conf(2.85), tasksAppliedTo: 5, approvalRateDelta: 0.1, createdAt: days(-7),
    },
    {
      id: r8, agentId: JORDAN_ID, tenantId: COMPANY_ID, ruleType: "style_rule", taskScope: ["email"],
      title: "R-008 Wholesale pitches name the cafe's neighborhood in the first line",
      description: "The Heart Roasters email opened on 'the Burnside room' after Maya's edit, and the reply came back in a day. Buyers can tell in one line whether you have actually been in their cafe.",
      examples: { good: "Alberta gets a specific crowd: regulars who sit for two hours." },
      version: 1, isCurrent: true, sourceEpisodes: [dA4],
      signalCount: 2, signalWeight: 1.94, confidence: conf(1.94), tasksAppliedTo: 4, approvalRateDelta: 0.09, createdAt: days(-7),
    },
    {
      id: rDep, agentId: ALEX_ID, tenantId: COMPANY_ID, ruleType: "style_rule", taskScope: ["email"],
      title: "R-009 Mention the founder story in every email",
      description: "Promoted after two strong approvals on founding-story emails, then applied everywhere. By the third week the same paragraph was showing up in support-adjacent sends and approvals dropped.",
      examples: { good: "Maya started Northwind after a decade as a roaster at..." },
      version: 1, isCurrent: false, sourceEpisodes: [dA1],
      signalCount: 3, signalWeight: 2.5, confidence: conf(2.5), tasksAppliedTo: 8, approvalRateDelta: -0.14,
      createdAt: days(-12), deprecatedAt: days(-2), deprecatedReason: "Auto-deprecated: approval rate dropped -14%",
    },
  ]);

  // ── Episodic memories (per-job outcomes; two are the folks-candidate sources) ──

  const epSubject = randomUUID();
  const epFolks1 = randomUUID();
  const epTrade = randomUUID();
  const epHeart = randomUUID();
  const epRoastDate = randomUUID();
  const epFolks2 = randomUUID();
  const epFaqOk = randomUUID();
  const epCrawl = randomUUID();
  const epTimeout = randomUUID();
  const epPause = randomUUID();

  await db.insert(episodicMemories).values([
    { id: epSubject, agentId: ALEX_ID, tenantId: COMPANY_ID, episodeType: "feedback_received", summary: "September newsletter accepted with two edits; Maya trimmed the subject to 30 characters and led the credit with the dollar amount", content: { deliverableId: dA1, decision: "approved_with_edits", edits: ["subject shortened", "percent swapped for $6"], fedRules: ["R-001", "R-006"] }, occurredAt: days(-16), taskId: tA1, salienceScore: 0.8, accessCount: 4, isConsolidated: true },
    { id: epFolks1, agentId: ALEX_ID, tenantId: COMPANY_ID, episodeType: "feedback_received", summary: "Maya changed 'Hey guys' to 'Hey folks' in the September newsletter greeting", content: { deliverableId: dA1, decision: "approved_with_edits", removed: ["guys"], added: ["folks"] }, occurredAt: days(-16), taskId: tA1, salienceScore: 0.7, accessCount: 2, isConsolidated: false },
    { id: epTrade, agentId: ALEX_ID, tenantId: COMPANY_ID, episodeType: "feedback_received", summary: "Trade teardown accepted with two edits; both were about shipping-price framing and fed R-002", content: { deliverableId: dA2, decision: "approved_with_edits", edits: ["delivered price added to tier table", "sticker-only comparison removed"], fedRules: ["R-002"] }, occurredAt: days(-12), taskId: tA2, salienceScore: 0.8, accessCount: 3, isConsolidated: true },
    { id: epHeart, agentId: JORDAN_ID, tenantId: COMPANY_ID, episodeType: "task_completed", summary: "Cold outreach to Heart Roasters bounced; wrong contact, found the buyer via the cafe manager", content: { taskId: tA4, outcome: "bounced_then_recovered", learned: "cafe buying decisions sit with the cafe manager, not the owner inbox" }, occurredAt: days(-13), taskId: tA4, salienceScore: 0.75, accessCount: 2, isConsolidated: false },
    { id: epRoastDate, agentId: SAM_ID, tenantId: COMPANY_ID, episodeType: "feedback_received", summary: "Roast-date reply batch corrected: a draft promised a Monday roast, we roast Tuesdays; Maya wrote the rationale that became R-004", content: { deliverableId: dA3, decision: "approved_with_edits", rationale: "Never promise a roast date earlier than Thursday", fedRules: ["R-004"] }, occurredAt: days(-10), taskId: tA3, salienceScore: 0.85, accessCount: 3, isConsolidated: true },
    { id: epFolks2, agentId: ALEX_ID, tenantId: COMPANY_ID, episodeType: "feedback_received", summary: "Maya swapped 'guys' for 'folks' again, this time in the win-back email", content: { deliverableId: dA5, decision: "approved_with_edits", removed: ["guys"], added: ["folks"] }, occurredAt: days(-8), taskId: tA5, salienceScore: 0.7, accessCount: 1, isConsolidated: false },
    { id: epFaqOk, agentId: SAM_ID, tenantId: COMPANY_ID, episodeType: "task_completed", summary: "Grind-size FAQ from last quarter approved unchanged; direct-answer-first format keeps working", content: { taskType: "faq", finalStatus: "approved", reusablePatterns: ["short answer first, numbered steps after"] }, occurredAt: days(-7), salienceScore: 0.6, accessCount: 2, isConsolidated: false },
    { id: epCrawl, agentId: ALEX_ID, tenantId: COMPANY_ID, episodeType: "task_completed", summary: "Trade Coffee pricing crawl failed twice with a 403; their pricing page blocks bots", content: { taskId: tFail, finalStatus: "failed", error: "403 Forbidden at www.tradecoffee.test/pricing", retries: 2 }, occurredAt: days(-3), taskId: tFail, salienceScore: 0.9, accessCount: 1, isConsolidated: false },
    { id: epTimeout, agentId: JORDAN_ID, tenantId: COMPANY_ID, episodeType: "task_completed", summary: "Contact-enrichment run timed out at cafe 24 of 40; batch was too large for one run", content: { taskId: tTo, finalStatus: "timed_out", learned: "cap enrichment batches at 20 cafes" }, occurredAt: days(-8), taskId: tTo, salienceScore: 0.7, accessCount: 1, isConsolidated: false },
    { id: epPause, agentId: SAM_ID, tenantId: COMPANY_ID, episodeType: "task_completed", summary: "Pause tickets spiked in the first week of the month again, right after the billing email", content: { pattern: "monthly pause spike", trigger: "billing email" }, occurredAt: days(-5), salienceScore: 0.65, accessCount: 2, isConsolidated: false },
  ]);

  // ── Candidate amendments (mid-flight learning) ──
  // The folks candidate sits one corroborating edit from promotion: the next
  // signal (weight >= 0.5) lifts weightSum past 1.833 (conf >= 0.6) and
  // distinctReviewCount to the tone threshold of 3. See accumulateSignal.
  await db.insert(ruleCandidates).values([
    {
      agentId: ALEX_ID, tenantId: COMPANY_ID, ruleType: "style_rule", taskScope: ["email"],
      title: "Use 'folks', never 'guys'",
      description: "Maya has made the same swap in two separate reviews: greetings and asides that say 'guys' become 'folks'.",
      signalCount: 2, signalWeight: 1.6, confidence: conf(1.6), distinctReviewCount: 2,
      sourceReviewIds: [randomUUID(), randomUUID()], sourceEpisodes: [epFolks1, epFolks2],
      createdAt: days(-16), updatedAt: days(-8),
    },
    {
      agentId: SAM_ID, tenantId: COMPANY_ID, ruleType: "style_rule", taskScope: ["custom", "faq"],
      title: "Open support replies by naming the customer's exact issue",
      description: "One review rewrote a generic 'thanks for reaching out' opener into a first line that names the problem.",
      signalCount: 1, signalWeight: 0.66, confidence: conf(0.66), distinctReviewCount: 1,
      sourceReviewIds: [randomUUID()], sourceEpisodes: [epRoastDate],
      createdAt: days(-10), updatedAt: days(-10),
    },
    {
      agentId: ALEX_ID, tenantId: COMPANY_ID, ruleType: "style_rule", taskScope: ["social_linkedin"],
      title: "Keep LinkedIn posts under 120 words",
      description: "One edit cut a 210-word post nearly in half and it was approved on the spot.",
      signalCount: 1, signalWeight: 0.8, confidence: conf(0.8), distinctReviewCount: 1,
      sourceReviewIds: [randomUUID()], sourceEpisodes: [],
      createdAt: days(-6), updatedAt: days(-6),
    },
  ]);

  // ── Semantic memories ──

  await db.insert(semanticMemories).values([
    { tenantId: COMPANY_ID, scope: "shared", agentId: null, fact: "Subscription tiers are Explorer ($24/mo), Regular ($38/mo), and Obsessive ($56/mo), all single-origin.", context: "Pricing sheet.", category: "products", entityName: "Subscription tiers", entityType: "product", confidence: 1.0, source: "document", validFrom: days(-24) },
    { tenantId: COMPANY_ID, scope: "shared", agentId: null, fact: "Subscription pauses spike the first week of each month, right after the billing email.", context: "Recurred three months running in the support inbox.", category: "customers", entityName: "Pause spike", entityType: "pattern", confidence: 0.85, source: "feedback_learned", validFrom: days(-15) },
    { tenantId: COMPANY_ID, scope: "shared", agentId: null, fact: "Top churn reason is 'too much coffee', not price. Skip-a-box beats discounts for retention.", context: "Exit survey plus pause-ticket themes.", category: "customers", entityName: "Churn", entityType: "pattern", confidence: 0.8, source: "feedback_learned", validFrom: days(-14) },
    { tenantId: COMPANY_ID, scope: "shared", agentId: null, fact: "Blue Bottle's welcome discount is 30% but excludes shipping.", context: "Checked on their pricing page during the teardown.", category: "competitors", entityName: "Blue Bottle", entityType: "competitor", confidence: 0.85, source: "url_crawl", validFrom: days(-2) },
    { tenantId: COMPANY_ID, scope: "shared", agentId: null, fact: "Main competitors are Blue Bottle, Stumptown, and Trade Coffee. We differentiate on per-lot transparency printed on every bag.", context: "Competitive scan.", category: "competitors", entityName: "Competitive set", entityType: "competitor", confidence: 0.9, source: "url_crawl", validFrom: days(-20) },
    { tenantId: COMPANY_ID, scope: "shared", agentId: null, fact: "Wholesale margin target is 38% at suggested retail.", context: "Set by Maya for the new line's launch quarter.", category: "products", entityName: "Wholesale line", entityType: "product", confidence: 1.0, source: "interview", validFrom: days(-22) },
    { tenantId: COMPANY_ID, scope: "shared", agentId: null, fact: "Maya prefers 'craft', never 'artisanal'.", context: "Edited out of two drafts; now in the brand-voice doc.", category: "brand_voice", entityName: "Voice", entityType: "brand", confidence: 0.95, source: "feedback_learned", validFrom: days(-18) },
    { tenantId: COMPANY_ID, scope: "shared", agentId: null, fact: "The Explorer tier converts best from the quiz landing page; the homepage converts worst.", context: "Last quarter's funnel numbers.", category: "audience", entityName: "Explorer tier", entityType: "product", confidence: 0.8, source: "document", validFrom: days(-16) },
    { tenantId: COMPANY_ID, scope: "shared", agentId: null, fact: "We roast Tuesdays and ship Thursdays. Orders placed by Sunday midnight make that week's roast.", context: "Fulfillment calendar; the source of truth behind R-004.", category: "processes", entityName: "Roast calendar", entityType: "process", confidence: 1.0, source: "document", validFrom: days(-24) },
    { tenantId: COMPANY_ID, scope: "shared", agentId: JORDAN_ID, fact: "Cafe buying decisions usually sit with the cafe manager, not the owner's inbox.", context: "Learned when the Heart Roasters outreach bounced.", category: "customers", entityName: "Cafe buyers", entityType: "segment", confidence: 0.75, source: "feedback_learned", validFrom: days(-13) },
    { tenantId: COMPANY_ID, scope: "shared", agentId: ALEX_ID, fact: "Newsletter sends on Tuesday at 9am PT get the best open rates for our list.", context: "Three months of send-time tests.", category: "processes", entityName: "Newsletter", entityType: "process", confidence: 0.7, source: "feedback_learned", validFrom: days(-10) },
  ]);

  // ── Deliverables ──

  const trailStep = (
    name: string,
    inputSummary: string,
    resultSummary: string,
    ms: number,
    daysAgo: number,
  ) => ({
    toolCallId: `tc-${randomUUID().slice(0, 8)}`,
    name,
    inputSummary,
    resultSummary,
    durationMs: ms,
    startedAt: iso(-daysAgo),
  });

  const rule = (
    ruleId: string,
    summary: string,
    evidence: string,
    fromId: string,
    fromTitle: string,
    extractedDaysAgo: number,
    confidence: number,
  ) => ({
    ruleId,
    summary,
    evidence,
    extractedFromDeliverableId: fromId,
    extractedFromTitle: fromTitle,
    extractedAt: iso(-extractedDaysAgo),
    confidence,
  });

  const newsletterBody =
    "Subject: two new lots and an honest delay\n\n" +
    "Hey guys,\n\n" +
    "Two coffees landed this week and they could not be more different.\n\n" +
    "Ethiopia, Hambela Buku, natural process. Dried three weeks on raised beds. Blueberry jam, cacao nib, a finish that hangs around. If you liked August's Guji you will fight your household for this one.\n\n" +
    "Colombia, El Vergel, washed. A clean 36-hour fermentation. Red apple, panela, no surprises in the best way. This is the bag to hand the person who says they just want normal coffee.\n\n" +
    "Brewing tip for the Buku: naturals like a slightly coarser grind and water around 94C. If the cup tastes a little boozy, you are doing it right. That is the fruit, not a defect.\n\n" +
    "One honest note: Northeast shipments are running about two days behind while our carrier works through a backlog. Roast days have not moved. If your box is late, it is the road, not the beans.\n\n" +
    "Both lots are live for Explorer and up. Obsessive members get the Buku automatically this cycle.\n\n" +
    "Maya + the Northwind crew";

  const bbBody =
    "TL;DR: Blue Bottle's subscription is priced for gifting, not for daily drinkers. Delivered, we undercut their single-origin tier by $5 to $10 a month, and their origin story does not survive checkout. That gap is our wedge.\n\n" +
    "The tiers, delivered (their standard shipping is $5, free over $35)[^web-1][^web-2]:\n\n" +
    "| Tier | Cadence | Sticker | Delivered / mo |\n" +
    "| --- | --- | --- | --- |\n" +
    "| Single origin, 1 bag | every 2 weeks | $17 | $44 |\n" +
    "| Single origin, 2 bags | every 2 weeks | $34 | $68 |\n" +
    "| Blend, 1 bag | every 2 weeks | $15 | $40 |\n\n" +
    "Northwind Explorer is $24/mo delivered. Even our Obsessive tier at $56/mo lands under their two-bag plan, with the farm and lot printed on every bag. Prices above include shipping per the manual.\n\n" +
    "Where they win: brand, retail footprint, and a genuinely slick gifting flow[^web-2].\n\n" +
    "Where we win: their quiz routes new subscribers to blends by default, and single-origin is a filter you have to find[^web-2]. Origin detail stops at the country level[^web-1]. We lead with the lot.\n\n" +
    "One thing to steal: their pause flow is one tap and zero guilt. Worth matching that wording in our account page.";

  const pmBody =
    "Subject: coffee program for the Alberta room\n\n" +
    "Hi Callie,\n\n" +
    "Alberta gets a specific crowd: regulars who sit for two hours and order a second cup. Proud Mary's food menu already outclasses the street; the retail shelf behind the bar has room to catch up.\n\n" +
    "Northwind supplies wholesale single-origin at a 38% margin on suggested retail, roasted Tuesday, in your hands Thursday. No minimums for the first eight weeks while you see what sells.\n\n" +
    "Worth 20 minutes next week? I will bring the Hambela Buku and let it argue for itself.\n\n" +
    "Jordan at Northwind Coffee";

  const faqBody =
    "Hi {{first_name}},\n\n" +
    "Short answer: we changed the burrs, not your coffee.\n\n" +
    "In September we swapped the roastery grinders for a set with a finer adjustment range. Same numbers on the collar, different cut, so an 8 from us now grinds a little finer than an 8 from before. If your pre-ground bags suddenly brewed slow or bitter, that is why. Nothing changed in your account and nothing is wrong with the beans.\n\n" +
    "The fix: if you brew pour-over, reply here and I will set your next box one notch coarser. Espresso folks are usually happier with the new cut as-is.\n\n" +
    "Sorry for the head-scratcher. It should have been in the September note and it was not.\n\n" +
    "Maya + the Northwind crew";

  const a1Body =
    "Subject: New crop Kenya and a $6 credit\n\n" +
    "Hey folks,\n\n" +
    "The Kenya Karimikui is back. Blackcurrant, tomato-leaf brightness, a syrupy body that survives milk. It sold out in nine days last year; Obsessive boxes get it first.\n\n" +
    "If you paused over the summer, there is a $6 credit on your next box, no code needed. It applies automatically when you restart.\n\n" +
    "Brewing tip: Kenyans reward a longer bloom. Give it 45 seconds before you keep pouring.\n\n" +
    "Maya + the Northwind crew";

  const a2Body =
    "TL;DR: Trade sells the quiz, not the coffee. Their match engine is genuinely good at onboarding, but the subscriber never learns what farm their bag came from, and delivered pricing is higher than it looks.\n\n" +
    "Delivered pricing (shipping $6 under $35)[^web-3][^web-4]:\n\n" +
    "| Plan | Sticker | Delivered / mo |\n" +
    "| --- | --- | --- |\n" +
    "| The Classics, 2 bags | $33 | $39 |\n" +
    "| Hookup, 2 bags | $42 | $42 |\n\n" +
    "Where they win: onboarding. The quiz takes 60 seconds and ships a plausible match[^web-4].\n\n" +
    "Where we win: provenance. Trade's bags name the roaster; ours name the farm, the lot, and the process[^kb-1]. For the origin-curious drinker that difference is the whole purchase.\n\n" +
    "One thing to steal: their quiz's question count. Ours asks nine questions; theirs asks five and converts better.";

  const a3Body =
    "Hi {{first_name}},\n\n" +
    "Good question, and the honest answer is on the bag: the roast date is printed under the lot name.\n\n" +
    "Here is our cadence. We roast every Tuesday and ship every Thursday, so your coffee arrives days off the roast, inside its peak window. Orders placed by Sunday midnight make that week's roast; anything later rolls to the next one.\n\n" +
    "So the earliest I will ever promise is this Thursday's shipment, because promising faster would mean shipping you older coffee, and that defeats the point.\n\n" +
    "Maya + the Northwind crew";

  const a4Body =
    "Subject: guest roaster slot on Burnside\n\n" +
    "Hi Theo,\n\n" +
    "The Burnside room turns over its guest shelf faster than anywhere else in town, and your regulars clearly read the cards. That is exactly the crowd our bags are printed for: farm, lot, and process on the front.\n\n" +
    "Would a four-week Northwind guest rotation fit November? We roast Tuesdays, deliver Thursdays, and the margin works at your shelf price.\n\n" +
    "Jordan at Northwind Coffee";

  const a5Body =
    "Subject: we held a bag of the Buku for you\n\n" +
    "Hey folks,\n\n" +
    "It has been a couple of months, and the lineup has changed: a natural Ethiopia from Hambela that tastes like blueberry jam, and a washed Colombia that converted three committed dark-roast drinkers at the roastery last week.\n\n" +
    "Restart before Sunday and your first box back ships with Thursday's roast, plus a $6 credit that applies automatically.\n\n" +
    "No hard feelings if the pause becomes a goodbye. But taste the Buku first.\n\n" +
    "Maya + the Northwind crew";

  const pubBody =
    "This advances your goal: newsletter list to 5,000 subscribers.\n\n" +
    "'Washed process' is on half our bags, and it is not jargon for washing the beans.\n\n" +
    "Coffee is a fruit. After picking, the seed has to come out of the cherry, and how that happens changes what you taste. Washed coffees have the fruit removed before drying, then ferment briefly in water. The result is clarity: you taste the seed and the place, not the fruit around it. Our El Vergel is washed, which is why it reads clean, red-apple, precise[^web-5].\n\n" +
    "Naturals dry inside the whole cherry for weeks. The fruit sugars soak in, and you get wilder cups: berries, jam, sometimes a boozy edge. That is the Hambela Buku.\n\n" +
    "Neither is better. Washed is a window; natural is a stained-glass window.\n\n" +
    "If you want to taste the difference side by side, the Explorer box this month ships one of each.";

  const deliverableSeeds = [
    {
      id: dNews, taskId: tNews, employee: ALEX_ID, type: "email",
      title: "October subscriber newsletter",
      status: "in_review", createdAt: hours(-20), updatedAt: hours(-20),
      content: {
        body: newsletterBody,
        citations: [],
        appliedRules: [
          rule(r1, "Subject lines stay under 45 characters", "'two new lots and an honest delay' is 32 characters.", dA1, "September subscriber newsletter", 15, conf(3.03)),
          rule(r4, "Never promise roast dates earlier than Thursday", "The delay note says roast days have not moved instead of promising a date.", dA3, "Reply batch: roast-date questions", 9, conf(2.48)),
        ],
      },
      renderedPreview: "Two coffees landed this week and they could not be more different. Ethiopia, Hambela Buku, natural process: blueberry jam, cacao nib, a finish that hangs around.",
    },
    {
      id: dBb, taskId: tBb, employee: ALEX_ID, type: "report",
      title: "Teardown: Blue Bottle subscription",
      status: "in_review", createdAt: days(-1), updatedAt: days(-1),
      content: {
        content: bbBody,
        citations: [
          { id: "web-1", type: "web", title: "Blue Bottle subscription pricing page", url: "https://www.bluebottle.test/subscriptions", domain: "bluebottle.test", snippet: "Single origin from $17 per bag, every two weeks. Standard shipping $5, free over $35.", lastModified: iso(-6) },
          { id: "web-2", type: "web", title: "Blue Bottle subscription: a 30-day review", url: "https://www.dailygrindreview.test/blue-bottle-30-days", domain: "dailygrindreview.test", snippet: "The taste quiz funnels new subscribers to blends; finding single-origin takes deliberate digging. The gifting flow is excellent.", lastModified: iso(-11) },
        ],
        trail: [
          trailStep("web_search", "blue bottle subscription tiers pricing shipping", "Found 6 sources; pricing page and a 30-day review walkthrough look canonical.", 1240, 1),
          trailStep("web_fetch", "https://www.bluebottle.test/subscriptions", "Pulled tier pricing and the $5 shipping threshold.", 830, 1),
          trailStep("web_fetch", "https://www.dailygrindreview.test/blue-bottle-30-days", "Confirmed quiz-to-blend default and the one-tap pause flow.", 780, 1),
        ],
        appliedRules: [
          rule(r2, "Price comparisons always include shipping", "Tier table quotes delivered monthly cost, not sticker.", dA2, "Teardown: Trade Coffee subscriptions", 11, conf(3.32)),
          rule(r5, "Competitor claims cite at least two sources", "Quiz-default and pricing claims each carry two citations.", dA2, "Teardown: Trade Coffee subscriptions", 11, conf(3.67)),
        ],
      },
      renderedPreview: "TL;DR: Blue Bottle's subscription is priced for gifting, not for daily drinkers. Delivered, we undercut their single-origin tier by $5 to $10 a month.",
    },
    {
      id: dPm, taskId: tPm, employee: JORDAN_ID, type: "email",
      title: "Wholesale outreach: Proud Mary",
      status: "in_review", createdAt: hours(-22), updatedAt: hours(-22),
      content: {
        body: pmBody,
        citations: [
          { id: "kb-2", type: "kb", title: "Wholesale line: margin and cadence", snippet: "38% margin at suggested retail, Tuesday roast, Thursday delivery, no minimums for the first eight weeks.", employeeId: JORDAN_ID },
        ],
        appliedRules: [
          rule(r8, "Wholesale pitches name the cafe's neighborhood in the first line", "Opens on the Alberta room, not on Northwind.", dA4, "Outreach: Heart Roasters guest slot", 7, conf(1.94)),
          rule(r7, "No exclamation marks in outreach subject lines", "'coffee program for the Alberta room', flat and specific.", dA4, "Outreach: Heart Roasters guest slot", 7, conf(2.85)),
        ],
      },
      renderedPreview: "Alberta gets a specific crowd: regulars who sit for two hours and order a second cup. Proud Mary's food menu already outclasses the street.",
    },
    {
      id: dFaq, taskId: tFaq, employee: SAM_ID, type: "faq",
      title: "FAQ draft: why did my grind setting change?",
      status: "in_review", createdAt: hours(-16), updatedAt: hours(-16),
      content: {
        response: faqBody,
        citations: [],
        appliedRules: [
          rule(r3, "Support replies sign off 'Maya + the Northwind crew'", "Sign-off matches the crew convention.", dA3, "Reply batch: roast-date questions", 9, conf(4.24)),
        ],
      },
      renderedPreview: "Short answer: we changed the burrs, not your coffee. In September we swapped the roastery grinders for a set with a finer adjustment range.",
    },
    {
      id: dA1, taskId: tA1, employee: ALEX_ID, type: "email",
      title: "September subscriber newsletter",
      status: "accepted", createdAt: days(-16), updatedAt: days(-16),
      approvedAt: days(-16), approvalRationale: "Trimmed the subject and swapped the percent for dollars. Two named lots next time too, please.",
      content: {
        body: a1Body,
        citations: [],
      },
      renderedPreview: "The Kenya Karimikui is back. Blackcurrant, tomato-leaf brightness, a syrupy body that survives milk. It sold out in nine days last year.",
    },
    {
      id: dA2, taskId: tA2, employee: ALEX_ID, type: "report",
      title: "Teardown: Trade Coffee subscriptions",
      status: "accepted", createdAt: days(-12), updatedAt: days(-12),
      approvedAt: days(-12), approvalRationale: "Good after the shipping fix. Every comparison from now on quotes the delivered price.",
      content: {
        content: a2Body,
        citations: [
          { id: "web-3", type: "web", title: "Trade Coffee plans and pricing", url: "https://www.tradecoffee.test/plans", domain: "tradecoffee.test", snippet: "The Classics from $16.50 per bag; shipping $6 on orders under $35.", lastModified: iso(-14) },
          { id: "web-4", type: "web", title: "Trade Coffee quiz: how the matching works", url: "https://www.brewmethod.test/trade-quiz-review", domain: "brewmethod.test", snippet: "Five questions, a roaster-level match, and no farm or lot detail on the subscription page.", lastModified: iso(-16) },
          { id: "kb-1", type: "kb", title: "Northwind positioning: per-lot transparency", snippet: "We print farm, lot, and process on every bag; competitors stop at roaster or country.", employeeId: ALEX_ID },
        ],
        trail: [
          trailStep("web_search", "trade coffee subscription pricing shipping cost", "Found the plans page and two third-party reviews.", 1180, 13),
          trailStep("web_fetch", "https://www.tradecoffee.test/plans", "Pulled plan pricing and the $6 shipping threshold.", 790, 13),
          trailStep("web_fetch", "https://www.brewmethod.test/trade-quiz-review", "Quiz is five questions; matches are roaster-level only.", 810, 13),
        ],
      },
      renderedPreview: "TL;DR: Trade sells the quiz, not the coffee. Their match engine is genuinely good at onboarding, but the subscriber never learns what farm their bag came from.",
    },
    {
      id: dA3, taskId: tA3, employee: SAM_ID, type: "custom",
      title: "Reply batch: roast-date questions",
      status: "accepted", createdAt: days(-10), updatedAt: days(-10),
      approvedAt: days(-10), approvalRationale: "Never promise a roast date earlier than Thursday. We roast Tuesday and ship Thursday; promising faster means shipping older coffee.",
      content: {
        response: a3Body,
        citations: [],
      },
      renderedPreview: "Good question, and the honest answer is on the bag: the roast date is printed under the lot name. We roast every Tuesday and ship every Thursday.",
    },
    {
      id: dA4, taskId: tA4, employee: JORDAN_ID, type: "email",
      title: "Outreach: Heart Roasters guest slot",
      status: "accepted", createdAt: days(-12), updatedAt: days(-12),
      approvedAt: days(-12), approvalRationale: "The Burnside opener is exactly right. Do this on every pitch.",
      content: {
        body: a4Body,
        citations: [],
      },
      renderedPreview: "The Burnside room turns over its guest shelf faster than anywhere else in town, and your regulars clearly read the cards.",
    },
    {
      id: dA5, taskId: tA5, employee: ALEX_ID, type: "email",
      title: "Win-back email: lapsed Explorer subscribers",
      status: "accepted", createdAt: days(-8), updatedAt: days(-8),
      approvedAt: days(-8), approvalRationale: "Warm without being needy. Send it.",
      content: {
        body: a5Body,
        citations: [],
        appliedRules: [
          rule(r6, "Discounts lead with the dollar amount, not the percent", "'a $6 credit that applies automatically', no percent anywhere.", dA1, "September subscriber newsletter", 15, conf(2.04)),
        ],
      },
      renderedPreview: "It has been a couple of months, and the lineup has changed: a natural Ethiopia from Hambela that tastes like blueberry jam.",
    },
    {
      id: dPub, taskId: tPub, employee: ALEX_ID, type: "blog",
      title: "What 'washed process' actually means",
      status: "published", createdAt: days(-14), updatedAt: days(-14),
      approvedAt: days(-14), publishedUrl: "https://www.northwindcoffee.test/blog/washed-process", publishedAt: days(-14),
      content: {
        content: pubBody,
        citations: [
          { id: "web-5", type: "web", title: "Coffee processing methods explained", url: "https://www.baristahustle.test/processing", domain: "baristahustle.test", snippet: "Washed coffees are depulped before fermentation and drying, producing higher clarity; naturals dry in the whole cherry.", lastModified: iso(-40) },
        ],
      },
      renderedPreview: "'Washed process' is on half our bags, and it is not jargon for washing the beans. Coffee is a fruit, and how the seed leaves the cherry changes what you taste.",
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

  // ── Agent run events ──
  // tRun is the alive-on-arrival moment: a mid-flight trajectory ending on a
  // dangling tool_call_start so the office replay lands on "next step arriving".

  const runEvent = (taskId: string, createdAt: Date, payload: Record<string, unknown>) => ({
    companyId: COMPANY_ID,
    taskId,
    eventType: String(payload.type),
    payload,
    createdAt,
  });

  const stumptownPad = (s1: string, s2: string) => [
    { id: "s1", description: "Pull Stumptown's subscription tiers and pricing", status: s1 },
    { id: "s2", description: "Check their shipping policy so the comparison is delivered price", status: s2 },
    { id: "s3", description: "Compare against our tiers with two cited sources", status: "pending" },
    { id: "s4", description: "Draft the teardown", status: "pending" },
  ];

  await db.insert(agentRunEvents).values([
    runEvent(tRun, minutes(-9), { type: "run_start", taskId: tRun, agentName: "Alex", provider: "stub" }),
    runEvent(tRun, minutes(-9), { type: "scratchpad_update", items: stumptownPad("in_progress", "pending") }),
    runEvent(tRun, minutes(-8), { type: "tool_call_start", toolName: "web_search", toolCallId: "tc-stmp-01", input: { query: "stumptown coffee subscription plans pricing" } }),
    runEvent(tRun, minutes(-7), { type: "tool_call_end", toolName: "web_search", toolCallId: "tc-stmp-01", result: "6 results. Top: www.stumptown.test/subscriptions (tier pricing) and www.dailygrindreview.test/stumptown-subscription (walkthrough with shipping costs)." }),
    runEvent(tRun, minutes(-6), { type: "tool_call_start", toolName: "web_fetch", toolCallId: "tc-stmp-02", input: { url: "https://www.stumptown.test/subscriptions" } }),
    runEvent(tRun, minutes(-4), { type: "tool_call_end", toolName: "web_fetch", toolCallId: "tc-stmp-02", result: "Three plans: Single Origin $17/bag, Roaster's Pick $15/bag, Founder's Blend $14/bag, weekly or biweekly. Shipping $6 flat, free over $40. Origin detail stops at country." }),
    runEvent(tRun, minutes(-3), { type: "scratchpad_update", items: stumptownPad("done", "in_progress") }),
    runEvent(tRun, minutes(-1), { type: "tool_call_start", toolName: "web_fetch", toolCallId: "tc-stmp-03", input: { url: "https://www.dailygrindreview.test/stumptown-subscription" } }),

    runEvent(tFail, days(-3), { type: "run_start", taskId: tFail, agentName: "Alex", provider: "stub" }),
    runEvent(tFail, days(-3), { type: "tool_call_start", toolName: "web_fetch", toolCallId: "tc-trade-01", input: { url: "https://www.tradecoffee.test/pricing" } }),
    runEvent(tFail, days(-3), { type: "tool_call_end", toolName: "web_fetch", toolCallId: "tc-trade-01", result: "HTTP 403 Forbidden from www.tradecoffee.test/pricing. Body: 'Access denied'. Page appears to be behind bot protection." }),
    runEvent(tFail, days(-3), { type: "error", message: "Crawl blocked: 403 Forbidden at www.tradecoffee.test/pricing", recoverable: false }),

    runEvent(tTo, days(-8), { type: "run_start", taskId: tTo, agentName: "Jordan", provider: "stub" }),
    runEvent(tTo, days(-8), { type: "tool_call_start", toolName: "web_search", toolCallId: "tc-enrich-01", input: { query: "portland cafe manager contact directory" } }),
    runEvent(tTo, days(-8), { type: "tool_call_end", toolName: "web_search", toolCallId: "tc-enrich-01", result: "Compiled buyer names for 24 of 40 cafes before the run went stale." }),
  ]);

  // ── Knowledge base ──

  await db.insert(knowledgeItems).values([
    { companyId: COMPANY_ID, category: "company_overview", title: "About Northwind Coffee", content: "Northwind Coffee is a 12-person specialty roaster and subscription business in Portland, OR, founded by Maya Chen. We source single-origin lots, roast every Tuesday, and ship every Thursday so beans arrive in their peak window. A wholesale line for cafes launches this quarter.", sourceType: "interview", aiSummary: "12-person Portland roaster, founder Maya Chen, Tuesday roast, Thursday ship, wholesale launching.", verified: true, verifiedAt: days(-22) },
    { companyId: COMPANY_ID, category: "products", title: "Subscription tiers and pricing", content: "Explorer: $24/mo, two 250g bags. Regular: $38/mo, two 340g bags. Obsessive: $56/mo, three bags including first access to limited lots. All tiers single-origin, all can pause, skip, or swap from the account page. Wholesale line: 38% margin at suggested retail, no minimums for the first eight weeks.", sourceType: "document", aiSummary: "Explorer $24, Regular $38, Obsessive $56. Wholesale at 38% margin.", verified: true, verifiedAt: days(-22) },
    { companyId: COMPANY_ID, category: "audience", title: "Who we serve", content: "Origin-curious home drinkers who care about freshness and provenance over price, plus Portland cafes that want a guest roaster with a story their staff can retell. Top churn reason is too much coffee, not price, so skip-a-box is always offered before discounts.", sourceType: "interview", aiSummary: "Origin-curious home drinkers and Portland cafes. Churn is volume, not price.", verified: true, verifiedAt: days(-21) },
    { companyId: COMPANY_ID, category: "brand_voice", title: "Northwind voice and tone", content: "Plain, warm, and specific. We sound like a knowledgeable friend, not a luxury catalog. Back every claim with a real detail: a farm, a lot, a number. Say 'craft', never 'artisanal'. Never use em-dashes. Support signs off 'Maya + the Northwind crew'.", sourceType: "feedback_learned", aiSummary: "Plain, warm, specific. Craft not artisanal. Crew sign-off.", verified: true, verifiedAt: days(-9) },
    { companyId: COMPANY_ID, category: "competitors", title: "Competitive landscape", content: "Blue Bottle leads on brand and retail but routes subscribers to blends by default. Stumptown is the hometown heavyweight with country-level origin detail. Trade Coffee owns quiz-based onboarding but matches at roaster level only. Northwind wins on per-lot transparency printed on every bag.", sourceType: "url_crawl", aiSummary: "Blue Bottle, Stumptown, Trade. We win on per-lot transparency.", verified: true, verifiedAt: days(-11) },
    { companyId: COMPANY_ID, category: "processes", title: "Roasting and fulfillment cadence", content: "Roast Tuesdays, ship Thursdays. Orders placed by Sunday midnight make that week's roast. Never promise a roast date earlier than Thursday. The Northeast is served by a regional carrier that occasionally backs up; own the delay plainly when it does.", sourceType: "document", aiSummary: "Roast Tue, ship Thu. Never promise earlier than Thursday.", verified: true, verifiedAt: days(-20) },
    { companyId: COMPANY_ID, category: "historical_outputs", title: "Top performing content", content: "The washed-process explainer is the best evergreen piece. Newsletters with two named lots and tasting notes outperform single-lot sends. Teardowns with delivered-price tables get shared by subscribers unprompted.", sourceType: "feedback_learned", aiSummary: "Washed-process blog and two-lot newsletters perform best.", verified: false },
  ]);

  // ── Check-ins: one weekly per employee, each with an open question ──

  await db.insert(checkIns).values([
    {
      aiEmployeeId: ALEX_ID, companyId: COMPANY_ID, checkInType: "weekly_report", taskId: null,
      acknowledged: false, scheduledFor: hours(-4), createdAt: hours(-4),
      content: {
        headline: "Newsletter drafted, Blue Bottle teardown in your tray, Stumptown running now",
        summary: "The October newsletter and the Blue Bottle teardown are waiting on review, and the Stumptown teardown is running as we speak. Open question: the teardowns keep landing well, so do we want a public comparison page on the site, or do they stay internal ammunition?",
        deliverableTitle: "Alex's weekly check-in",
        deliverableType: "summary",
        completedTasks: [
          { taskId: tA5, title: "Win-back email: lapsed Explorer subscribers", status: "accepted" },
          { taskId: tPub, title: "Blog: what 'washed process' actually means", status: "published" },
        ],
        highlights: ["Delivered-price tables are getting shared by subscribers", "Win-back email approved without structural edits"],
        suggestedActions: ["Answer: public comparison page or internal-only teardowns?", "Review the October newsletter before Tuesday's send window"],
      },
    },
    {
      aiEmployeeId: JORDAN_ID, companyId: COMPANY_ID, checkInType: "weekly_report", taskId: null,
      acknowledged: false, scheduledFor: hours(-3), createdAt: hours(-3),
      content: {
        headline: "Proud Mary pitch in review, Heart wants November, 3 of 10 accounts landed",
        summary: "Heart Roasters said yes to a November guest slot, which makes three accounts toward the goal of ten. The Proud Mary email is in your tray. Open question: Proud Mary wants net-60 terms and the manual has no rule on payment terms. What's our floor?",
        deliverableTitle: "Jordan's weekly check-in",
        deliverableType: "summary",
        completedTasks: [
          { taskId: tA4, title: "Outreach: Heart Roasters guest slot", status: "accepted" },
        ],
        highlights: ["Neighborhood-first openers are getting same-day replies"],
        suggestedActions: ["Answer: what payment terms can I offer? Net-30, net-60, or deposit-first?"],
      },
    },
    {
      aiEmployeeId: SAM_ID, companyId: COMPANY_ID, checkInType: "weekly_report", taskId: null,
      acknowledged: false, scheduledFor: hours(-2), createdAt: hours(-2),
      content: {
        headline: "First-response time at 4.6h and falling, grind FAQ drafted",
        summary: "Median first response is down to 4.6 hours from 7.1 three weeks ago; the reply templates are doing the work. The grind-setting FAQ is in review, and there are 12 threads queued for tomorrow. Open question: three customers asked this week whether we will ever do decaf. Do I keep saying 'not yet' or is it actually on the roadmap?",
        deliverableTitle: "Sam's weekly check-in",
        deliverableType: "summary",
        completedTasks: [
          { taskId: tA3, title: "Reply batch: roast-date questions", status: "accepted" },
        ],
        highlights: ["Pause spike arrived on schedule after the billing email; skip-a-box offer absorbed most of it"],
        suggestedActions: ["Answer: what do I tell customers asking about decaf?"],
      },
    },
    {
      aiEmployeeId: ALEX_ID, companyId: COMPANY_ID, checkInType: "post_approval_followup", taskId: tA5,
      acknowledged: false, scheduledFor: hours(28), createdAt: days(-8),
      content: {
        deliverableId: dA5,
        deliverableTitle: "Win-back email: lapsed Explorer subscribers",
        deliverableType: "email",
        goalId: goalSubs,
        approvedAt: iso(-8),
        scheduledFor: hours(28).toISOString(),
        summary: "The win-back email is approved. Want me to send it to the 214 lapsed Explorer subscribers before Sunday's order cutoff?",
      },
    },
  ]);

  // ── Collaboration + autonomy ──

  await db.insert(collaborationProposals).values([
    { companyId: COMPANY_ID, fromEmployeeId: ALEX_ID, toEmployeeId: JORDAN_ID, sourceDeliverableId: dBb, proposal: "The Blue Bottle teardown has the delivered-price table cafes always ask about. Want it trimmed into a one-pager for wholesale outreach?", status: "pending", createdAt: days(-1) },
    { companyId: COMPANY_ID, fromEmployeeId: SAM_ID, toEmployeeId: ALEX_ID, sourceDeliverableId: dFaq, proposal: "Four customers hit the grind-setting confusion this week. Worth a short newsletter section so the rest do not have to write in?", status: "pending", createdAt: hours(-14) },
  ]);

  await db.insert(autonomySuggestions).values([
    { companyId: COMPANY_ID, aiEmployeeId: ALEX_ID, action: "sendEmail", consecutiveApprovals: 4, message: "Alex has had 4 emails approved in a row with only voice-level edits. Want to let Alex send approved subscriber emails automatically?", state: "queued", createdAt: days(-2), updatedAt: days(-2) },
  ]);

  // ── Chat ──

  await db.insert(chatMessages).values([
    { companyId: COMPANY_ID, aiEmployeeId: ALEX_ID, role: "user", content: "Can you tear down Stumptown's subscription next? Same format as the Trade one.", createdAt: hours(-2) },
    { companyId: COMPANY_ID, aiEmployeeId: ALEX_ID, role: "assistant", content: "On it. Same format: delivered-price table, two sources per claim, one thing to steal. Their shipping policy is the number I most want, since their sticker prices look aggressive without it.", taskId: tRun, createdAt: hours(-1) },
    { companyId: COMPANY_ID, aiEmployeeId: JORDAN_ID, role: "user", content: "How did the Heart Roasters pitch land?", createdAt: days(-11) },
    { companyId: COMPANY_ID, aiEmployeeId: JORDAN_ID, role: "assistant", content: "Theo replied the next morning: November works for a four-week guest slot. The first email actually bounced at the owner's inbox; the cafe manager turned out to be the real buyer. I have noted that for every pitch going forward.", taskId: tA4, createdAt: days(-11) },
    { companyId: COMPANY_ID, aiEmployeeId: SAM_ID, role: "user", content: "Anything trending in the inbox this week?", createdAt: days(-4) },
    { companyId: COMPANY_ID, aiEmployeeId: SAM_ID, role: "assistant", content: "Two things: the monthly pause spike arrived right after the billing email, mostly absorbed by the skip-a-box offer, and the grind-setting question keeps coming since the burr swap. I drafted a reusable FAQ reply for the second one; it is in your review tray.", taskId: tFaq, createdAt: days(-4) },
  ]);

  // ── Activity ledger (~25 rows over 3 weeks) ──

  const A = (
    aiEmployeeId: string | null,
    actionType: string,
    actionDetail: Record<string, unknown>,
    createdAt: Date,
    reasoning?: string,
  ) => ({ companyId: COMPANY_ID, aiEmployeeId, actionType, actionDetail, reasoning: reasoning ?? null, createdAt });

  await db.insert(activityLog).values([
    A(ALEX_ID, "employee_hired", { aiEmployeeId: ALEX_ID, name: "Alex", roleTitle: "Marketing Manager", roleType: "marketing" }, days(-21)),
    A(JORDAN_ID, "employee_hired", { aiEmployeeId: JORDAN_ID, name: "Jordan", roleTitle: "Wholesale Sales Rep", roleType: "sales" }, days(-21)),
    A(SAM_ID, "employee_hired", { aiEmployeeId: SAM_ID, name: "Sam", roleTitle: "Support Lead", roleType: "support" }, days(-20)),
    A(ALEX_ID, "status_change", { from: "idle", to: "working", reason: "picked up the September newsletter" }, days(-17)),
    A(ALEX_ID, "deliverable_approved", { deliverableTitle: "September subscriber newsletter", deliverableId: dA1, taskId: tA1, taskType: "email" }, days(-16)),
    A(ALEX_ID, "patterns_learned", { count: 2, fromEpisodes: 5, titles: ["R-001 Subject lines stay under 45 characters", "R-006 Discounts lead with the dollar amount, not the percent"] }, days(-15), "Consolidated overnight from newsletter review edits."),
    A(ALEX_ID, "deliverable_published", { deliverableTitle: "What 'washed process' actually means", deliverableId: dPub, platform: "blog" }, days(-14)),
    A(JORDAN_ID, "checkin_response_applied", { taskTitle: "Outreach: Heart Roasters guest slot", taskId: tA4 }, days(-13)),
    A(ALEX_ID, "deliverable_approved", { deliverableTitle: "Teardown: Trade Coffee subscriptions", deliverableId: dA2, taskId: tA2, taskType: "report" }, days(-12)),
    A(JORDAN_ID, "deliverable_approved", { deliverableTitle: "Outreach: Heart Roasters guest slot", deliverableId: dA4, taskId: tA4, taskType: "email" }, days(-12)),
    A(ALEX_ID, "patterns_learned", { count: 2, fromEpisodes: 4, titles: ["R-002 Price comparisons always include shipping", "R-005 Competitor claims cite at least two sources"] }, days(-11), "Both Trade teardown edits were shipping-price framing."),
    A(SAM_ID, "deliverable_approved", { deliverableTitle: "Reply batch: roast-date questions", deliverableId: dA3, taskId: tA3, taskType: "custom" }, days(-10)),
    A(SAM_ID, "patterns_learned", { count: 2, fromEpisodes: 6, titles: ["R-003 Support replies sign off 'Maya + the Northwind crew'", "R-004 Never promise roast dates earlier than Thursday"] }, days(-9), "The roast-date rationale promoted straight through the gate."),
    A(JORDAN_ID, "task_timed_out", { taskId: tTo, title: "Enrich 40 cafe contacts with buyer names", staleMinutes: 15 }, days(-8)),
    A(ALEX_ID, "deliverable_approved", { deliverableTitle: "Win-back email: lapsed Explorer subscribers", deliverableId: dA5, taskId: tA5, taskType: "email" }, days(-8)),
    A(JORDAN_ID, "patterns_learned", { count: 2, fromEpisodes: 4, titles: ["R-007 No exclamation marks in outreach subject lines", "R-008 Wholesale pitches name the cafe's neighborhood in the first line"] }, days(-7), "Consolidated from three outreach reviews."),
    A(JORDAN_ID, "collaboration_proposal_approved", { proposalText: "Turn the accepted cafe list into a wholesale outreach sequence.", resultingTaskId: tQ1 }, days(-5)),
    A(SAM_ID, "checkin_response_applied", { taskTitle: "Reply batch: roast-date questions", taskId: tA3 }, days(-5)),
    A(ALEX_ID, "status_change", { from: "running", to: "failed", reason: "Trade Coffee pricing crawl blocked with a 403" }, days(-3)),
    A(ALEX_ID, "status_change", { from: "failed", to: "queued", reason: "orchestrator retry 2 of 2" }, days(-3)),
    A(ALEX_ID, "rule_deprecated", { ruleId: rDep, ruleTitle: "R-009 Mention the founder story in every email", reason: "Auto-deprecated: approval rate dropped -14%", approvalRateDelta: -0.14 }, days(-2)),
    A(ALEX_ID, "autonomy_suggestion", { message: "Alex has had 4 emails approved in a row with only voice-level edits.", action: "sendEmail" }, days(-2)),
    A(SAM_ID, "recurring_task_spawned", { taskType: "custom", taskTitle: "Weekly inbox digest" }, days(-4)),
    A(ALEX_ID, "recurring_task_spawned", { taskType: "email", taskTitle: "Monthly newsletter draft" }, days(-6)),
    A(JORDAN_ID, "status_change", { from: "idle", to: "waiting_review", reason: "Proud Mary outreach filed for review" }, hours(-22)),
    A(SAM_ID, "status_change", { from: "working", to: "idle", reason: "grind-setting FAQ filed for review" }, hours(-16)),
    A(ALEX_ID, "status_change", { from: "idle", to: "working", reason: "picked up the Stumptown teardown" }, minutes(-10)),
  ]);
}

async function demoCounts(db: Db): Promise<Record<string, number>> {
  const n = sql<number>`count(*)::int`;
  const pairs: Array<[string, Promise<Array<{ n: number }>>]> = [
    ["companies", db.select({ n }).from(companies).where(eq(companies.userId, DEMO_USER_ID))],
    ["ai_employees", db.select({ n }).from(aiEmployees).where(eq(aiEmployees.companyId, COMPANY_ID))],
    ["goals", db.select({ n }).from(goals).where(eq(goals.companyId, COMPANY_ID))],
    ["tasks", db.select({ n }).from(tasks).where(eq(tasks.companyId, COMPANY_ID))],
    ["deliverables", db.select({ n }).from(deliverables).where(eq(deliverables.companyId, COMPANY_ID))],
    ["agent_run_events", db.select({ n }).from(agentRunEvents).where(eq(agentRunEvents.companyId, COMPANY_ID))],
    ["procedural_memories", db.select({ n }).from(proceduralMemories).where(eq(proceduralMemories.tenantId, COMPANY_ID))],
    ["rule_candidates", db.select({ n }).from(ruleCandidates).where(eq(ruleCandidates.tenantId, COMPANY_ID))],
    ["episodic_memories", db.select({ n }).from(episodicMemories).where(eq(episodicMemories.tenantId, COMPANY_ID))],
    ["semantic_memories", db.select({ n }).from(semanticMemories).where(eq(semanticMemories.tenantId, COMPANY_ID))],
    ["knowledge_items", db.select({ n }).from(knowledgeItems).where(eq(knowledgeItems.companyId, COMPANY_ID))],
    ["check_ins", db.select({ n }).from(checkIns).where(eq(checkIns.companyId, COMPANY_ID))],
    ["collaboration_proposals", db.select({ n }).from(collaborationProposals).where(eq(collaborationProposals.companyId, COMPANY_ID))],
    ["autonomy_suggestions", db.select({ n }).from(autonomySuggestions).where(eq(autonomySuggestions.companyId, COMPANY_ID))],
    ["chat_messages", db.select({ n }).from(chatMessages).where(eq(chatMessages.companyId, COMPANY_ID))],
    ["activity_log", db.select({ n }).from(activityLog).where(eq(activityLog.companyId, COMPANY_ID))],
  ];
  const out: Record<string, number> = {};
  for (const [label, p] of pairs) out[label] = (await p)[0]?.n ?? 0;
  return out;
}

/**
 * Wipes and reseeds the Northwind Coffee demo company, including any
 * demo-session/visitor rows if those tables exist. Idempotent; safe to run
 * nightly or on demand. Returns per-table row counts for the seeded world.
 */
export async function seedDemo(db: Db): Promise<Record<string, number>> {
  await wipe(db);
  await seed(db);
  return demoCounts(db);
}
