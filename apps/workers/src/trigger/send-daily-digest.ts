import { schedules } from "@trigger.dev/sdk";
import { Resend } from "resend";
import { db, companies, aiEmployees, tasks, deliverables, goals, activityLog } from "@beast/db";
import { eq, and, gte, isNull, desc } from "drizzle-orm";
import { renderDigestEmail } from "../email/digest-template";

/**
 * Daily digest email - runs every morning at 8 AM UTC.
 * Sends a summary to each company founder: tasks completed, items pending review, goal progress.
 */
export const sendDailyDigest = schedules.task({
  id: "send-daily-digest",
  // Declarative schedule so Trigger.dev auto-creates the recurrence on
  // deploy. Without this, the task is dormant and the daily email never
  // sends. 8 AM UTC matches the original spec comment above.
  cron: "0 8 * * *",
  run: async () => {
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      return { skipped: true, reason: "RESEND_API_KEY not configured" };
    }

    const resend = new Resend(resendKey);
    const appUrl = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const fromEmail = process.env.EMAIL_FROM ?? "Beast <updates@beast.app>";

    // Find all active companies with completed onboarding
    const activeCompanies = await db.query.companies.findMany({
      where: eq(companies.onboardingStatus, "complete"),
      columns: { id: true, name: true, userId: true, founderEmail: true },
    });

    // Skip companies that already received their digest today. Trigger.dev
    // retries this task up to 3x by default, and a transient failure
    // partway through the loop would otherwise re-send the digest to every
    // company already processed in the prior attempt. Idempotency comes
    // from a daily_digest_sent activity_log row written after each
    // successful send; pre-fetched in one query.
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const sentToday = await db.query.activityLog.findMany({
      where: and(
        eq(activityLog.actionType, "daily_digest_sent"),
        gte(activityLog.createdAt, todayStart),
      ),
      columns: { companyId: true },
    });
    const alreadySent = new Set(sentToday.map((r) => r.companyId));

    let sent = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const company of activeCompanies) {
      try {
        if (alreadySent.has(company.id)) {
          skipped++;
          continue;
        }

        // Founder email lives on the companies row (populated at onboarding,
        //). Skip the row if we somehow have a company without one.
        if (!company.founderEmail) {
          skipped++;
          errors.push(`${company.id}: no founder_email on row`);
          continue;
        }

        // Gather digest data for the last 24 hours
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

        const completedTasks = await db.query.tasks.findMany({
          where: and(
            eq(tasks.companyId, company.id),
            gte(tasks.completedAt, since),
          ),
          columns: { title: true, aiEmployeeId: true },
          limit: 10,
        });

        const pendingReview = await db.query.deliverables.findMany({
          where: and(
            eq(deliverables.companyId, company.id),
            eq(deliverables.status, "review"),
          ),
          columns: { id: true, title: true, aiEmployeeId: true },
          orderBy: [desc(deliverables.createdAt)],
          limit: 10,
        });

        const companyGoals = await db.query.goals.findMany({
          where: and(
            eq(goals.companyId, company.id),
            isNull(goals.parentGoalId),
            eq(goals.status, "active"),
          ),
          columns: { title: true, progressPct: true },
          limit: 5,
        });

        // Skip if nothing to report and no pending reviews
        if (completedTasks.length === 0 && pendingReview.length === 0 && companyGoals.length === 0) {
          skipped++;
          continue;
        }

        // Resolve employee names
        const employees = await db.query.aiEmployees.findMany({
          where: eq(aiEmployees.companyId, company.id),
          columns: { id: true, name: true },
        });
        const empNameMap = new Map(employees.map((e) => [e.id, e.name]));

        const html = renderDigestEmail({
          companyName: company.name,
          date: new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }),
          tasksCompleted: completedTasks.map((t) => ({
            employeeName: empNameMap.get(t.aiEmployeeId) ?? "AI Employee",
            title: t.title,
          })),
          pendingReview: pendingReview.map((d) => ({
            employeeName: empNameMap.get(d.aiEmployeeId) ?? "AI Employee",
            title: d.title,
            deliverableId: d.id,
          })),
          goalProgress: companyGoals.map((g) => ({
            title: g.title,
            progressPct: g.progressPct,
          })),
          appUrl,
        });

        const subject = `Beast Daily Digest - ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
        const { error } = await resend.emails.send({
          from: fromEmail,
          to: [company.founderEmail],
          subject,
          html,
        });
        if (error) throw new Error(`Resend error: ${error.message}`);

        // Mark sent BEFORE bumping the counter so that even if the insert
        // throws we still return a consistent count. The audit row is the
        // idempotency anchor for the next retry attempt.
        await db.insert(activityLog).values({
          companyId: company.id,
          aiEmployeeId: null,
          actionType: "daily_digest_sent",
          actionDetail: {
            sentAt: new Date().toISOString(),
            tasksCompleted: completedTasks.length,
            pendingReview: pendingReview.length,
          },
        });
        sent++;
      } catch (err) {
        errors.push(`${company.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return { companiesProcessed: activeCompanies.length, sent, skipped, errors };
  },
});
