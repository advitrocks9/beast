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

// Generates the multi-step plan, stores it on the parent task, and flips it to plan_review.
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

    // Status guard: only flip to "plan_review" if the parent is still in
    // the pre-execution lifecycle. A founder cancellation, an
    // execute-task auto-advance, or a chain failure between trigger and
    // run() must not be regressed by a Trigger.dev retry of
    // a transient LLM error. Same shape as the cancel guard.
    await db.update(tasks).set({
      plan,
      status: "plan_review",
    }).where(and(
      eq(tasks.id, payload.parentTaskId),
      inArray(tasks.status, ["queued", "planning", "plan_review"]),
    ));

    return plan;
  },
});
