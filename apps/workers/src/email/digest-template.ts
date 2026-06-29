/**
 * Daily digest email template.
 * Inline styles only - email clients don't support external CSS.
 */

interface DigestData {
  companyName: string;
  date: string;
  tasksCompleted: Array<{ employeeName: string; title: string }>;
  pendingReview: Array<{ employeeName: string; title: string; deliverableId: string }>;
  goalProgress: Array<{ title: string; progressPct: number }>;
  appUrl: string;
}

export function renderDigestEmail(data: DigestData): string {
  const { companyName, date, tasksCompleted, pendingReview, goalProgress, appUrl } = data;

  const reviewItems = pendingReview.map((r) => `
    <tr>
      <td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6;">
        <span style="font-weight: 500;">${r.employeeName}</span>
        <br />
        <a href="${appUrl}/deliverables/${r.deliverableId}" style="color: #3b82f6; text-decoration: none; font-size: 14px;">${r.title}</a>
      </td>
    </tr>
  `).join("");

  const taskItems = tasksCompleted.map((t) => `
    <tr>
      <td style="padding: 6px 0; font-size: 14px; color: #374151;">
        <span style="color: #22c55e;">&#10003;</span> ${t.employeeName} &mdash; ${t.title}
      </td>
    </tr>
  `).join("");

  const goalItems = goalProgress.map((g) => `
    <tr>
      <td style="padding: 6px 0;">
        <div style="font-size: 14px; color: #374151; margin-bottom: 4px;">${g.title}</div>
        <div style="background: #e5e7eb; border-radius: 4px; height: 6px; width: 100%;">
          <div style="background: ${g.progressPct >= 75 ? "#22c55e" : g.progressPct >= 40 ? "#f59e0b" : "#3b82f6"}; border-radius: 4px; height: 6px; width: ${g.progressPct}%;"></div>
        </div>
        <div style="font-size: 12px; color: #9ca3af; margin-top: 2px;">${g.progressPct}%</div>
      </td>
    </tr>
  `).join("");

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /></head>
<body style="margin: 0; padding: 0; background-color: #f9fafb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; padding: 32px 16px;">
    <tr>
      <td>
        <!-- Header -->
        <table width="100%" style="margin-bottom: 24px;">
          <tr>
            <td>
              <h1 style="margin: 0; font-size: 20px; color: #111827;">Beast</h1>
              <p style="margin: 4px 0 0; font-size: 14px; color: #6b7280;">Daily digest for ${companyName} &middot; ${date}</p>
            </td>
          </tr>
        </table>

        ${pendingReview.length > 0 ? `
        <!-- Pending Review -->
        <table width="100%" style="background: white; border-radius: 12px; padding: 20px; margin-bottom: 16px; border: 1px solid #e5e7eb;">
          <tr><td>
            <h2 style="margin: 0 0 12px; font-size: 16px; color: #111827;">
              &#128065; ${pendingReview.length} item${pendingReview.length > 1 ? "s" : ""} need your review
            </h2>
            <table width="100%" cellpadding="0" cellspacing="0">${reviewItems}</table>
          </td></tr>
        </table>
        ` : ""}

        ${tasksCompleted.length > 0 ? `
        <!-- Completed Tasks -->
        <table width="100%" style="background: white; border-radius: 12px; padding: 20px; margin-bottom: 16px; border: 1px solid #e5e7eb;">
          <tr><td>
            <h2 style="margin: 0 0 12px; font-size: 16px; color: #111827;">
              ${tasksCompleted.length} task${tasksCompleted.length > 1 ? "s" : ""} completed
            </h2>
            <table width="100%" cellpadding="0" cellspacing="0">${taskItems}</table>
          </td></tr>
        </table>
        ` : ""}

        ${goalProgress.length > 0 ? `
        <!-- Goal Progress -->
        <table width="100%" style="background: white; border-radius: 12px; padding: 20px; margin-bottom: 16px; border: 1px solid #e5e7eb;">
          <tr><td>
            <h2 style="margin: 0 0 12px; font-size: 16px; color: #111827;">Goal progress</h2>
            <table width="100%" cellpadding="0" cellspacing="0">${goalItems}</table>
          </td></tr>
        </table>
        ` : ""}

        ${tasksCompleted.length === 0 && pendingReview.length === 0 ? `
        <!-- Nothing to report -->
        <table width="100%" style="background: white; border-radius: 12px; padding: 20px; margin-bottom: 16px; border: 1px solid #e5e7eb;">
          <tr><td style="text-align: center; color: #6b7280; font-size: 14px; padding: 16px;">
            All quiet today. Your team is up to date.
          </td></tr>
        </table>
        ` : ""}

        <!-- CTA -->
        <table width="100%" style="margin-bottom: 24px;">
          <tr><td style="text-align: center;">
            <a href="${appUrl}/dashboard" style="display: inline-block; background: #111827; color: white; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 500;">
              Open Beast
            </a>
          </td></tr>
        </table>

        <!-- Footer -->
        <table width="100%">
          <tr><td style="text-align: center; font-size: 12px; color: #9ca3af;">
            <p style="margin: 0;">You're receiving this because you're subscribed to Beast daily digests.</p>
            <p style="margin: 4px 0 0;"><a href="${appUrl}/settings" style="color: #9ca3af;">Manage email preferences</a></p>
          </td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
