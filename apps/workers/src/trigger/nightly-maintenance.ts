import { schedules, tasks as triggerTasks } from "@trigger.dev/sdk";
import { db, aiEmployees, companies } from "@beast/db";
import { eq } from "drizzle-orm";
import { evaluateAutonomy } from "@beast/ai";

/**
 * Nightly maintenance - runs at 11 PM per company timezone.
 * Fans out to existing consolidate-memories + detect-drift tasks per employee.
 *
 * Schedules are created per company via schedules.create() during onboarding.
 */
export const nightlyMaintenance = schedules.task({
  id: "nightly-maintenance",
  run: async (payload) => {
    const companyId = payload.externalId;
    if (!companyId) {
      return { skipped: true, reason: "No externalId (companyId)" };
    }

    const employees = await db.query.aiEmployees.findMany({
      where: eq(aiEmployees.companyId, companyId),
      columns: { id: true },
    });

    const runs: Array<{ employeeId: string; consolidateRunId: string; driftRunId: string }> = [];

    for (const emp of employees) {
      try {
        const [consolidateHandle, driftHandle] = await Promise.all([
          triggerTasks.trigger("consolidate-memories", {
            agentId: emp.id,
            tenantId: companyId,
          }),
          triggerTasks.trigger("detect-drift", {
            agentId: emp.id,
            tenantId: companyId,
          }),
        ]);

        runs.push({
          employeeId: emp.id,
          consolidateRunId: consolidateHandle.id,
          driftRunId: driftHandle.id,
        });
      } catch (err) {
        console.error(`[NightlyMaintenance] Failed for employee ${emp.id}:`, err);
      }
    }

    // Evaluate autonomy evolution (suggest escalations based on approval streaks)
    let autonomySuggestions: Array<{ employeeName: string; action: string }> = [];
    try {
      const company = await db.query.companies.findFirst({
        where: eq(companies.id, companyId),
        columns: { timezone: true },
      });

      const suggestions = await evaluateAutonomy({
        companyId,
        timezone: company?.timezone ?? "UTC",
        now: new Date(),
      });

      autonomySuggestions = suggestions.map((s) => ({
        employeeName: s.employeeName,
        action: s.action,
      }));
    } catch (err) {
      console.error("[NightlyMaintenance] Autonomy evaluation failed:", err);
    }

    return { employeesProcessed: employees.length, runs, autonomySuggestions };
  },
});
