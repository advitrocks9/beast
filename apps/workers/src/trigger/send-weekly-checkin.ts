import { schedules } from "@trigger.dev/sdk";
import { Resend } from "resend";
import {
  db,
  companies,
  aiEmployees,
  deliverables,
  goals,
  tasks,
  checkIns,
  activityLog,
} from "@beast/db";
import { and, desc, eq, gte, inArray, isNull, or } from "drizzle-orm";
import { renderWeeklyEmail, type WeeklyData } from "../email/weekly-template";

/**
 * Weekly check-in email.
 * Cron: Monday 09:00 UTC. Per-company timezone honoring is deferred.
 *
 * Body shape (4 sections, in order):
 *   1. Where you are        - active goals + progressPct, stalled flag
 *   2. What I shipped       - approved/published deliverables in last 7 days
 *   3. What's waiting       - in-review deliverables
 *   4. What I want to do    - one canned proposal per active employee
 */
export const sendWeeklyCheckin = schedules.task({
  id: "send-weekly-checkin",
  cron: "0 9 * * 1",
  run: async () => {
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      return { skipped: true, reason: "RESEND_API_KEY not configured" };
    }

    const resend = new Resend(resendKey);
    const appUrl =
      process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const fromEmail = process.env.EMAIL_FROM ?? "Beast <updates@beast.app>";

    const activeCompanies = await db.query.companies.findMany({
      where: eq(companies.onboardingStatus, "complete"),
      columns: {
        id: true,
        name: true,
        founderEmail: true,
        weeklyEmptyStateSentAt: true,
      },
    });

    let sent = 0;
    let skipped = 0;
    const errors: string[] = [];
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Skip companies that already received their weekly check-in within the
    // last 24 hours. Trigger.dev retries up to 3x; without this anchor a
    // mid-loop failure would re-send to every company already processed in
    // attempt 1. The cron fires once a week so a 24h window is plenty wide
    // to cover any retry burst without false positives.
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const sentRecently = await db.query.activityLog.findMany({
      where: and(
        eq(activityLog.actionType, "weekly_checkin_sent"),
        gte(activityLog.createdAt, oneDayAgo),
      ),
      columns: { companyId: true },
    });
    const alreadySent = new Set(sentRecently.map((r) => r.companyId));

    for (const company of activeCompanies) {
      try {
        if (alreadySent.has(company.id)) {
          skipped++;
          continue;
        }

        if (!company.founderEmail) {
          skipped++;
          errors.push(`${company.id}: no founder_email on row`);
          continue;
        }

        const data = await buildWeeklyData({
          companyId: company.id,
          companyName: company.name,
          appUrl,
          since: sevenDaysAgo,
        });

        if (data.isEmptyState) {
          // send the empty-state email exactly once per company.
          // Subsequent weeks with empty state skip silently.
          if (company.weeklyEmptyStateSentAt) {
            skipped++;
            continue;
          }

          const subject = "[Alex] Tell me what to work on";
          const html = renderWeeklyEmail(data);
          const { error } = await resend.emails.send({
            from: fromEmail,
            to: [company.founderEmail],
            subject,
            html,
          });
          if (error) throw new Error(`Resend error: ${error.message}`);

          await db
            .update(companies)
            .set({ weeklyEmptyStateSentAt: new Date() })
            .where(eq(companies.id, company.id));
          await db.insert(activityLog).values({
            companyId: company.id,
            aiEmployeeId: null,
            actionType: "weekly_checkin_sent",
            actionDetail: { sentAt: new Date().toISOString(), variant: "empty_state" },
          });
          sent++;
          continue;
        }

        const subject = "[Alex] Goal status + this week's teardown";
        const html = renderWeeklyEmail(data);

        const { error } = await resend.emails.send({
          from: fromEmail,
          to: [company.founderEmail],
          subject,
          html,
        });
        if (error) throw new Error(`Resend error: ${error.message}`);
        await db.insert(activityLog).values({
          companyId: company.id,
          aiEmployeeId: null,
          actionType: "weekly_checkin_sent",
          actionDetail: { sentAt: new Date().toISOString(), variant: "regular" },
        });
        sent++;
      } catch (err) {
        errors.push(
          `${company.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return { companiesProcessed: activeCompanies.length, sent, skipped, errors };
  },
});

async function buildWeeklyData(args: {
  companyId: string;
  companyName: string;
  appUrl: string;
  since: Date;
}): Promise<WeeklyData> {
  const { companyId, companyName, appUrl, since } = args;

  const date = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const employees = await db.query.aiEmployees.findMany({
    where: eq(aiEmployees.companyId, companyId),
    columns: { id: true, name: true },
  });
  const empNameMap = new Map(employees.map((e) => [e.id, e.name]));

  const activeGoals = await db.query.goals.findMany({
    where: and(
      eq(goals.companyId, companyId),
      isNull(goals.parentGoalId),
      eq(goals.status, "active"),
    ),
    columns: {
      title: true,
      progressPct: true,
      targetMetric: true,
      targetDate: true,
      updatedAt: true,
    },
    limit: 5,
  });

  const goalsOut = activeGoals.map((g) => ({
    title: g.title,
    progressPct: g.progressPct,
    targetMetric: g.targetMetric,
    targetDate: g.targetDate,
    stalled: g.updatedAt ? g.updatedAt < since : false,
  }));

  const shippedRows = await db.query.deliverables.findMany({
    where: and(
      eq(deliverables.companyId, companyId),
      or(
        eq(deliverables.status, "approved"),
        eq(deliverables.status, "published"),
      ),
      gte(deliverables.updatedAt, since),
    ),
    columns: {
      id: true,
      title: true,
      aiEmployeeId: true,
      deliverableType: true,
      content: true,
    },
    orderBy: [desc(deliverables.updatedAt)],
    limit: 10,
  });

  const shipped = shippedRows.map((d) => ({
    employeeName: empNameMap.get(d.aiEmployeeId) ?? "AI Employee",
    title: d.title,
    deliverableId: d.id,
    deliverableType: d.deliverableType,
    summary: extractSummary(d.content),
  }));

  const waitingRows = await db.query.deliverables.findMany({
    where: and(
      eq(deliverables.companyId, companyId),
      eq(deliverables.status, "review"),
    ),
    columns: { id: true, title: true, aiEmployeeId: true },
    orderBy: [desc(deliverables.createdAt)],
    limit: 10,
  });

  const waiting = waitingRows.map((d) => ({
    employeeName: empNameMap.get(d.aiEmployeeId) ?? "AI Employee",
    title: d.title,
    deliverableId: d.id,
  }));

  // surface unacknowledged check-ins from the last 14 days as
  // section 3 of the email. Each row routes to the deeplink page from
  // with one of three responses.
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const checkInRows = await db.query.checkIns.findMany({
    where: and(
      eq(checkIns.companyId, companyId),
      eq(checkIns.acknowledged, false),
      gte(checkIns.createdAt, fourteenDaysAgo),
    ),
    columns: {
      id: true,
      aiEmployeeId: true,
      content: true,
    },
    orderBy: [desc(checkIns.createdAt)],
    limit: 5,
  });

  const checkInsOut = checkInRows.map((c) => {
    const content = c.content as Record<string, unknown> | null;
    const deliverableTitle = content && typeof content.deliverableTitle === "string"
      ? content.deliverableTitle
      : "your deliverable";
    return {
      checkInId: c.id,
      employeeName: empNameMap.get(c.aiEmployeeId) ?? "AI Employee",
      deliverableTitle,
    };
  });

  const proposed = await buildProposed({
    companyId,
    employees,
    goalsOut,
    appUrl,
  });

  const isEmptyState =
    goalsOut.length === 0 && shipped.length === 0 && waiting.length === 0 && checkInsOut.length === 0;

  return {
    companyName,
    date,
    goals: goalsOut,
    shipped,
    checkIns: checkInsOut,
    waiting,
    proposed,
    appUrl,
    isEmptyState,
  };
}

async function buildProposed(args: {
  companyId: string;
  employees: Array<{ id: string; name: string }>;
  goalsOut: WeeklyData["goals"];
  appUrl: string;
}): Promise<WeeklyData["proposed"]> {
  const { companyId, employees, goalsOut, appUrl } = args;
  if (employees.length === 0 || goalsOut.length === 0) return [];

  const recentTasks = await db.query.tasks.findMany({
    where: and(
      eq(tasks.companyId, companyId),
      inArray(
        tasks.aiEmployeeId,
        employees.map((e) => e.id),
      ),
    ),
    columns: { id: true, aiEmployeeId: true, taskType: true, completedAt: true },
    orderBy: [desc(tasks.createdAt)],
    limit: 25,
  });

  const focus = goalsOut.find((g) => g.stalled) ?? goalsOut[0];
  if (!focus) return [];
  const focusTitle = focus.title;

  return employees.slice(0, 1).map((emp) => {
    const hasShippedTeardown = recentTasks.some(
      (t) => t.aiEmployeeId === emp.id && t.taskType === "competitive_teardown",
    );
    const summary = hasShippedTeardown
      ? `tear down a second competitor for "${focusTitle}"`
      : `tear down one competitor for "${focusTitle}"`;
    return {
      employeeName: emp.name,
      summary,
      ctaLabel: "Go ahead",
      ctaUrl: `${appUrl}/dashboard?propose=teardown&employeeId=${emp.id}`,
    };
  });
}

function extractSummary(content: unknown): string | null {
  if (!content || typeof content !== "object") return null;
  const c = content as Record<string, unknown>;
  if (typeof c.summary === "string" && c.summary.length > 0) {
    return c.summary.slice(0, 200);
  }
  if (typeof c.tldr === "string" && c.tldr.length > 0) {
    return c.tldr.slice(0, 200);
  }
  return null;
}
