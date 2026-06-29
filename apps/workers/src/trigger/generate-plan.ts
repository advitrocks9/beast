import { task } from "@trigger.dev/sdk";
import { generatePlan } from "@beast/ai";
import { db, tasks } from "@beast/db";
import { and, eq, inArray } from "drizzle-orm";
import type { TaskPlan } from "@beast/ai";

interface GeneratePlanPayload {
  parentTaskId: string;
  objective: string;
  brief: Record<string, unknown>;
  companyName: string;
  availableSkills: Array<{ id: string; name: string; employeeType: string }>;
  employeesByRole?: Record<string, { id: string; name: string }>;
}

/**
 * Generates a multi-step execution plan for a parent task.
 * Uses Claude Sonnet to break the objective into sequential steps.
 * Stores the plan on the parent task and sets status to "planned".
 */
export const generatePlanJob = task({
  id: "generate-plan",
  run: async (payload: GeneratePlanPayload) => {
    const plan = await generatePlan({
      objective: payload.objective,
      brief: payload.brief,
      companyName: payload.companyName,
      availableSkills: payload.availableSkills,
      employeesByRole: payload.employeesByRole,
    });

    // Status guard: only flip to "planned" if the parent is still in
    // pending or a prior planned state. A founder cancellation, an
    // execute-task auto-advance, or a chain failure between trigger and
    // run() must not be regressed to "planned" by a Trigger.dev retry of
    // a transient LLM error. Same shape as the cancelled-flip guard from
    //
    await db.update(tasks).set({
      plan: plan as unknown as Record<string, unknown>,
      status: "planned",
    }).where(and(
      eq(tasks.id, payload.parentTaskId),
      inArray(tasks.status, ["pending", "planned"]),
    ));

    return plan;
  },
});
