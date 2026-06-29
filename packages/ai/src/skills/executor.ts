import type Anthropic from "@anthropic-ai/sdk";
import type { AgentConfig, AgentEventHandler, RetrievedMemory } from "../types";
import type { Skill, SkillResult, SkillStepResult } from "./types";
import { getClient, getModelId, getMaxTokens } from "../models";
import { ToolRegistry } from "../tools";

interface ExecuteSkillOptions {
  skill: Skill;
  input: Record<string, unknown>;
  config: AgentConfig;
  memories?: {
    episodic: RetrievedMemory[];
    semantic: RetrievedMemory[];
    procedural: RetrievedMemory[];
  };
  onEvent?: AgentEventHandler;
}

/**
 * Execute a skill by running its steps in dependency order,
 * then self-reviewing the output.
 */
export async function executeSkill(opts: ExecuteSkillOptions): Promise<SkillResult> {
  const { skill, input, config, memories, onEvent } = opts;
  const client = getClient();
  const startTime = Date.now();

  const stepResults = new Map<string, SkillStepResult>();
  const tools = new ToolRegistry();
  tools.registerAll(skill.tools);

  let totalInput = 0;
  let totalOutput = 0;

  // Build context from memories and calibration
  const systemParts = [config.persona];

  if (memories?.procedural.length) {
    systemParts.push(
      "## Style Rules\n" + memories.procedural.map((m) => `- ${m.content}`).join("\n"),
    );
  }

  if (skill.calibration.exampleOutputs.length > 0) {
    systemParts.push(
      "## Example Outputs (match this quality and style)\n" +
      skill.calibration.exampleOutputs.slice(0, 2).join("\n---\n"),
    );
  }

  if (skill.calibration.avoidPatterns.length > 0) {
    systemParts.push(
      "## Patterns to Avoid\n" + skill.calibration.avoidPatterns.map((p) => `- ${p}`).join("\n"),
    );
  }

  const systemPrompt = systemParts.join("\n\n");

  // Execute steps in topological order
  const executed = new Set<string>();
  const pending = [...skill.steps];

  while (pending.length > 0) {
    const ready = pending.filter(
      (s) => !s.dependsOn?.length || s.dependsOn.every((d) => executed.has(d)),
    );

    if (ready.length === 0) {
      throw new Error("Circular dependency in skill steps");
    }

    for (const step of ready) {
      // Build step prompt with prior step outputs
      let stepPrompt = step.prompt;
      stepPrompt = stepPrompt.replace("{{input}}", JSON.stringify(input));

      for (const [id, result] of stepResults) {
        stepPrompt = stepPrompt.replace(`{{${id}}}`, result.output);
      }

      if (memories?.semantic.length) {
        stepPrompt += "\n\n## Company Context\n" + memories.semantic.map((m) => m.content).join("\n\n");
      }

      if (memories?.episodic.length) {
        stepPrompt += "\n\n## Past Experience\n" + memories.episodic.map((m) => `- ${m.content}`).join("\n");
      }

      const model = step.model ?? config.model ?? "sonnet";

      onEvent?.({ type: "text_delta", text: `\n[Step: ${step.name}]\n` });

      const messages: Anthropic.MessageParam[] = [
        { role: "user", content: stepPrompt },
      ];

      // Run agent loop for this step (single turn, no tools for now)
      const response = await client.messages.create({
        model: getModelId(model),
        max_tokens: getMaxTokens(model),
        system: systemPrompt,
        messages,
        tools: tools.getAnthropicTools().length > 0 ? tools.getAnthropicTools() : undefined,
      });

      totalInput += response.usage.input_tokens;
      totalOutput += response.usage.output_tokens;

      const output = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");

      stepResults.set(step.id, {
        stepId: step.id,
        output,
        tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
      });

      executed.add(step.id);
      onEvent?.({ type: "text_delta", text: output });
    }

    // Remove executed steps from pending
    for (const step of ready) {
      const idx = pending.indexOf(step);
      if (idx !== -1) pending.splice(idx, 1);
    }
  }

  // Get the final step's output
  const lastStep = skill.steps[skill.steps.length - 1]!;
  let finalOutput = stepResults.get(lastStep.id)?.output ?? "";

  // Self-review loop
  let revisionCount = 0;
  let selfReviewPassed = false;

  for (let rev = 0; rev < skill.maxSelfRevisions; rev++) {
    // Run quality checks first
    const failedChecks = skill.qualityChecks
      .map((qc) => qc.check(finalOutput))
      .filter((r) => !r.passed);

    if (failedChecks.length === 0) {
      selfReviewPassed = true;
      break;
    }

    // Constitutional AI self-review
    const reviewPrompt = [
      skill.selfReviewPrompt,
      `\n## Current Output\n${finalOutput}`,
      `\n## Issues Found\n${failedChecks.map((f) => `- ${f.feedback}`).join("\n")}`,
      `\nPlease revise the output to fix these issues. Return only the revised output.`,
    ].join("\n");

    const reviewResponse = await client.messages.create({
      model: getModelId("sonnet"),
      max_tokens: getMaxTokens("sonnet"),
      system: systemPrompt,
      messages: [{ role: "user", content: reviewPrompt }],
    });

    totalInput += reviewResponse.usage.input_tokens;
    totalOutput += reviewResponse.usage.output_tokens;

    finalOutput = reviewResponse.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    revisionCount++;
    onEvent?.({ type: "text_delta", text: `\n[Self-revision ${revisionCount}]\n` });
  }

  // If we exhausted revisions without passing, still check once more
  if (!selfReviewPassed) {
    const finalChecks = skill.qualityChecks.map((qc) => qc.check(finalOutput));
    selfReviewPassed = finalChecks.every((r) => r.passed);
  }

  // Parse output through schema
  let parsedOutput: unknown;
  try {
    parsedOutput = skill.outputSchema.parse(JSON.parse(finalOutput));
  } catch {
    parsedOutput = finalOutput;
  }

  return {
    output: parsedOutput as SkillResult["output"],
    rawOutput: finalOutput,
    steps: Array.from(stepResults.values()),
    selfReviewPassed,
    revisionCount,
    totalTokens: { input: totalInput, output: totalOutput },
    durationMs: Date.now() - startTime,
  };
}
