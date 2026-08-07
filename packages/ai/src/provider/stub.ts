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

function lastUserText(messages: ProviderMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role !== "user") continue;
    const text = m.content
      .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (text) return text;
  }
  return "";
}

const spell = (category: string): string => category.replace(/_/g, " ");

// Interview turns parse the router's system prompt for state ("Still needed",
// "Goals captured so far") so keyless onboarding progresses deterministically.
async function* onboardingInterview(opts: StreamOptions): AsyncGenerator<ProviderEvent> {
  const unfilled = matchLine(opts.system, /^Still needed: (.+)$/m)
    .split(",")
    .map((c) => c.trim())
    .filter((c) => c.length > 0 && c !== "all done!");
  const goalsCaptured = Number(matchLine(opts.system, /^Goals captured so far: (\d+)/m));
  const category = unfilled[0];

  if (countToolResults(opts.messages) > 0) {
    const next = unfilled[1] ?? unfilled[0];
    const reply = next
      ? `Noted that down. Next up: tell me about your ${spell(next)}.`
      : "Noted that down. That covers everything I need, continue whenever you're ready.";
    yield* paced(reply);
    yield { type: "message_end", stopReason: "end_turn" };
    return;
  }

  const shared = lastUserText(opts.messages) || "No details shared yet.";
  let calledTool = false;
  if (category) {
    yield {
      type: "tool_call",
      id: `stub-onboarding-${category}`,
      name: "save_knowledge",
      input: {
        items: [
          {
            category,
            title: `${spell(category)} (interview)`,
            content: shared,
            ai_summary: `Founder shared ${spell(category)} context during onboarding.`,
          },
        ],
      },
    };
    calledTool = true;
  }
  if (goalsCaptured === 0 && opts.tools.some((t) => t.name === "save_goal")) {
    yield {
      type: "tool_call",
      id: "stub-onboarding-goal",
      name: "save_goal",
      input: {
        title: "Get one reviewed deliverable shipped this month",
        target_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        target_metric: "1 accepted deliverable",
      },
    };
    calledTool = true;
  }
  if (calledTool) {
    yield { type: "message_end", stopReason: "tool_use" };
    return;
  }
  yield* paced("Everything is captured. Continue to the next step whenever you're ready.");
  yield { type: "message_end", stopReason: "end_turn" };
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
      // save_knowledge only exists on the onboarding interview surface.
      if (opts.tools.some((t) => t.name === "save_knowledge")) {
        yield* onboardingInterview(opts);
        return;
      }
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
