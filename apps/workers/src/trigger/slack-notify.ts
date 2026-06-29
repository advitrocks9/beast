import { task } from "@trigger.dev/sdk";
import { db, connectors } from "@beast/db";
import { eq, and } from "drizzle-orm";
import { decryptToken } from "@beast/shared";
import {
  postSlackMessage,
  formatTaskCompletion,
  formatReviewRequest,
  formatCheckInSummary,
  formatBlockedNotification,
} from "@beast/ai";

interface TaskCompletionPayload {
  type: "task_completion";
  companyId: string;
  employeeName: string;
  employeeRole: string;
  taskTitle: string;
  taskType: string;
  deliverableId: string;
}

interface ReviewRequestPayload {
  type: "review_request";
  companyId: string;
  employeeName: string;
  deliverableTitle: string;
  deliverableType: string;
  deliverableId: string;
  version: number;
}

interface CheckInPayload {
  type: "check_in";
  companyId: string;
  employeeName: string;
  employeeRole: string;
  checkInType: "daily_summary" | "weekly_report";
  headline: string;
  summary: string;
  completedTasks: Array<{ title: string; status: string }>;
  highlights: string[];
  suggestedActions: string[];
}

interface BlockedPayload {
  type: "blocked";
  companyId: string;
  employeeName: string;
  employeeRole: string;
  taskTitle: string;
  reason: string;
}

type SlackNotifyPayload =
  | TaskCompletionPayload
  | ReviewRequestPayload
  | CheckInPayload
  | BlockedPayload;

/**
 * Send a notification to the company's #beast-team Slack channel.
 * Loads the Slack connector, decrypts the token, formats the message, and posts it.
 * Silently no-ops if no Slack connector is connected.
 */
export const slackNotifyJob = task({
  id: "slack-notify",
  retry: { maxAttempts: 3 },
  run: async (payload: SlackNotifyPayload) => {
    // Find the company's Slack connector
    const connector = await db.query.connectors.findFirst({
      where: and(
        eq(connectors.companyId, payload.companyId),
        eq(connectors.platform, "slack"),
        eq(connectors.status, "connected"),
      ),
    });

    if (!connector) {
      return { skipped: true, reason: "No Slack connector" };
    }

    const token = decryptToken(connector.accessTokenEnc);
    const channelId = (connector.metadata as Record<string, unknown>)?.channelId as string;

    if (!channelId) {
      return { skipped: true, reason: "No channel ID in connector metadata" };
    }

    const appUrl = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const message = formatMessage(payload, appUrl);

    const result = await postSlackMessage({
      token,
      channel: channelId,
      text: message.text,
      blocks: message.blocks,
    });

    return {
      sent: true,
      channelId: result.channelId,
      messageTs: result.messageTs,
      type: payload.type,
    };
  },
});

function formatMessage(payload: SlackNotifyPayload, appUrl: string) {
  switch (payload.type) {
    case "task_completion":
      return formatTaskCompletion({
        employeeName: payload.employeeName,
        employeeRole: payload.employeeRole,
        taskTitle: payload.taskTitle,
        taskType: payload.taskType,
        deliverableId: payload.deliverableId,
        appUrl,
      });

    case "review_request":
      return formatReviewRequest({
        employeeName: payload.employeeName,
        deliverableTitle: payload.deliverableTitle,
        deliverableType: payload.deliverableType,
        deliverableId: payload.deliverableId,
        version: payload.version,
        appUrl,
      });

    case "check_in":
      return formatCheckInSummary({
        employeeName: payload.employeeName,
        employeeRole: payload.employeeRole,
        checkInType: payload.checkInType,
        headline: payload.headline,
        summary: payload.summary,
        completedTasks: payload.completedTasks,
        highlights: payload.highlights,
        suggestedActions: payload.suggestedActions,
        appUrl,
      });

    case "blocked":
      return formatBlockedNotification({
        employeeName: payload.employeeName,
        employeeRole: payload.employeeRole,
        taskTitle: payload.taskTitle,
        reason: payload.reason,
        appUrl,
      });
  }
}
