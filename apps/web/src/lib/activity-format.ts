// Shared activity-feed helpers used by both the dashboard ActivityFeed
// client component and the per-employee /employees/[id] server-rendered
// recent activity card. New actionTypes added in this session
// (deliverable_rejected / task_cancelled / goal_completed / etc.) need
// coverage in both places; centralising avoids the drift.

/**
 * actionTypes that should not appear in any user-facing activity feed:
 * orchestrator_tick is the per-tick heartbeat (288/day pre dedupe),
 * checkin_generated + pre_execution_checkin are double-surfaced by
 * CheckInsInline on the dashboard and are pure system noise on the
 * per-employee desk, auto_publish_failed + auto_publish_skipped are
 * retry-loop transients (the abort row is the meaningful audit entry),
 * daily_digest_sent is a worker idempotency anchor not a milestone.
 */
export const LOW_SIGNAL_ACTIVITY_TYPES: readonly string[] = [
  "orchestrator_tick",
  "checkin_generated",
  "pre_execution_checkin",
  "auto_publish_failed",
  "auto_publish_skipped",
  "daily_digest_sent",
  "weekly_checkin_sent",
];

const AUTONOMY_ACTION_COPY: Record<string, string> = {
  publishSocial: "publishing approved social posts",
  sendEmail: "sending approved email replies",
  reachOut: "running cold outreach",
};

function truncateReason(reason: string, max = 90): string {
  if (reason.length <= max) return reason;
  return `${reason.slice(0, max - 1).trimEnd()}…`;
}

function pickString(detail: Record<string, unknown>, key: string): string | undefined {
  const v = detail[key];
  return typeof v === "string" ? v : undefined;
}

export function formatActivityPhrase(actionType: string, detail: Record<string, unknown>): string {
  const explicit = pickString(detail, "description");
  if (explicit) return explicit;

  const title = pickString(detail, "deliverableTitle") ?? pickString(detail, "title");
  const taskTitle = pickString(detail, "taskTitle");
  const goalTitle = pickString(detail, "goalTitle");
  const platform = pickString(detail, "platform");
  const taskType = pickString(detail, "taskType")?.replace(/_/g, " ");
  const reason = pickString(detail, "reason");
  const rejectionReason = pickString(detail, "rejectionReason");
  const cancellationReason = pickString(detail, "cancellationReason");

  switch (actionType) {
    case "deliverable_published": {
      const where = platform ? ` to ${platform}` : "";
      return title ? `published ${title}${where}.` : `published a deliverable${where}.`;
    }
    case "deliverable_approved": {
      const what = title ?? (taskType ? `their ${taskType}` : "a deliverable");
      return `got approval on ${what}.`;
    }
    case "deliverable_rejected": {
      const what = title ?? (taskType ? `their ${taskType}` : "a deliverable");
      return rejectionReason
        ? `had ${what} rejected: ${truncateReason(rejectionReason)}`
        : `had ${what} rejected.`;
    }
    case "task_cancelled": {
      const what = taskTitle ?? (taskType ? `a ${taskType}` : "a task");
      return cancellationReason
        ? `had ${what} cancelled mid-flight: ${truncateReason(cancellationReason)}`
        : `had ${what} cancelled mid-flight.`;
    }
    case "goal_completed":
      return goalTitle
        ? `hit 100% on the goal "${goalTitle}".`
        : "hit 100% on a goal.";
    case "collaboration_proposal_approved": {
      const proposalText = pickString(detail, "proposalText");
      return proposalText
        ? `had a hand-off approved: ${truncateReason(proposalText)}`
        : "had a collaboration proposal approved.";
    }
    case "collaboration_proposal_rejected": {
      const proposalText = pickString(detail, "proposalText");
      return proposalText
        ? `had a hand-off rejected: ${truncateReason(proposalText)}`
        : "had a collaboration proposal rejected.";
    }
    case "autonomy_suggestion": {
      const message = pickString(detail, "message");
      return message ?? "earned more autonomy on a recent streak.";
    }
    case "autonomy_escalated": {
      const action = pickString(detail, "action");
      const friendly = action ? AUTONOMY_ACTION_COPY[action] ?? action : null;
      return friendly
        ? `is now auto-${friendly} without review.`
        : "moved up an autonomy tier.";
    }
    case "checkin_generated": {
      const headline = pickString(detail, "headline");
      return headline
        ? `left a check-in: ${truncateReason(headline)}`
        : "left a check-in.";
    }
    case "pre_execution_checkin": {
      const headline = pickString(detail, "headline");
      return headline
        ? `shared a plan before starting: ${truncateReason(headline)}`
        : "shared a plan before starting a task.";
    }
    case "checkin_response_applied":
      return "got your response on a check-in.";
    case "auto_publish_queued":
      return title
        ? `queued ${title} for auto-publish.`
        : "queued a deliverable for auto-publish.";
    case "auto_publish_cancelled":
      return title
        ? `cancelled the auto-publish of ${title}.`
        : "cancelled an auto-publish.";
    case "auto_publish_failed":
      return reason
        ? `tried to auto-publish but failed: ${reason}`
        : "tried to auto-publish but failed.";
    case "auto_publish_skipped":
      return reason === "no_connector"
        ? "auto-publish skipped: no connected platform."
        : "auto-publish skipped.";
    case "auto_publish_aborted": {
      if (reason === "connector_expired") {
        const platformLabel = platform
          ? platform.charAt(0).toUpperCase() + platform.slice(1)
          : "the platform";
        return `auto-publish stopped: ${platformLabel} disconnected. Reconnect to retry.`;
      }
      return "auto-publish stopped retrying after 5 failures. Re-queue from /reviews when ready.";
    }
    case "recurring_task_spawned": {
      const readable = taskType ?? "task";
      return `spawned a recurring ${readable}.`;
    }
    case "status_change": {
      const from = pickString(detail, "from");
      const to = pickString(detail, "to") ?? "idle";
      const transition = from ? `${from} -> ${to}` : to;
      return reason ? `status: ${transition} (${reason}).` : `status: ${transition}.`;
    }
    case "employee_hired": {
      const roleTitle = pickString(detail, "roleTitle");
      return roleTitle ? `joined as ${roleTitle}.` : "joined the team.";
    }
    case "rule_rolled_back": {
      const ruleTitle = pickString(detail, "ruleTitle");
      return ruleTitle
        ? `auto-rolled back the rule "${truncateReason(ruleTitle, 60)}" after a drop in approval rate.`
        : "auto-rolled back a rule after a drop in approval rate.";
    }
    case "rule_deprecated": {
      const ruleTitle = pickString(detail, "ruleTitle");
      return ruleTitle
        ? `auto-deprecated the rule "${truncateReason(ruleTitle, 60)}" after a drop in approval rate.`
        : "auto-deprecated a rule after a drop in approval rate.";
    }
    case "connector_expired": {
      const platformLabel = platform
        ? platform.charAt(0).toUpperCase() + platform.slice(1)
        : "A platform";
      return `${platformLabel} disconnected. Reconnect to keep posting.`;
    }
    case "patterns_learned": {
      const count = typeof detail.count === "number" ? detail.count : 0;
      const fromEpisodes = typeof detail.fromEpisodes === "number" ? detail.fromEpisodes : 0;
      if (count === 0) return "consolidated overnight without new patterns.";
      const noun = count === 1 ? "pattern" : "patterns";
      const episodeNote = fromEpisodes > 0 ? ` from ${fromEpisodes} recent tasks` : "";
      return `learned ${count} new ${noun}${episodeNote}.`;
    }
    case "chain_failed": {
      const failedStepName = pickString(detail, "failedStepName");
      const what = taskTitle ? `"${truncateReason(taskTitle, 60)}"` : "a multi-step task";
      const where = failedStepName ? ` at step "${truncateReason(failedStepName, 60)}"` : "";
      return `had ${what} stop${where}. The chain was cancelled.`;
    }
    default:
      return actionType.replace(/_/g, " ") + ".";
  }
}

export function pickActivityLink(actionType: string, detail: Record<string, unknown>): string | null {
  const deliverableId = pickString(detail, "deliverableId");
  if (deliverableId) return `/review/${deliverableId}`;
  const taskId = pickString(detail, "taskId");
  if (taskId) return `/dashboard/tasks/${taskId}`;
  const resultingTaskId = pickString(detail, "resultingTaskId");
  if (resultingTaskId) return `/dashboard/tasks/${resultingTaskId}`;
  const sourceDeliverableId = pickString(detail, "sourceDeliverableId");
  if (sourceDeliverableId) return `/review/${sourceDeliverableId}`;
  // recurring spawn writes instanceId for the new task it created.
  const instanceId = pickString(detail, "instanceId");
  if (instanceId && actionType === "recurring_task_spawned") {
    return `/dashboard/tasks/${instanceId}`;
  }
  if (actionType === "goal_completed") return "/goals";
  if (actionType === "rule_rolled_back" || actionType === "rule_deprecated") {
    return "/settings/rules";
  }
  if (actionType === "connector_expired") return "/settings/connectors";
  if (actionType === "patterns_learned") return "/settings/rules";
  if (actionType === "chain_failed") {
    const parentTaskId = pickString(detail, "parentTaskId");
    return parentTaskId ? `/dashboard/tasks/${parentTaskId}` : "/dashboard/tasks";
  }
  if (actionType === "employee_hired") {
    const employeeId = pickString(detail, "aiEmployeeId");
    return employeeId ? `/employees/${employeeId}` : "/employees";
  }
  // Connector-expired auto-publish aborts route to the connectors page
  // so the founder lands one click from "reconnect this platform" rather
  // than on /reviews where the deliverable was already moved back to
  // approved status.
  if (actionType === "auto_publish_aborted" && pickString(detail, "reason") === "connector_expired") {
    return "/settings/connectors";
  }
  if (actionType.startsWith("auto_publish")) return "/reviews";
  return null;
}
