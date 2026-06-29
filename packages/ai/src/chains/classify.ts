import { getClient, getModelId } from "../models";
import type { ClassificationResult } from "./types";

/**
 * Quick Haiku call to determine if a task needs multi-step execution.
 * Returns in ~1s. Single-skill tasks (write a post, draft an email) → single-step.
 * Compound objectives (research + write + distribute) → multi-step.
 */
export async function classifyTask(input: {
  objective: string;
  taskType: string;
  brief: Record<string, unknown>;
}): Promise<ClassificationResult> {
  const client = getClient();

  const completion = await client.messages.create({
    model: getModelId("haiku"),
    max_tokens: 256,
    system: `You classify tasks as single-step or multi-step. Return JSON only.

A task is multi-step if it:
- Requires multiple distinct outputs (e.g., blog post AND social posts)
- Involves a research phase followed by a creation phase with different deliverables
- Spans multiple skill types (e.g., research + writing + distribution)
- Explicitly mentions a workflow, campaign, or sequence of actions

A task is single-step if it:
- Produces one deliverable of one type
- Maps cleanly to a single skill (write a blog post, draft an email)
- Even if the skill has internal steps (research → draft → finalize), it's still single-step`,
    messages: [{
      role: "user",
      content: `Task type: ${input.taskType}
Objective: ${input.objective}
Brief: ${JSON.stringify(input.brief).slice(0, 500)}

Return: {"isMultiStep": true/false, "reasoning": "one sentence"}`,
    }],
  });

  const raw = completion.content[0]?.type === "text" ? completion.content[0].text : "{}";
  try {
    const cleaned = raw.replace(/^```json?\s*/i, "").replace(/\s*```$/, "");
    const parsed = JSON.parse(cleaned) as ClassificationResult;
    return {
      isMultiStep: Boolean(parsed.isMultiStep),
      reasoning: parsed.reasoning ?? "",
    };
  } catch {
    // Default to single-step if parsing fails
    return { isMultiStep: false, reasoning: "Classification parse failed; defaulting to single-step" };
  }
}
