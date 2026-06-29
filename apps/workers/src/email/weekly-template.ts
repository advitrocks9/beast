/**
 * Weekly check-in email template.
 * Inline styles only; no external CSS.
 *
 * Four sections per the v0 spec (DEMO_README.md "Weekly Cadence Spec"):
 *   1. Where you are
 *   2. What I shipped last week
 *   3. What's waiting on you
 *   4. What I want to do this week
 */

export interface WeeklyData {
  companyName: string;
  date: string;
  goals: Array<{
    title: string;
    progressPct: number;
    targetMetric: string | null;
    targetDate: string | null;
    stalled: boolean;
  }>;
  shipped: Array<{
    employeeName: string;
    title: string;
    deliverableId: string;
    deliverableType: string;
    summary: string | null;
  }>;
  /**
   * Unacknowledged check-ins from prior approvals..
   * Each row gets three response buttons routing to /checkins/[id]?response=...
   * which the deeplink page handles.
   */
  checkIns: Array<{
    checkInId: string;
    employeeName: string;
    deliverableTitle: string;
  }>;
  waiting: Array<{
    employeeName: string;
    title: string;
    deliverableId: string;
  }>;
  proposed: Array<{
    employeeName: string;
    summary: string;
    ctaLabel: string;
    ctaUrl: string;
  }>;
  appUrl: string;
  isEmptyState: boolean;
}

export function renderWeeklyEmail(data: WeeklyData): string {
  const { companyName, date, goals, shipped, checkIns, waiting, proposed, appUrl, isEmptyState } = data;

  if (isEmptyState) {
    return renderEmptyState({ companyName, date, appUrl });
  }

  const goalRows = goals
    .map(
      (g) => `
    <tr>
      <td style="padding: 8px 0;">
        <div style="font-size: 14px; color: #111827; margin-bottom: 4px; font-weight: 500;">${escapeHtml(g.title)}</div>
        ${g.targetMetric ? `<div style="font-size: 12px; color: #6b7280; margin-bottom: 6px;">target: ${escapeHtml(g.targetMetric)}${g.targetDate ? ` by ${escapeHtml(g.targetDate)}` : ""}</div>` : ""}
        <div style="background: #e5e7eb; border-radius: 4px; height: 6px; width: 100%;">
          <div style="background: ${barColor(g.progressPct)}; border-radius: 4px; height: 6px; width: ${g.progressPct}%;"></div>
        </div>
        <div style="font-size: 12px; color: ${g.stalled ? "#b45309" : "#9ca3af"}; margin-top: 4px;">
          ${g.progressPct}%${g.stalled ? " &middot; no movement in 7 days" : ""}
        </div>
      </td>
    </tr>`,
    )
    .join("");

  const shippedRows = shipped
    .map(
      (s) => `
    <tr>
      <td style="padding: 10px 0; border-bottom: 1px solid #f3f4f6;">
        <div style="font-size: 14px; color: #111827;">
          <span style="color: #16a34a;">&#10003;</span>
          <strong>${escapeHtml(s.employeeName)}</strong> shipped
          <a href="${appUrl}/review/${s.deliverableId}" style="color: #3b82f6; text-decoration: none;">${escapeHtml(s.title)}</a>
        </div>
        ${s.summary ? `<div style="font-size: 13px; color: #6b7280; margin-top: 4px;">${escapeHtml(s.summary)}</div>` : ""}
      </td>
    </tr>`,
    )
    .join("");

  const checkInRows = checkIns
    .map(
      (c) => `
    <tr>
      <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6;">
        <div style="font-size: 14px; color: #111827; margin-bottom: 8px;">
          <strong>${escapeHtml(c.employeeName)}</strong> wants to know about
          <em>${escapeHtml(c.deliverableTitle)}</em>:
        </div>
        <div>
          <a href="${appUrl}/checkins/${c.checkInId}?response=used" style="display: inline-block; background: #16a34a; color: white; padding: 6px 12px; border-radius: 6px; text-decoration: none; font-size: 13px; font-weight: 500; margin-right: 6px;">Used it</a>
          <a href="${appUrl}/checkins/${c.checkInId}?response=edited" style="display: inline-block; background: #f59e0b; color: white; padding: 6px 12px; border-radius: 6px; text-decoration: none; font-size: 13px; font-weight: 500; margin-right: 6px;">Edited it</a>
          <a href="${appUrl}/checkins/${c.checkInId}?response=not_used" style="display: inline-block; background: #6b7280; color: white; padding: 6px 12px; border-radius: 6px; text-decoration: none; font-size: 13px; font-weight: 500;">Did not use it</a>
        </div>
      </td>
    </tr>`,
    )
    .join("");

  const waitingRows = waiting
    .map(
      (w) => `
    <tr>
      <td style="padding: 10px 0; border-bottom: 1px solid #f3f4f6;">
        <div style="font-size: 14px; color: #111827; margin-bottom: 6px;">
          <strong>${escapeHtml(w.employeeName)}</strong> is waiting on you:
          ${escapeHtml(w.title)}
        </div>
        <a href="${appUrl}/review/${w.deliverableId}" style="display: inline-block; background: #111827; color: white; padding: 6px 12px; border-radius: 6px; text-decoration: none; font-size: 13px; font-weight: 500;">
          Open in Beast
        </a>
      </td>
    </tr>`,
    )
    .join("");

  const proposedRows = proposed
    .map(
      (p) => `
    <tr>
      <td style="padding: 10px 0; border-bottom: 1px solid #f3f4f6;">
        <div style="font-size: 14px; color: #111827; margin-bottom: 6px;">
          <strong>${escapeHtml(p.employeeName)}</strong> wants to: ${escapeHtml(p.summary)}
        </div>
        <a href="${p.ctaUrl}" style="display: inline-block; background: #16a34a; color: white; padding: 6px 12px; border-radius: 6px; text-decoration: none; font-size: 13px; font-weight: 500;">
          ${escapeHtml(p.ctaLabel)}
        </a>
      </td>
    </tr>`,
    )
    .join("");

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /></head>
<body style="margin: 0; padding: 0; background-color: #f9fafb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; padding: 32px 16px;">
    <tr>
      <td>
        <table width="100%" style="margin-bottom: 24px;">
          <tr>
            <td>
              <h1 style="margin: 0; font-size: 22px; color: #111827;">Beast</h1>
              <p style="margin: 4px 0 0; font-size: 14px; color: #6b7280;">Weekly check-in for ${escapeHtml(companyName)} &middot; ${escapeHtml(date)}</p>
            </td>
          </tr>
        </table>

        ${
          goals.length > 0
            ? `
        <table width="100%" style="background: white; border-radius: 12px; padding: 20px; margin-bottom: 16px; border: 1px solid #e5e7eb;">
          <tr><td>
            <h2 style="margin: 0 0 12px; font-size: 16px; color: #111827;">Where you are</h2>
            <table width="100%" cellpadding="0" cellspacing="0">${goalRows}</table>
          </td></tr>
        </table>`
            : ""
        }

        ${
          shipped.length > 0
            ? `
        <table width="100%" style="background: white; border-radius: 12px; padding: 20px; margin-bottom: 16px; border: 1px solid #e5e7eb;">
          <tr><td>
            <h2 style="margin: 0 0 12px; font-size: 16px; color: #111827;">What I shipped last week</h2>
            <table width="100%" cellpadding="0" cellspacing="0">${shippedRows}</table>
          </td></tr>
        </table>`
            : ""
        }

        ${
          checkIns.length > 0
            ? `
        <table width="100%" style="background: white; border-radius: 12px; padding: 20px; margin-bottom: 16px; border: 1px solid #e5e7eb;">
          <tr><td>
            <h2 style="margin: 0 0 12px; font-size: 16px; color: #111827;">How did it go?</h2>
            <table width="100%" cellpadding="0" cellspacing="0">${checkInRows}</table>
          </td></tr>
        </table>`
            : ""
        }

        ${
          waiting.length > 0
            ? `
        <table width="100%" style="background: white; border-radius: 12px; padding: 20px; margin-bottom: 16px; border: 1px solid #fde68a; background: #fffbeb;">
          <tr><td>
            <h2 style="margin: 0 0 12px; font-size: 16px; color: #92400e;">What's waiting on you</h2>
            <table width="100%" cellpadding="0" cellspacing="0">${waitingRows}</table>
          </td></tr>
        </table>`
            : ""
        }

        ${
          proposed.length > 0
            ? `
        <table width="100%" style="background: white; border-radius: 12px; padding: 20px; margin-bottom: 16px; border: 1px solid #e5e7eb;">
          <tr><td>
            <h2 style="margin: 0 0 12px; font-size: 16px; color: #111827;">What I want to do this week</h2>
            <table width="100%" cellpadding="0" cellspacing="0">${proposedRows}</table>
          </td></tr>
        </table>`
            : ""
        }

        <table width="100%" style="margin-bottom: 24px;">
          <tr><td style="text-align: center;">
            <a href="${appUrl}/dashboard" style="display: inline-block; background: #111827; color: white; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 500;">
              Open Beast
            </a>
          </td></tr>
        </table>

        <table width="100%">
          <tr><td style="text-align: center; font-size: 12px; color: #9ca3af;">
            <p style="margin: 0;">Monday morning check-in. One per week.</p>
            <p style="margin: 4px 0 0;"><a href="${appUrl}/settings" style="color: #9ca3af;">Manage email preferences</a></p>
          </td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function renderEmptyState(args: { companyName: string; date: string; appUrl: string }): string {
  const { companyName, date, appUrl } = args;
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /></head>
<body style="margin: 0; padding: 0; background-color: #f9fafb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; padding: 32px 16px;">
    <tr>
      <td>
        <h1 style="margin: 0 0 8px; font-size: 22px; color: #111827;">Beast</h1>
        <p style="margin: 0 0 24px; font-size: 14px; color: #6b7280;">Weekly check-in for ${escapeHtml(companyName)} &middot; ${escapeHtml(date)}</p>

        <table width="100%" style="background: white; border-radius: 12px; padding: 24px; margin-bottom: 16px; border: 1px solid #e5e7eb;">
          <tr><td>
            <h2 style="margin: 0 0 8px; font-size: 16px; color: #111827;">Tell me what to work on.</h2>
            <p style="margin: 0 0 16px; font-size: 14px; color: #374151; line-height: 1.6;">
              You haven't set a goal yet. I can produce competitive teardowns, cold emails, and LinkedIn posts;
              I do better work when I know what you're trying to move.
            </p>
            <a href="${appUrl}/dashboard" style="display: inline-block; background: #111827; color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 500;">
              Set a goal
            </a>
          </td></tr>
        </table>

        <p style="margin: 16px 0 0; text-align: center; font-size: 12px; color: #9ca3af;">
          This is a one-time message. I won't send another empty-state weekly until you set a goal.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function barColor(pct: number): string {
  if (pct >= 75) return "#16a34a";
  if (pct >= 40) return "#f59e0b";
  return "#3b82f6";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
