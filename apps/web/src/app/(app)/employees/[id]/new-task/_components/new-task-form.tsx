"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useTRPC } from "@/trpc/client";
import { DEMO_MODE } from "@/lib/demo";
import { ProvenanceTag } from "@/components/provenance-tag";

interface TaskType {
  value: string;
  label: string;
}

interface ActiveGoal {
  id: string;
  title: string;
  targetDate: string | null;
}

interface NewTaskFormProps {
  employeeId: string;
  employeeName: string;
  employeeRole: string;
  companyName: string;
  taskTypes: TaskType[];
  activeGoals: ActiveGoal[];
}

const FIELD =
  "mt-1.5 block w-full rounded-[2px] border border-hairline bg-bg px-3.5 py-2.5 text-sm text-ink outline-none placeholder:text-ink-muted focus-visible:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";
const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

export function NewTaskForm({
  employeeId,
  employeeName,
  employeeRole,
  companyName,
  taskTypes,
  activeGoals,
}: NewTaskFormProps) {
  const [input, setInput] = useState("");
  const [taskType, setTaskType] = useState(taskTypes[0]?.value ?? "custom");
  const [title, setTitle] = useState("");
  const [objective, setObjective] = useState("");
  const [audience, setAudience] = useState("");
  const [tone, setTone] = useState("");
  const [pinnedGoalId, setPinnedGoalId] = useState<string | "none">(
    activeGoals[0]?.id ?? "none",
  );
  const [step, setStep] = useState<"input" | "preview">("input");
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();
  const trpc = useTRPC();
  const createTask = useMutation(trpc.tasks.create.mutationOptions());

  function handleParseInput() {
    if (!input.trim()) return;

    const lines = input.trim().split("\n");
    const firstLine = lines[0] ?? input.trim();
    const rest = lines.slice(1).join("\n").trim();

    setTitle(firstLine.length > 80 ? firstLine.slice(0, 80) + "..." : firstLine);
    setObjective(rest || firstLine);
    setStep("preview");
  }

  async function handleSubmit() {
    setError(null);
    try {
      const goalId = pinnedGoalId === "none" ? undefined : pinnedGoalId;
      await createTask.mutateAsync({
        aiEmployeeId: employeeId,
        title,
        taskType,
        goalId,
        brief: {
          objective,
          audience: audience || undefined,
          tone: tone || undefined,
          companyName,
        },
      });
      router.push(`/employees/${employeeId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create task");
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <header className="rule-b pb-3">
        <Link
          href={`/employees/${employeeId}`}
          className={`spec-label inline-flex items-center gap-1.5 transition-colors hover:text-ink ${FOCUS_RING}`}
        >
          <ArrowLeft size={12} strokeWidth={1.5} />
          {employeeName}&apos;s desk
        </Link>
        <h1 className="display mt-2 text-3xl">Brief a job</h1>
        <p className="spec mt-1.5 text-ink-muted">
          {employeeName} · {employeeRole}
        </p>
      </header>

      {DEMO_MODE && (
        <p className="mt-4 flex flex-wrap items-center gap-2">
          <ProvenanceTag kind="stub" />
          <span className="spec-label">
            Briefing from this form is product-mode only — use Commission a job on the office board
          </span>
        </p>
      )}

      {step === "input" ? (
        <div className="mt-5 space-y-5">
          <fieldset>
            <legend className="spec-label">Job type</legend>
            <div role="radiogroup" aria-label="Job type" className="mt-1.5 flex flex-wrap gap-1.5">
              {taskTypes.map((t) => {
                const selected = taskType === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setTaskType(t.value)}
                    className={`rounded-[2px] border px-3 py-1.5 text-[13px] font-medium transition-colors duration-150 ${FOCUS_RING} ${
                      selected
                        ? "border-ink bg-ink text-white"
                        : "border-hairline text-ink-secondary hover:border-ink hover:text-ink"
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {activeGoals.length > 0 && (
            <div>
              <label htmlFor="pinned-goal" className="spec-label block">
                Pinned goal
              </label>
              <select
                id="pinned-goal"
                value={pinnedGoalId}
                onChange={(e) => setPinnedGoalId(e.target.value)}
                className={FIELD}
              >
                {activeGoals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                    {g.targetDate ? ` (by ${formatTargetDate(g.targetDate)})` : ""}
                  </option>
                ))}
                <option value="none">No goal (one-off job)</option>
              </select>
              <p className="mt-1.5 text-[12px] text-ink-muted">
                {employeeName} opens the deliverable with one sentence connecting it back to this
                goal.
              </p>
            </div>
          )}

          <div>
            <label htmlFor="brief" className="spec-label block">
              The brief
            </label>
            <textarea
              id="brief"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={getPlaceholder(taskType, employeeName)}
              rows={4}
              className={`${FIELD} resize-none`}
            />
          </div>

          <button
            type="button"
            onClick={handleParseInput}
            disabled={!input.trim()}
            className={`btn-ink w-full disabled:opacity-50 ${FOCUS_RING}`}
          >
            Preview the brief
          </button>
        </div>
      ) : (
        <div className="mt-5 space-y-5">
          <div className="rule-t pt-2.5">
            <h2 className="text-[15px] font-semibold">Brief preview</h2>
          </div>

          <div>
            <label htmlFor="task-title" className="spec-label block">
              Title
            </label>
            <input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={FIELD}
            />
          </div>

          <div>
            <label htmlFor="task-objective" className="spec-label block">
              Objective
            </label>
            <textarea
              id="task-objective"
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              rows={3}
              className={`${FIELD} resize-none`}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="task-audience" className="spec-label block">
                Audience (optional)
              </label>
              <input
                id="task-audience"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                placeholder="e.g. Engineering leads at B2B SaaS"
                className={FIELD}
              />
            </div>
            <div>
              <label htmlFor="task-tone" className="spec-label block">
                Tone (optional)
              </label>
              <input
                id="task-tone"
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                placeholder="e.g. Technical but approachable"
                className={FIELD}
              />
            </div>
          </div>

          <p className="border border-hairline bg-panel px-3.5 py-2.5 text-[12.5px] text-ink-secondary">
            {employeeName} takes this brief and starts work; the deliverable lands in your review
            tray.
          </p>

          {error && (
            <p className="border border-state-failed/40 bg-state-failed/5 px-3.5 py-2.5 text-[13px] text-state-failed">
              {error}
            </p>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep("input")}
              className={`btn-ghost flex-1 ${FOCUS_RING}`}
            >
              Back to draft
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={DEMO_MODE || !title.trim() || createTask.isPending}
              className={`btn-identity flex-1 disabled:opacity-50 ${FOCUS_RING}`}
            >
              {createTask.isPending ? "Assigning..." : `Assign to ${employeeName}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatTargetDate(raw: string): string {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getPlaceholder(taskType: string, name: string): string {
  const placeholders: Record<string, string> = {
    "write-blog-post": `Write a blog post about API testing best practices for engineering teams.\nInclude real examples and data where possible.`,
    "create-social-post": `Create a LinkedIn post announcing our new CI/CD integration feature.\nKeep it punchy and professional.`,
    "draft-newsletter": `Draft this week's newsletter.\nFocus on our latest product updates and a customer success story.`,
    "draft-outreach-email": `Write a cold outreach email to Sarah Chen, VP Engineering at TechCorp.\nThey recently raised a Series B and are scaling their engineering team.`,
    "create-email-sequence": `Create a 3-email sequence for engineering leads who signed up for a free trial but haven't activated yet.`,
    "draft-ticket-response": `Respond to a customer asking why their API tests are failing after upgrading to v2.\nTheir error log shows a timeout on the webhook endpoint.`,
    "write-faq-article": `Write a FAQ article about how to set up webhook testing in our platform.`,
    "custom": `Tell ${name} what you need...`,
  };
  return placeholders[taskType] ?? placeholders.custom!;
}
