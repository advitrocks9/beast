"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import { Plus, X } from "lucide-react";
import { Monogram } from "@/components/monogram";
import { StateChip } from "@/components/state-chip";
import { ProvenanceTag } from "@/components/provenance-tag";

export interface RecurringEmployee {
  id: string;
  name: string;
  roleType: string;
}

export interface RecurringTaskRow {
  id: string;
  title: string;
  taskType: string;
  employeeName: string;
  employeeRoleType: string;
  frequency: string;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  hour: number;
  minute: number;
  nextOccurrenceAt: string | null;
  instanceCount: number;
  lastInstanceStatus: string | null;
  lastInstanceAt: string | null;
  live: boolean;
}

interface RecurringShellProps {
  rows: RecurringTaskRow[];
  employees: RecurringEmployee[];
  timezone: string;
}

const DAY_OF_WEEK_LABEL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

const FIELD_CLASS =
  "mt-1.5 block w-full rounded-[2px] border border-hairline bg-bg px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-muted focus-visible:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

export function RecurringShell({ rows, employees, timezone }: RecurringShellProps) {
  const [creating, setCreating] = useState(false);

  return (
    <div className="mx-auto max-w-4xl">
      <header className="rule-b flex flex-wrap items-end justify-between gap-3 pb-4">
        <div>
          <h1 className="display text-3xl">Recurring</h1>
          <p className="spec mt-1.5 text-ink-muted">
            {rows.length} standing schedule{rows.length === 1 ? "" : "s"} · times in {timezone}
          </p>
        </div>
        {!creating && (
          <button onClick={() => setCreating(true)} className={`btn-ink ${FOCUS}`}>
            <Plus size={16} strokeWidth={1.5} aria-hidden />
            New schedule
          </button>
        )}
      </header>

      {creating && (
        <CreateScheduleForm employees={employees} onClose={() => setCreating(false)} />
      )}

      {rows.length === 0 ? (
        <div className="mt-5 max-w-lg">
          <h2 className="text-[15px] font-semibold">No standing schedules.</h2>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-secondary">
            Brief the job once and set its cadence. The orchestrator dispatches an instance each
            cycle, and every instance stamps through the docket like any other job.
          </p>
        </div>
      ) : (
        <ul className="mt-2">
          {rows.map((r) => (
            <ScheduleRow key={r.id} row={r} timezone={timezone} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ScheduleRow({ row, timezone }: { row: RecurringTaskRow; timezone: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const cancel = useMutation(trpc.tasks.cancelRecurring.mutationOptions());

  const time = `${pad(row.hour)}:${pad(row.minute)}`;
  const cadence =
    row.frequency === "daily"
      ? `daily ${time}`
      : row.frequency === "weekly" && row.dayOfWeek !== null
        ? `weekly ${DAY_OF_WEEK_LABEL[row.dayOfWeek] ?? "?"} ${time}`
        : row.frequency === "monthly" && row.dayOfMonth !== null
          ? `monthly day ${row.dayOfMonth} ${time}`
          : row.frequency;

  const nextLabel = row.nextOccurrenceAt
    ? new Date(row.nextOccurrenceAt).toLocaleString("en-US", {
        timeZone: timezone,
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  return (
    <li className="hairline-b last:border-b-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-3">
        <Monogram name={row.employeeName} roleType={row.employeeRoleType} size="sm" />
        <div className="min-w-0 flex-1 basis-48">
          <p className="flex items-center gap-2">
            <span className="truncate text-[13.5px] leading-tight font-medium">{row.title}</span>
            {row.live && <ProvenanceTag kind="live" />}
          </p>
          <p className="spec mt-0.5 text-ink-muted uppercase">
            {row.employeeName} · {cadence}
          </p>
        </div>
        <span className="spec shrink-0 text-ink-secondary">
          {nextLabel ? `next ${nextLabel}` : "no next run"}
        </span>
        {row.instanceCount === 0 ? (
          <span className="spec-label shrink-0">no runs yet</span>
        ) : (
          <span className="flex shrink-0 items-center gap-2">
            {row.lastInstanceStatus && <StateChip status={row.lastInstanceStatus} />}
            <Link
              href={`/dashboard/tasks?parent=${row.id}`}
              className={`spec text-ink-secondary underline-offset-2 transition-colors hover:text-ink hover:underline ${FOCUS}`}
            >
              {row.instanceCount} run{row.instanceCount === 1 ? "" : "s"}
            </Link>
          </span>
        )}
        <button
          onClick={() => {
            if (
              confirm(`Cancel the schedule "${row.title}"? In-flight instances are not affected.`)
            ) {
              cancel.mutate({ taskId: row.id }, { onSuccess: () => router.refresh() });
            }
          }}
          disabled={cancel.isPending}
          aria-label={`Cancel schedule ${row.title}`}
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-[2px] border border-transparent text-ink-muted transition-colors hover:border-hairline hover:text-state-failed disabled:opacity-50 ${FOCUS}`}
        >
          <X size={16} strokeWidth={1.5} aria-hidden />
        </button>
      </div>
    </li>
  );
}

function CreateScheduleForm({
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
  const [dayOfWeek, setDayOfWeek] = useState<number>(2);
  const [dayOfMonth, setDayOfMonth] = useState<number>(1);
  const [hour, setHour] = useState<number>(9);
  const [minute, setMinute] = useState<number>(0);

  const canSave =
    employeeId.length > 0 && title.trim().length >= 3 && instructions.trim().length >= 5;

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
    <div className="panel mt-5 space-y-4 p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[15px] font-semibold">New schedule</h2>
        <span className="spec-label">brief once, runs on cadence</span>
      </div>

      <div>
        <label htmlFor="schedule-employee" className="spec-label block">
          Employee
        </label>
        <select
          id="schedule-employee"
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
          className={FIELD_CLASS}
        >
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="schedule-title" className="spec-label block">
          Job title
        </label>
        <input
          id="schedule-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Weekly product update tweet"
          className={FIELD_CLASS}
        />
      </div>

      <div>
        <label htmlFor="schedule-instructions" className="spec-label block">
          Instructions
        </label>
        <textarea
          id="schedule-instructions"
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          rows={3}
          placeholder="What runs every time? Include voice, length, and any links."
          className={`${FIELD_CLASS} resize-none`}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="schedule-frequency" className="spec-label block">
            Frequency
          </label>
          <select
            id="schedule-frequency"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as typeof frequency)}
            className={FIELD_CLASS}
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>
        {frequency === "weekly" && (
          <div>
            <label htmlFor="schedule-dow" className="spec-label block">
              Day of week
            </label>
            <select
              id="schedule-dow"
              value={dayOfWeek}
              onChange={(e) => setDayOfWeek(Number(e.target.value))}
              className={FIELD_CLASS}
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
            <label htmlFor="schedule-dom" className="spec-label block">
              Day of month
            </label>
            <select
              id="schedule-dom"
              value={dayOfMonth}
              onChange={(e) => setDayOfMonth(Number(e.target.value))}
              className={FIELD_CLASS}
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
          <label htmlFor="schedule-hour" className="spec-label block">
            Hour (0-23)
          </label>
          <input
            id="schedule-hour"
            type="number"
            min={0}
            max={23}
            value={hour}
            onChange={(e) => setHour(clampInt(e.target.value, 0, 23))}
            className={FIELD_CLASS}
          />
        </div>
        <div>
          <label htmlFor="schedule-minute" className="spec-label block">
            Minute (0-59)
          </label>
          <input
            id="schedule-minute"
            type="number"
            min={0}
            max={59}
            value={minute}
            onChange={(e) => setMinute(clampInt(e.target.value, 0, 59))}
            className={FIELD_CLASS}
          />
        </div>
      </div>

      <div className="hairline-t flex justify-end gap-2 pt-3">
        <button
          onClick={onClose}
          disabled={create.isPending}
          className={`btn-ghost disabled:opacity-50 ${FOCUS}`}
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!canSave || create.isPending}
          className={`btn-ink disabled:opacity-40 ${FOCUS}`}
        >
          {create.isPending ? "Saving..." : "Save schedule"}
        </button>
      </div>

      {create.error && <p className="spec text-state-failed">{create.error.message}</p>}
    </div>
  );
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function clampInt(value: string, min: number, max: number): number {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return min;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}
