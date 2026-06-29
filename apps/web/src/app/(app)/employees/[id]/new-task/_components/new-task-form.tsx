"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import { GlassCard } from "@beast/ui";

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

    // Simple client-side parsing - extract title from first sentence, rest is objective
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
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-(--font-display) text-2xl font-bold tracking-tight">
          New task for {employeeName}
        </h1>
        <p className="mt-1 text-sm text-text-secondary">{employeeRole}</p>
      </div>

      {step === "input" ? (
        <GlassCard hoverable={false} className="p-6 space-y-5">
          {/* Task type */}
          <div>
            <label className="block text-sm font-medium mb-1.5">Task type</label>
            <div className="flex flex-wrap gap-2">
              {taskTypes.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setTaskType(t.value)}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-all ${
                    taskType === t.value
                      ? "bg-black text-white"
                      : "bg-[oklch(0.97_0.005_260/0.5)] text-text-secondary hover:text-text"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Pinned goal */}
          {activeGoals.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-1.5">
                Pinned goal
              </label>
              <select
                value={pinnedGoalId}
                onChange={(e) => setPinnedGoalId(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              >
                {activeGoals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                    {g.targetDate ? ` (by ${formatTargetDate(g.targetDate)})` : ""}
                  </option>
                ))}
                <option value="none">No goal (one-off task)</option>
              </select>
              <p className="mt-1 text-xs text-text-muted">
                {employeeName} will open the deliverable with one sentence
                connecting it back to this goal.
              </p>
            </div>
          )}

          {/* Natural language input */}
          <div>
            <label className="block text-sm font-medium mb-1.5">
              What should {employeeName} do?
            </label>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={getPlaceholder(taskType, employeeName)}
              rows={4}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent resize-none"
            />
          </div>

          <button
            onClick={handleParseInput}
            disabled={!input.trim()}
            className="w-full rounded-xl bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-30"
          >
            Preview brief →
          </button>
        </GlassCard>
      ) : (
        <GlassCard hoverable={false} className="p-6 space-y-5">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
            Brief preview
          </h2>

          {/* Editable title */}
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>

          {/* Editable objective */}
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Objective</label>
            <textarea
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent resize-none"
            />
          </div>

          {/* Optional fields */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">
                Target audience <span className="text-text-muted">(optional)</span>
              </label>
              <input
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                placeholder="e.g. Engineering leads at B2B SaaS"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">
                Tone <span className="text-text-muted">(optional)</span>
              </label>
              <input
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                placeholder="e.g. Technical but approachable"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
            </div>
          </div>

          <div className="rounded-lg bg-accent-light/50 p-3">
            <p className="text-xs text-text-secondary">
              <strong>{employeeName}</strong> will receive this brief and start working.
              You'll be notified when the deliverable is ready for review.
            </p>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3">
            <button
              onClick={() => setStep("input")}
              className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-text-secondary hover:bg-gray-50"
            >
              ← Edit
            </button>
            <button
              onClick={handleSubmit}
              disabled={!title.trim() || createTask.isPending}
              className="flex-1 rounded-xl bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {createTask.isPending ? "Creating..." : `Assign to ${employeeName}`}
            </button>
          </div>
        </GlassCard>
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
