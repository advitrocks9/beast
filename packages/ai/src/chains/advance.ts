import { db, tasks, deliverables, aiEmployees, companies, activityLog } from "@beast/db";
import { eq, and } from "drizzle-orm";
import type { TaskPlan, PlanStep, AdvanceResult } from "./types";

type StepStatus = "pending" | "working" | "review" | "approved" | "failed";

/** Payload that callers use to trigger the execute-task job. */
export interface SpawnPayload {
  agentId: string;
  tenantId: string;
  agentName: string;
  roleType: string;
  companyName: string;
  task: {
    taskId: string;
    title: string;
    objective: string;
    taskType: string;
    brief: Record<string, unknown>;
  };
}

/**
 * Core chain orchestrator. Stateless - called from multiple sites:
 * 1. tasks.approvePlan (initial kickoff)
 * 2. execute-task worker (after non-gated child completes)
 * 3. deliverables.approve (after gated child is approved)
 *
 * Determines the next action for a multi-step chain.
 * Does NOT call Trigger.dev directly - returns a SpawnPayload
 * that the caller uses to trigger the execute-task job.
 */
export async function advanceChain(
  parentTaskId: string,
  triggerTask: (payload: SpawnPayload) => Promise<{ id: string }>,
): Promise<AdvanceResult> {
  const parent = await db.query.tasks.findFirst({
    where: eq(tasks.id, parentTaskId),
  });

  if (!parent?.plan || !parent.planApproved) {
    return { action: "no_plan" };
  }

  const plan = parent.plan as unknown as TaskPlan;
  if (!plan.steps?.length) {
    return { action: "no_plan" };
  }

  const children = await db.query.tasks.findMany({
    where: eq(tasks.parentTaskId, parentTaskId),
  });

  const stepStatuses = new Map<string, { status: StepStatus; taskId: string }>();
  for (const child of children) {
    const stepId = (child.brief as Record<string, unknown>)?._planStepId as string | undefined;
    if (!stepId) continue;

    let status: StepStatus;
    if (child.status === "cancelled") {
      status = "failed";
    } else if (child.status === "approved" || child.status === "published") {
      status = "approved";
    } else if (child.status === "review" || child.status === "revision") {
      status = "review";
    } else {
      status = "working";
    }

    stepStatuses.set(stepId, { status, taskId: child.id });
  }

  for (const step of plan.steps) {
    const info = stepStatuses.get(step.stepId);
    if (info?.status === "failed") {
      // Atomic: cancel parent + emit activity row so the founder sees
      // why their multi-step campaign stopped instead of finding it
      // silently flipped to "cancelled" on /dashboard/tasks.
      await db.transaction(async (tx) => {
        await tx.update(tasks).set({
          status: "cancelled",
          completedAt: new Date(),
        }).where(eq(tasks.id, parentTaskId));

        await tx.insert(activityLog).values({
          companyId: parent.companyId,
          aiEmployeeId: parent.aiEmployeeId,
          actionType: "chain_failed",
          actionDetail: {
            parentTaskId,
            taskTitle: parent.title,
            failedStepId: step.stepId,
            failedStepName: step.name,
          },
        });
      });
      return { action: "chain_failed", stepId: step.stepId, error: `Step "${step.name}" failed` };
    }
  }

  for (const step of plan.steps) {
    const info = stepStatuses.get(step.stepId);
    if (info?.status === "working") {
      return { action: "already_running", stepId: step.stepId };
    }
  }

  for (const step of plan.steps) {
    const info = stepStatuses.get(step.stepId);
    if (info?.status === "review" && step.humanGate) {
      return { action: "waiting_gate", stepId: step.stepId };
    }
  }

  let nextStep: PlanStep | undefined;
  for (const step of plan.steps) {
    if (stepStatuses.has(step.stepId)) continue;

    const depsReady = step.dependsOn.every((depId) => {
      const dep = stepStatuses.get(depId);
      return dep?.status === "approved";
    });

    if (depsReady) {
      nextStep = step;
      break;
    }
  }

  if (!nextStep) {
    const allApproved = plan.steps.every((step) => {
      const info = stepStatuses.get(step.stepId);
      return info?.status === "approved";
    });

    if (allApproved) {
      await db.update(tasks).set({
        status: "approved",
        completedAt: new Date(),
      }).where(eq(tasks.id, parentTaskId));
      return { action: "chain_complete" };
    }

    return { action: "waiting_gate" };
  }

  const siblingContext = await gatherSiblingContext(nextStep.dependsOn, plan);

  const employeeId = nextStep.assignedEmployeeId
    ?? await resolveDefaultEmployee(parent.companyId, nextStep.assignedRole);

  if (!employeeId) {
    return { action: "chain_failed", error: `No ${nextStep.assignedRole} employee found` };
  }

  const employee = await db.query.aiEmployees.findFirst({
    where: eq(aiEmployees.id, employeeId),
    columns: { name: true, roleType: true },
  });

  const company = await db.query.companies.findFirst({
    where: eq(companies.id, parent.companyId),
    columns: { name: true },
  });

  if (!employee || !company) {
    return { action: "chain_failed", error: "Employee or company not found" };
  }

  const enrichedBrief = {
    ...nextStep.brief,
    _planStepId: nextStep.stepId,
    _siblingDeliverables: siblingContext,
  };

  const [child] = await db.insert(tasks).values({
    companyId: parent.companyId,
    aiEmployeeId: employeeId,
    parentTaskId,
    title: nextStep.name,
    brief: enrichedBrief,
    taskType: nextStep.taskType,
    origin: "chain_step",
  }).returning();

  if (!child) {
    return { action: "chain_failed", error: "Failed to create child task" };
  }

  const updatedPlan: TaskPlan = {
    ...plan,
    stepTaskMap: { ...plan.stepTaskMap, [nextStep.stepId]: child.id },
  };
  await db.update(tasks).set({
    plan: updatedPlan as unknown as Record<string, unknown>,
    status: "working",
  }).where(eq(tasks.id, parentTaskId));

  const handle = await triggerTask({
    agentId: employeeId,
    tenantId: parent.companyId,
    agentName: employee.name,
    roleType: employee.roleType,
    companyName: company.name,
    task: {
      taskId: child.id,
      title: nextStep.name,
      objective: (nextStep.brief as Record<string, string>).objective ?? nextStep.name,
      taskType: nextStep.taskType,
      brief: enrichedBrief,
    },
  });

  await db.update(tasks).set({
    triggerRunId: handle.id,
    status: "working",
    startedAt: new Date(),
  }).where(eq(tasks.id, child.id));

  return { action: "spawned_next", stepId: nextStep.stepId, childTaskId: child.id };
}

/** Load deliverables from completed dependency steps for context injection. */
async function gatherSiblingContext(
  depStepIds: string[],
  plan: TaskPlan,
): Promise<Array<{ stepName: string; content: Record<string, unknown> }>> {
  const context: Array<{ stepName: string; content: Record<string, unknown> }> = [];

  for (const depId of depStepIds) {
    const deliverableId = plan.stepDeliverableMap[depId];
    if (!deliverableId) continue;

    const deliverable = await db.query.deliverables.findFirst({
      where: eq(deliverables.id, deliverableId),
      columns: { content: true },
    });

    if (!deliverable) continue;

    const step = plan.steps.find((s) => s.stepId === depId);
    const content = deliverable.content as Record<string, unknown>;

    // Truncate string values to keep within token budget
    const truncated: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(content)) {
      truncated[key] = typeof value === "string" ? value.slice(0, 2000) : value;
    }

    context.push({ stepName: step?.name ?? depId, content: truncated });
  }

  return context;
}

/** Find the default AI employee for a role within a company. */
async function resolveDefaultEmployee(
  companyId: string,
  role: string,
): Promise<string | undefined> {
  const employee = await db.query.aiEmployees.findFirst({
    where: and(
      eq(aiEmployees.companyId, companyId),
      eq(aiEmployees.roleType, role),
    ),
    columns: { id: true },
  });
  return employee?.id;
}
