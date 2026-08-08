import Link from "next/link";
import { eq, asc, desc } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@beast/db";
import { companies, checkIns, aiEmployees } from "@beast/db";
import { Monogram } from "@/components/monogram";
import { StateChip } from "@/components/state-chip";

const RESPONSE_CHIP: Record<string, { label: string; status: string }> = {
  used: { label: "Used it", status: "accepted" },
  not_used: { label: "Did not use it", status: "rejected" },
  edited: { label: "Edited it", status: "revised" },
};

export const metadata = {
  title: "Check-ins - Beast",
};

export default async function CheckInsIndexPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const company = await db.query.companies.findFirst({
    where: eq(companies.userId, user!.id),
    columns: { id: true },
  });

  const [pendingRows, acknowledgedRows, employees] = await Promise.all([
    db.query.checkIns.findMany({
      where: eq(checkIns.companyId, company!.id),
      orderBy: [asc(checkIns.scheduledFor), asc(checkIns.createdAt)],
    }),
    db.query.checkIns.findMany({
      where: eq(checkIns.companyId, company!.id),
      orderBy: [desc(checkIns.createdAt)],
      limit: 50,
    }),
    db.query.aiEmployees.findMany({
      where: eq(aiEmployees.companyId, company!.id),
      columns: { id: true, name: true, roleType: true },
    }),
  ]);

  const employeeById = new Map(employees.map((e) => [e.id, e]));
  const now = new Date();

  const pending = pendingRows.filter((c) => !c.acknowledged);
  const acknowledged = acknowledgedRows.filter((c) => c.acknowledged);

  const overdue = pending.filter((c) => c.scheduledFor && c.scheduledFor < now);
  const upcoming = pending.filter((c) => !c.scheduledFor || c.scheduledFor >= now);

  const totalActive = pending.length;
  const isEmpty = totalActive === 0 && acknowledged.length === 0;

  return (
    <div className="mx-auto max-w-4xl">
      <header className="rule-b pb-4">
        <h1 className="display text-3xl">Check-ins</h1>
        <p className="spec mt-1.5 text-ink-muted">
          {isEmpty
            ? "no memos on file"
            : `${totalActive} open${overdue.length > 0 ? ` · ${overdue.length} overdue` : ""} · ${acknowledged.length} answered`}
        </p>
      </header>

      {isEmpty ? (
        <EmptyState />
      ) : (
        <div className="mt-5 space-y-7">
          {overdue.length > 0 && (
            <Section title="Overdue" note="waiting on your answer">
              {overdue.map((c) => (
                <CheckInMemo key={c.id} checkIn={c} employeeById={employeeById} />
              ))}
            </Section>
          )}
          {upcoming.length > 0 && (
            <Section title="Scheduled" note="follow-ups your roster has queued">
              {upcoming.map((c) => (
                <CheckInMemo key={c.id} checkIn={c} employeeById={employeeById} />
              ))}
            </Section>
          )}
          {acknowledged.length > 0 && (
            <Section title="Answered" note="signals already fed back into memory">
              {acknowledged.map((c) => (
                <CheckInMemo key={c.id} checkIn={c} employeeById={employeeById} />
              ))}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

interface CheckInRow {
  id: string;
  aiEmployeeId: string;
  scheduledFor: Date | null;
  acknowledged: boolean;
  response: string | null;
  content: unknown;
}

interface EmployeeRef {
  id: string;
  name: string;
  roleType: string;
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title}>
      <div className="rule-t flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 pt-2.5">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        <span className="spec-label">{note}</span>
      </div>
      <ul className="mt-1">{children}</ul>
    </section>
  );
}

function CheckInMemo({
  checkIn,
  employeeById,
}: {
  checkIn: CheckInRow;
  employeeById: Map<string, EmployeeRef>;
}) {
  const content = (checkIn.content ?? {}) as Record<string, unknown>;
  const deliverableTitle =
    typeof content.deliverableTitle === "string"
      ? content.deliverableTitle
      : "Untitled deliverable";
  const deliverableType =
    typeof content.deliverableType === "string"
      ? content.deliverableType.replace(/_/g, " ")
      : null;
  const employee = employeeById.get(checkIn.aiEmployeeId);

  const scheduledLabel = checkIn.scheduledFor
    ? formatScheduled(checkIn.scheduledFor)
    : "unscheduled";

  const responseChip = checkIn.response ? RESPONSE_CHIP[checkIn.response] : null;

  return (
    <li className="hairline-b last:border-b-0">
      <Link
        href={`/checkins/${checkIn.id}`}
        className="flex items-start gap-3 py-3 transition-colors hover:bg-panel"
      >
        <Monogram name={employee?.name ?? "?"} roleType={employee?.roleType} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] leading-snug font-semibold">
            Did you end up using {employee?.name ? `${employee.name}'s` : "this"} work?
          </p>
          <p className="spec mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-ink-muted">
            <span className="truncate">{deliverableTitle}</span>
            {deliverableType && (
              <>
                <span aria-hidden>·</span>
                <span>{deliverableType}</span>
              </>
            )}
            <span aria-hidden>·</span>
            <span>{scheduledLabel}</span>
          </p>
        </div>
        <span className="shrink-0 pt-0.5">
          {responseChip && checkIn.acknowledged ? (
            <StateChip status={responseChip.status} label={responseChip.label} />
          ) : (
            <span className="spec-label">open</span>
          )}
        </span>
      </Link>
    </li>
  );
}

function EmptyState() {
  return (
    <div className="panel-tinted mt-5 p-8">
      <h2 className="text-[17px] font-semibold">No memos yet.</h2>
      <p className="mt-2 max-w-md text-[13px] leading-snug text-ink-secondary">
        When you accept a deliverable, the employee schedules a Monday follow-up asking whether you
        actually used it. The answer feeds the same learning loop as a review: approvals without
        follow-through are how memory goes stale.
      </p>
      <Link href="/dashboard" className="btn-ghost mt-4 inline-flex">
        Back to the office
      </Link>
    </div>
  );
}

function formatScheduled(date: Date): string {
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = date.toDateString() === tomorrow.toDateString();

  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  if (isToday) return `today ${time}`;
  if (isTomorrow) return `tomorrow ${time}`;

  const sameYear = date.getFullYear() === now.getFullYear();
  return (
    date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: sameYear ? undefined : "numeric",
    }) + ` ${time}`
  );
}
