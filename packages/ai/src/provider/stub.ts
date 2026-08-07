import type {
  CompleteOptions,
  ProviderEvent,
  ProviderMessage,
  RunProvider,
  StreamOptions,
} from "./types";
import { fixtureFor, type FixtureContext } from "./fixtures";

const CHUNK_CHARS = 48;
const CHUNK_DELAY_MS = 24;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function textOf(messages: ProviderMessage[]): string {
  return messages
    .flatMap((m) => m.content)
    .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

function matchLine(source: string, re: RegExp): string {
  return re.exec(source)?.[1]?.trim() ?? "";
}

function parseContext(system: string, messages: ProviderMessage[]): FixtureContext & { taskType: string } {
  const source = `${system}\n${textOf(messages)}`;
  return {
    title: matchLine(source, /^## Task: (.+)$/m) || "the brief",
    objective: matchLine(source, /^\*\*Objective:\*\* (.+)$/m),
    taskType: matchLine(source, /^\*\*Type:\*\* (.+)$/m) || "custom",
  };
}

function countToolResults(messages: ProviderMessage[]): number {
  return messages.flatMap((m) => m.content).filter((b) => b.type === "tool_result").length;
}

async function* paced(text: string): AsyncGenerator<ProviderEvent> {
  for (let i = 0; i < text.length; i += CHUNK_CHARS) {
    yield { type: "text_delta", text: text.slice(i, i + CHUNK_CHARS) };
    await sleep(CHUNK_DELAY_MS);
  }
}

const COMPLETIONS: Record<string, string> = {
  classify: `{"isMultiStep": false, "reasoning": "Maps to a single deliverable, so single-step."}`,
  plan: JSON.stringify({
    steps: [
      {
        stepId: "step-1",
        name: "Research and outline",
        taskType: "custom",
        assignedRole: "marketing",
        brief: { objective: "Research the objective and produce an outline" },
        dependsOn: [],
      },
      {
        stepId: "step-2",
        name: "Draft the deliverable",
        taskType: "custom",
        assignedRole: "marketing",
        brief: { objective: "Write the final deliverable from the outline" },
        dependsOn: ["step-1"],
      },
    ],
  }),
  goal_breakdown: `{"reasoning": "No live model is configured, so the goal stays at company level for now.", "subGoals": []}`,
  signal_relevance: "6",
  collaboration_proposal:
    "This deliverable has proof points the sales outreach can cite directly; a short follow-up sequence referencing it would land while the content is fresh.",
  checkin: JSON.stringify({
    headline: "Steady progress, nothing blocked",
    summary: "Work moved through the queue on schedule and deliverables reached review without intervention.",
    highlights: ["All queued tasks progressed", "No failed or timed-out runs"],
    suggestedActions: ["Review the deliverables waiting in your queue"],
  }),
  pre_execution_checkin: JSON.stringify({
    headline: "Plan ready, starting now",
    approach: "Work the brief step by step, ground claims in company context, and deliver for review.",
    steps: ["Review the brief and acceptance criteria", "Gather relevant context", "Draft the deliverable", "Self-check before handoff"],
    questionsForFounder: [],
    estimatedComplexity: "simple",
  }),
  task_completion_extraction: `{"techniques_used": [], "quality_signals": [], "reusable_patterns": [], "episode_summary": "Task completed and recorded."}`,
  edit_preference_inference: "Prefers concise, direct phrasing over hedged or padded language.",
  rationale_rule_extraction: `{"rule_type": "do", "rule_text": "Keep output aligned with the founder's stated rationale.", "applies_to": "this task type only"}`,
  pattern_consolidation: `{"patterns": []}`,
};

export function createStubProvider(): RunProvider {
  return {
    name: "stub",

    async *stream(opts: StreamOptions): AsyncIterable<ProviderEvent> {
      const ctx = parseContext(opts.system, opts.messages);
      const fixture = fixtureFor(ctx.taskType);
      const available = new Set(opts.tools.map((t) => t.name));
      const toolSteps = fixture.toolSteps.filter((s) => available.has(s.tool));
      const completed = countToolResults(opts.messages);

      const step = toolSteps[completed];
      if (step) {
        yield* paced(step.lead(ctx));
        yield {
          type: "tool_call",
          id: `stub-${ctx.taskType}-${completed + 1}`,
          name: step.tool,
          input: step.input(ctx),
        };
        yield { type: "message_end", stopReason: "tool_use" };
        return;
      }

      for (const section of fixture.sections) {
        yield* paced(section(ctx));
      }
      yield { type: "message_end", stopReason: "end_turn" };
    },

    async complete(opts: CompleteOptions): Promise<string> {
      return COMPLETIONS[opts.purpose ?? ""] ?? "{}";
    },
  };
}
