import { getClient, getModelId } from "../models";
import type { TaskPlan, PlanStep } from "./types";

interface AvailableSkill {
  id: string;
  name: string;
  employeeType: string;
}

/**
 * Generate a multi-step execution plan from a user's objective.
 * Uses Claude Sonnet to break the objective into sequential steps,
 * each mapped to an available skill.
 *
 * Gate policy: only the final step has humanGate=true by default.
 */
export async function generatePlan(input: {
  objective: string;
  brief: Record<string, unknown>;
  companyName: string;
  availableSkills: AvailableSkill[];
  employeesByRole?: Record<string, { id: string; name: string }>;
}): Promise<TaskPlan> {
  const client = getClient();

  const skillList = input.availableSkills
    .map((s) => `- ${s.id} (${s.employeeType}): ${s.name}`)
    .join("\n");

  const completion = await client.messages.create({
    model: getModelId("sonnet"),
    max_tokens: 2048,
    system: `You are a task planning agent for ${input.companyName}. Break down objectives into sequential steps.

Rules:
- Each step MUST map to one of the available skills (use the skill ID as taskType)
- Steps execute sequentially - each depends on the previous
- Keep step count minimal (2-5 steps, never more)
- Each step's brief should describe what that specific step needs to produce
- Assign each step to the role that matches the skill's employee type
- Return valid JSON matching the schema exactly`,
    messages: [{
      role: "user",
      content: `Objective: ${input.objective}

Context from brief: ${JSON.stringify(input.brief).slice(0, 1000)}

Available skills:
${skillList}

Return a JSON plan:
{
  "steps": [
    {
      "stepId": "step-1",
      "name": "Human-readable step name",
      "taskType": "skill-id-from-list-above",
      "assignedRole": "marketing|sales|support",
      "brief": { "objective": "what this step produces", ...relevant fields },
      "dependsOn": []
    },
    {
      "stepId": "step-2",
      "name": "...",
      "taskType": "...",
      "assignedRole": "...",
      "brief": { "objective": "..." },
      "dependsOn": ["step-1"]
    }
  ]
}`,
    }],
  });

  const raw = completion.content[0]?.type === "text" ? completion.content[0].text : "{}";
  const cleaned = raw.replace(/^```json?\s*/i, "").replace(/\s*```$/, "");
  const parsed = JSON.parse(cleaned) as { steps: PlanStep[] };

  if (!Array.isArray(parsed.steps) || parsed.steps.length === 0) {
    throw new Error("Plan generation returned no steps");
  }

  // Validate and enrich steps
  const validSkillIds = new Set(input.availableSkills.map((s) => s.id));
  const steps: PlanStep[] = parsed.steps.map((step, i) => {
    if (!validSkillIds.has(step.taskType)) {
      // Fallback to "custom" if LLM picks an invalid skill
      step.taskType = "custom";
    }

    // Resolve employee ID from role if available
    const employeeForRole = input.employeesByRole?.[step.assignedRole];

    return {
      stepId: step.stepId || `step-${i + 1}`,
      name: step.name,
      taskType: step.taskType,
      assignedRole: step.assignedRole,
      assignedEmployeeId: employeeForRole?.id,
      brief: step.brief ?? {},
      // Gate policy: only the last step pauses for founder review
      humanGate: i === parsed.steps.length - 1,
      dependsOn: i === 0 ? [] : [parsed.steps[i - 1]!.stepId || `step-${i}`],
    };
  });

  return {
    version: 1,
    objective: input.objective,
    steps,
    stepTaskMap: {},
    stepDeliverableMap: {},
  };
}
