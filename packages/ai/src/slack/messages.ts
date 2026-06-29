/** Slack Block Kit message formatters for Beast notifications. */

interface SlackBlock {
  type: string;
  text?: { type: string; text: string; emoji?: boolean };
  fields?: Array<{ type: string; text: string }>;
  elements?: Array<Record<string, unknown>>;
  accessory?: Record<string, unknown>;
  block_id?: string;
}

export interface SlackNotificationPayload {
  text: string;
  blocks: SlackBlock[];
}

interface TaskCompletionData {
  employeeName: string;
  employeeRole: string;
  taskTitle: string;
  taskType: string;
  deliverableId: string;
  appUrl: string;
}

/** "Alex finished your blog post draft - ready for review." */
export function formatTaskCompletion(data: TaskCompletionData): SlackNotificationPayload {
  const text = `${data.employeeName} completed: ${data.taskTitle}`;
  const reviewUrl = `${data.appUrl}/deliverables/${data.deliverableId}`;

  return {
    text,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `:white_check_mark: *${data.employeeName}* finished a task`,
        },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Task:*\n${data.taskTitle}` },
          { type: "mrkdwn", text: `*Type:*\n${formatTaskType(data.taskType)}` },
        ],
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "Review in Beast", emoji: true },
            url: reviewUrl,
            style: "primary",
          },
        ],
      },
    ],
  };
}

interface ReviewRequestData {
  employeeName: string;
  deliverableTitle: string;
  deliverableType: string;
  deliverableId: string;
  version: number;
  appUrl: string;
}

/** "A LinkedIn post is ready for your review." */
export function formatReviewRequest(data: ReviewRequestData): SlackNotificationPayload {
  const text = `${data.employeeName} needs your review: ${data.deliverableTitle}`;
  const reviewUrl = `${data.appUrl}/deliverables/${data.deliverableId}`;
  const versionLabel = data.version > 1 ? ` (v${data.version})` : "";

  return {
    text,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `:eyes: *Review needed* from ${data.employeeName}`,
        },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Deliverable:*\n${data.deliverableTitle}${versionLabel}` },
          { type: "mrkdwn", text: `*Type:*\n${formatDeliverableType(data.deliverableType)}` },
        ],
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "Review Now", emoji: true },
            url: reviewUrl,
            style: "primary",
          },
        ],
      },
    ],
  };
}

interface CheckInData {
  employeeName: string;
  employeeRole: string;
  checkInType: "daily_summary" | "weekly_report";
  headline: string;
  summary: string;
  completedTasks: Array<{ title: string; status: string }>;
  highlights: string[];
  suggestedActions: string[];
  appUrl: string;
}

/** Daily/weekly check-in summary from an AI employee. */
export function formatCheckInSummary(data: CheckInData): SlackNotificationPayload {
  const period = data.checkInType === "daily_summary" ? "Daily" : "Weekly";
  const text = `${period} check-in from ${data.employeeName}: ${data.headline}`;

  const blocks: SlackBlock[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `:clipboard: *${period} Check-in - ${data.employeeName}* (${data.employeeRole})`,
      },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: data.summary },
    },
  ];

  // Completed tasks
  if (data.completedTasks.length > 0) {
    const taskLines = data.completedTasks
      .slice(0, 5)
      .map((t) => `• ${t.title}`)
      .join("\n");
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Completed (${data.completedTasks.length}):*\n${taskLines}`,
      },
    });
  }

  // Highlights
  if (data.highlights.length > 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Highlights:*\n${data.highlights.map((h) => `• ${h}`).join("\n")}`,
      },
    });
  }

  // Suggested actions
  if (data.suggestedActions.length > 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Suggested actions:*\n${data.suggestedActions.map((a) => `• ${a}`).join("\n")}`,
      },
    });
  }

  blocks.push({
    type: "context",
    elements: [
      { type: "mrkdwn", text: `<${data.appUrl}|Open Beast>` },
    ],
  });

  return { text, blocks };
}

interface BlockedData {
  employeeName: string;
  employeeRole: string;
  taskTitle: string;
  reason: string;
  appUrl: string;
}

/** "Jordan needs brand guidelines to continue." */
export function formatBlockedNotification(data: BlockedData): SlackNotificationPayload {
  const text = `${data.employeeName} is blocked: ${data.reason}`;

  return {
    text,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `:warning: *${data.employeeName}* is blocked`,
        },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Task:*\n${data.taskTitle}` },
          { type: "mrkdwn", text: `*Reason:*\n${data.reason}` },
        ],
      },
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: `<${data.appUrl}|Open Beast to help>` },
        ],
      },
    ],
  };
}

function formatTaskType(taskType: string): string {
  return taskType
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDeliverableType(deliverableType: string): string {
  const labels: Record<string, string> = {
    blog: "Blog Post",
    social_twitter: "Twitter Post",
    social_linkedin: "LinkedIn Post",
    email: "Email",
    faq: "FAQ Article",
    custom: "Custom",
  };
  return labels[deliverableType] ?? deliverableType;
}
