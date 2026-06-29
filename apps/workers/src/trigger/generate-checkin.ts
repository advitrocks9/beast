import { task, tasks as triggerTasks } from "@trigger.dev/sdk";
import { generateCheckIn } from "@beast/ai";
import { db, aiEmployees } from "@beast/db";
import { eq } from "drizzle-orm";

interface GenerateCheckInPayload {
  employeeId: string;
  companyId: string;
  checkInType: "daily_summary" | "weekly_report";
}

/**
 * Background task for LLM-powered check-in generation.
 * Dispatched by the orchestrator tick when a check-in is due.
 */
export const generateCheckInJob = task({
  id: "generate-checkin",
  retry: { maxAttempts: 2 },
  run: async (payload: GenerateCheckInPayload) => {
    const content = await generateCheckIn(payload);

    // Dispatch Slack notification with check-in content
    const employee = await db.query.aiEmployees.findFirst({
      where: eq(aiEmployees.id, payload.employeeId),
      columns: { name: true, roleTitle: true },
    });

    if (employee) {
      triggerTasks.trigger("slack-notify", {
        type: "check_in",
        companyId: payload.companyId,
        employeeName: employee.name,
        employeeRole: employee.roleTitle,
        checkInType: payload.checkInType,
        headline: content.headline,
        summary: content.summary,
        completedTasks: content.completedTasks,
        highlights: content.highlights,
        suggestedActions: content.suggestedActions,
      }).catch((err) => {
        console.error("[Slack] Failed to dispatch check-in notification:", err);
      });
    }

    return { employeeId: payload.employeeId, checkInType: payload.checkInType, content };
  },
});
