"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import { GlassCard } from "@beast/ui";
import { Plus, Repeat, Trash2 } from "lucide-react";
import { roleColor } from "@/lib/colors";

export interface RecurringEmployee {
  id: string;
  name: string;
  roleType: string;
}

export interface RecurringTaskRow {
  id: string;
  title: string;
  taskType: string;
  employeeId: string;
  employeeName: string;
  employeeRoleType: string;
  frequency: string;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  hour: number;
  minute: number;
  nextOccurrenceAt: string | null;
  instanceCount: number;
  lastSpawnedAt: string | null;
}

interface RecurringShellProps {
  rows: RecurringTaskRow[];
  employees: RecurringEmployee[];
  timezone: string;
}

const DAY_OF_WEEK_LABEL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const FREQUENCY_LABEL: Record<string, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

export function RecurringShell({ rows, employees, timezone }: RecurringShellProps) {
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="font-(--font-display) text-2xl font-bold tracking-tight">
            Recurring tasks
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Schedules that run on their own. The orchestrator picks each up
            on its next-occurrence time and dispatches a fresh task to the
            assigned employee.
          </p>
          <p className="mt-1 text-[11px] text-text-muted">
            Times rendered in {timezone}.
          </p>
        </div>
        {!creating && (
          <button
            onClick={() => setCreating(true)}
            className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            <span className="inline-flex items-center gap-2">
              <Plus size={14} /> New recurring task
            </span>
          </button>
        )}
      </header>

      {creating && (
        <CreateRecurringForm
          employees={employees}
          onClose={() => setCreating(false)}
        />
      )}

      {rows.length === 0 ? (
        <GlassCard hoverable={false} className="p-8 text-center">
          <Repeat size={28} className="mx-auto mb-3 text-text-muted" />
          <p className="text-sm text-text-secondary">
            No recurring tasks yet. Create one and your AI employees will
            run it on schedule without you asking each time.
          </p>
        </GlassCard>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <RecurringRow key={r.id} row={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function RecurringRow({ row }: { row: RecurringTaskRow }) {
  const trpc = useTRPC();
  const router = useRouter();
  const cancel = useMutation(trpc.tasks.cancelRecurring.mutationOptions());
  const roleHex = roleColor(row.employeeRoleType);

  const cadenceLabel = (() => {
    const time = `${pad(row.hour)}:${pad(row.minute)}`;
    if (row.frequency === "daily") return `Daily at ${time}`;
    if (row.frequency === "weekly" && row.dayOfWeek !== null) {
      return `Weekly on ${DAY_OF_WEEK_LABEL[row.dayOfWeek] ?? "?"} at ${time}`;
    }
    if (row.frequency === "monthly" && row.dayOfMonth !== null) {
      return `Monthly on day ${row.dayOfMonth} at ${time}`;
    }
    return FREQUENCY_LABEL[row.frequency] ?? row.frequency;
  })();

  const nextLabel = row.nextOccurrenceAt
    ? new Date(row.nextOccurrenceAt).toLocaleString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  const lastLabel = row.lastSpawnedAt
    ? relativeShort(row.lastSpawnedAt)
    : null;

  const runsCopy = row.instanceCount === 0
    ? "No runs yet"
    : `${row.instanceCount} ${row.instanceCount === 1 ? "run" : "runs"}${lastLabel ? `, last ${lastLabel}` : ""}`;

  return (
    <GlassCard hoverable={false} className="p-4">
      <div className="flex items-start gap-3">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white text-xs font-semibold"
          style={{ backgroundColor: roleHex }}
        >
          {row.employeeName[0]}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{row.title}</p>
          <p className="text-xs text-text-secondary">
            {row.employeeName} &middot; {row.taskType.replace(/_/g, " ")} &middot; {cadenceLabel}
          </p>
          <p className="mt-1 text-[11px] text-text-muted">
            {row.instanceCount === 0 ? (
              runsCopy
            ) : (
              <Link
                href={`/dashboard/tasks?parent=${row.id}`}
                className="underline-offset-2 hover:text-foreground hover:underline"
              >
                {runsCopy}
              </Link>
            )}
            {nextLabel && (
              <>
                {" · "}
                Next run: {nextLabel}
              </>
            )}
          </p>
        </div>
        <button
          onClick={() => {
            if (
              confirm(
                `Cancel the schedule "${row.title}"? Existing in-flight runs are not affected.`,
              )
            ) {
              cancel.mutate(
                { taskId: row.id },
                { onSuccess: () => router.refresh() },
              );
            }
          }}
          disabled={cancel.isPending}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted hover:bg-[oklch(0.97_0.05_25)] hover:text-error shrink-0"
          aria-label={`Cancel ${row.title}`}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </GlassCard>
  );
}

function CreateRecurringForm({
  employees,
  onClose,
}: {
  employees: RecurringEmployee[];
  onClose: () => void;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const create = useMutation(trpc.tasks.createRecurring.mutationOptions());

  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [frequency, setFrequency] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [dayOfWeek, setDayOfWeek] = useState<number>(2); // Tue
  const [dayOfMonth, setDayOfMonth] = useState<number>(1);
  const [hour, setHour] = useState<number>(9);
  const [minute, setMinute] = useState<number>(0);

  const canSave =
    employeeId.length > 0 &&
    title.trim().length >= 3 &&
    instructions.trim().length >= 5;

  function handleSave() {
    if (!canSave) return;
    create.mutate(
      {
        aiEmployeeId: employeeId,
        title: title.trim(),
        taskType: "ad_hoc",
        brief: { objective: title.trim(), instructions: instructions.trim() },
        recurrence: {
          frequency,
          dayOfWeek: frequency === "weekly" ? dayOfWeek : undefined,
          dayOfMonth: frequency === "monthly" ? dayOfMonth : undefined,
          hour,
          minute,
        },
      },
      {
        onSuccess: () => {
          onClose();
          router.refresh();
        },
      },
    );
  }

  return (
    <GlassCard hoverable={false} className="p-5 space-y-3">
      <h2 className="text-sm font-semibold">New recurring task</h2>

      <div>
        <label className="block text-xs font-medium text-text-secondary mb-1.5">
          Employee
        </label>
        <select
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
        >
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-text-secondary mb-1.5">
          Task title
        </label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Weekly product update tweet"
          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-text-secondary mb-1.5">
          Instructions
        </label>
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          rows={3}
          placeholder="What should the agent do every time? Include voice, length, and any links."
          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand resize-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5">
            Frequency
          </label>
          <select
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as typeof frequency)}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>
        {frequency === "weekly" && (
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">
              Day of week
            </label>
            <select
              value={dayOfWeek}
              onChange={(e) => setDayOfWeek(Number(e.target.value))}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            >
              {DAY_OF_WEEK_LABEL.map((label, i) => (
                <option key={label} value={i}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        )}
        {frequency === "monthly" && (
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">
              Day of month
            </label>
            <select
              value={dayOfMonth}
              onChange={(e) => setDayOfMonth(Number(e.target.value))}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            >
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5">
            Hour (0-23)
          </label>
          <input
            type="number"
            min={0}
            max={23}
            value={hour}
            onChange={(e) => setHour(clampInt(e.target.value, 0, 23))}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5">
            Minute (0-59)
          </label>
          <input
            type="number"
            min={0}
            max={59}
            value={minute}
            onChange={(e) => setMinute(clampInt(e.target.value, 0, 59))}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button
          onClick={onClose}
          disabled={create.isPending}
          className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-text-secondary hover:bg-gray-50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!canSave || create.isPending}
          className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {create.isPending ? "Saving..." : "Save schedule"}
        </button>
      </div>

      {create.error && (
        <p className="text-xs text-error">{create.error.message}</p>
      )}
    </GlassCard>
  );
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function relativeShort(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

function clampInt(value: string, min: number, max: number): number {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return min;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}
