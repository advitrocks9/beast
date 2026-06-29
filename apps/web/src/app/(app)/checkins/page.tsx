import Link from "next/link";
import { eq, asc, desc } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@beast/db";
import { companies, checkIns, aiEmployees } from "@beast/db";
import { GlassCard } from "@beast/ui";

const ROLE_COLORS: Record<string, string> = {
  marketing: "#E87B35",
  sales: "#3B82F6",
  support: "#22C55E",
};

const RESPONSE_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  used: { label: "Used it", color: "#166534", bg: "#dcfce7" },
  not_used: { label: "Did not use it", color: "#991b1b", bg: "#fee2e2" },
  edited: { label: "Edited it", color: "#92400e", bg: "#fef3c7" },
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

  // Drizzle's findMany with no where filter on `acknowledged` still returns
  // both groups. Split here in JS so we keep one transaction-friendly query.
  const all = pendingRows;
  const employeeById = new Map(employees.map((e) => [e.id, e]));
  const now = new Date();

  const pending = all.filter((c) => !c.acknowledged);
  const acknowledged = acknowledgedRows.filter((c) => c.acknowledged);

  const overdue = pending.filter(
    (c) => c.scheduledFor && c.scheduledFor < now,
  );
  const upcoming = pending.filter(
    (c) => !c.scheduledFor || c.scheduledFor >= now,
  );

  const totalActive = pending.length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-(--font-display) text-3xl font-bold tracking-tight">
          Check-ins
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          {totalActive === 0 && acknowledged.length === 0
            ? "No check-ins yet. Approve a deliverable and your AI employee will schedule a Monday-morning follow-up."
            : `${totalActive} active. ${overdue.length > 0 ? `${overdue.length} overdue.` : ""} ${acknowledged.length} answered.`}
        </p>
      </div>

      {totalActive === 0 && acknowledged.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-8">
          {overdue.length > 0 && (
            <Section title="Overdue" tone="overdue">
              {overdue.map((c) => (
                <CheckInRow key={c.id} checkIn={c} employeeById={employeeById} />
              ))}
            </Section>
          )}
          {upcoming.length > 0 && (
            <Section title="Upcoming" tone="upcoming">
              {upcoming.map((c) => (
                <CheckInRow key={c.id} checkIn={c} employeeById={employeeById} />
              ))}
            </Section>
          )}
          {acknowledged.length > 0 && (
            <Section title="History" tone="history">
              {acknowledged.map((c) => (
                <CheckInRow key={c.id} checkIn={c} employeeById={employeeById} />
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
  createdAt: Date;
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
  tone,
  children,
}: {
  title: string;
  tone: "overdue" | "upcoming" | "history";
  children: React.ReactNode;
}) {
  const accentByTone = {
    overdue: "#92400e",
    upcoming: "#3B82F6",
    history: "#9CA3AF",
  };
  return (
    <div>
      <h2
        className="mb-3 text-xs font-semibold uppercase tracking-wider"
        style={{ color: accentByTone[tone] }}
      >
        {title}
      </h2>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function CheckInRow({
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
  const employeeColor = employee
    ? ROLE_COLORS[employee.roleType] ?? "#9CA3AF"
    : "#9CA3AF";

  const scheduledLabel = checkIn.scheduledFor
    ? formatScheduled(checkIn.scheduledFor)
    : "Unscheduled";

  const responseBadge = checkIn.response
    ? RESPONSE_LABEL[checkIn.response] ?? {
        label: checkIn.response,
        color: "#374151",
        bg: "#f3f4f6",
      }
    : null;

  return (
    <Link href={`/checkins/${checkIn.id}`} className="block">
      <GlassCard className="flex items-center gap-4 p-4 transition-transform hover:-translate-y-0.5">
        <div
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: employeeColor }}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{deliverableTitle}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-text-muted">
            {employee && <span>{employee.name}</span>}
            {deliverableType && <span>{deliverableType}</span>}
            <span>{scheduledLabel}</span>
          </div>
        </div>
        {responseBadge ? (
          <span
            className="rounded-full px-2.5 py-0.5 text-xs font-medium"
            style={{
              backgroundColor: responseBadge.bg,
              color: responseBadge.color,
            }}
          >
            {responseBadge.label}
          </span>
        ) : (
          <span
            className="rounded-full px-2.5 py-0.5 text-xs font-medium"
            style={{ backgroundColor: "#fef3c7", color: "#92400e" }}
          >
            Pending
          </span>
        )}
      </GlassCard>
    </Link>
  );
}

function EmptyState() {
  return (
    <GlassCard hoverable={false} className="p-10 text-center">
      <h2 className="font-(--font-display) text-xl font-bold tracking-tight">
        No check-ins yet.
      </h2>
      <p className="mx-auto mt-3 max-w-md text-sm text-text-secondary">
        When you approve a deliverable, your AI employee schedules a
        Monday-morning follow-up to ask if you actually used it. Approvals
        without follow-through are how memory gets stale.
      </p>
      <Link
        href="/dashboard"
        className="mt-6 inline-block rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-black hover:bg-gray-50"
      >
        Go to dashboard
      </Link>
    </GlassCard>
  );
}

function formatScheduled(date: Date): string {
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = date.toDateString() === tomorrow.toDateString();

  const time = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  if (isToday) return `Today, ${time}`;
  if (isTomorrow) return `Tomorrow, ${time}`;

  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  }) + `, ${time}`;
}
