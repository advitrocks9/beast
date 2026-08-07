import Link from "next/link";
import { headers } from "next/headers";
import { eq, and, inArray, desc, gte, notInArray, isNull } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { DEMO_MODE, demoSessionIdFromHeaders } from "@/lib/demo";
import { demoWhere, withDemoOverlay } from "@/lib/demo-overlay";
import { db } from "@beast/db";
import {
  companies,
  aiEmployees,
  deliverables,
  checkIns,
  proceduralMemories,
  ruleCandidates,
  tasks,
  activityLog,
  collaborationProposals,
} from "@beast/db";
import { LOW_SIGNAL_ACTIVITY_TYPES, formatActivityPhrase } from "@/lib/activity-format";
import { roleColor } from "@/lib/colors";
import { Monogram } from "@/components/monogram";
import { StateChip } from "@/components/state-chip";
import { ProvenanceTag } from "@/components/provenance-tag";
import { DashboardEmptyState } from "./_components/dashboard-empty-state";
import { AutonomySuggestionBanner } from "./_components/autonomy-suggestion-banner";
import { CheckInsInline } from "./_components/check-ins-inline";
import { CollaborationProposals, type ProposalItem } from "./_components/collaboration-proposals";
import { RunBoard, type RunBoardTask } from "./_components/run-board";
import { CommissionDialog } from "./_components/commission-dialog";
import type { StarterRole } from "@beast/shared";

function relativeTime(d: Date): string {
  const m = Math.floor((Date.now() - d.getTime()) / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

const QUEUE_STATUSES = ["queued", "planning", "plan_review"] as const;

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const demoSid = DEMO_MODE ? demoSessionIdFromHeaders(await headers()) : null;

  const company = await db.query.companies.findFirst({
    where: eq(companies.userId, user!.id),
    columns: { id: true, name: true },
  });

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const scope = demoWhere(demoSid);

  const [
    employees,
    runningTasks,
    queueRowsRaw,
    deliverableRowsRaw,
    candidates,
    rules,
    activityRows,
    pendingCheckIns,
    pendingProposalRows,
  ] = await Promise.all([
    db.query.aiEmployees.findMany({ where: eq(aiEmployees.companyId, company!.id) }),
    db.query.tasks.findMany({
      where: and(
        eq(tasks.companyId, company!.id),
        eq(tasks.status, "running"),
        scope.seedOrMine(tasks.demoSessionId),
      ),
      orderBy: [desc(tasks.startedAt)],
      limit: 2,
    }),
    db.query.tasks.findMany({
      where: and(
        eq(tasks.companyId, company!.id),
        inArray(tasks.status, [...QUEUE_STATUSES]),
        scope.seedOrMine(tasks.demoSessionId),
      ),
      orderBy: [desc(tasks.createdAt)],
      limit: 6,
    }),
    db.query.deliverables.findMany({
      where: and(
        eq(deliverables.companyId, company!.id),
        scope.seedOrMine(deliverables.demoSessionId),
      ),
      orderBy: [desc(deliverables.updatedAt)],
      limit: 40,
    }),
    db.query.ruleCandidates.findMany({
      where: and(
        eq(ruleCandidates.tenantId, company!.id),
        isNull(ruleCandidates.promotedToId),
        scope.seedOrMine(ruleCandidates.demoSessionId),
      ),
      orderBy: [desc(ruleCandidates.updatedAt)],
      limit: 3,
    }),
    db.query.proceduralMemories.findMany({
      where: and(
        eq(proceduralMemories.tenantId, company!.id),
        eq(proceduralMemories.isCurrent, true),
      ),
      columns: { id: true, title: true, confidence: true, createdAt: true },
      orderBy: [desc(proceduralMemories.confidence)],
      limit: 4,
    }),
    db.query.activityLog.findMany({
      where: and(
        eq(activityLog.companyId, company!.id),
        scope.seedOrMine(activityLog.demoSessionId),
        notInArray(activityLog.actionType, [...LOW_SIGNAL_ACTIVITY_TYPES]),
      ),
      orderBy: [desc(activityLog.createdAt)],
      limit: 8,
    }),
    db.query.checkIns.findMany({
      where: and(
        eq(checkIns.companyId, company!.id),
        eq(checkIns.acknowledged, false),
      ),
      orderBy: (c, { asc }) => [asc(c.scheduledFor), asc(c.createdAt)],
      limit: 3,
    }),
    db.query.collaborationProposals.findMany({
      where: and(
        eq(collaborationProposals.companyId, company!.id),
        eq(collaborationProposals.status, "pending"),
      ),
      orderBy: (p, { desc: d }) => [d(p.createdAt)],
      limit: 5,
    }),
  ]);

  const employeeById = new Map(employees.map((e) => [e.id, e]));
  const deliverableRows = withDemoOverlay(deliverableRowsRaw, demoSid);
  const reviewRows = deliverableRows.filter((d) => d.status === "in_review").slice(0, 5);
  const reviewCount = deliverableRows.filter((d) => d.status === "in_review").length;
  const shippedThisMonth = deliverableRows.filter(
    (d) => (d.status === "accepted" || d.status === "published") && d.updatedAt >= thirtyDaysAgo,
  ).length;
  const newRulesThisMonth = rules.filter((r) => r.createdAt >= thirtyDaysAgo).length;
  const queueRows = queueRowsRaw.filter((t) => t.status !== "running");

  const board = runningTasks[0] ?? null;
  const boardTask: RunBoardTask | null = board
    ? {
        id: board.id,
        title: board.title,
        status: board.status,
        employeeName: employeeById.get(board.aiEmployeeId)?.name ?? "Employee",
        roleType: employeeById.get(board.aiEmployeeId)?.roleType ?? "marketing",
      }
    : null;

  const proposals: ProposalItem[] = pendingProposalRows.map((p) => ({
    id: p.id,
    fromEmployeeName: employeeById.get(p.fromEmployeeId)?.name ?? "Employee",
    fromEmployeeColor: roleColor(employeeById.get(p.fromEmployeeId)?.roleType),
    toEmployeeName: employeeById.get(p.toEmployeeId)?.name ?? "Employee",
    toEmployeeColor: roleColor(employeeById.get(p.toEmployeeId)?.roleType),
    proposal: p.proposal,
    sourceDeliverableId: p.sourceDeliverableId,
    createdAt: p.createdAt.toISOString(),
  }));

  const starterEmployees = employees
    .filter((e): e is typeof e & { roleType: StarterRole } =>
      e.roleType === "marketing" || e.roleType === "sales" || e.roleType === "support",
    )
    .map((e) => ({ id: e.id, name: e.name, roleType: e.roleType as StarterRole }));

  const isEmpty = deliverableRows.length === 0 && !board && queueRows.length === 0;

  return (
    <div className="mx-auto max-w-6xl">
      <header className="rule-b flex flex-wrap items-end justify-between gap-3 pb-4">
        <div>
          <h1 className="display text-3xl">{company!.name}</h1>
          <p className="spec mt-1.5 text-ink-muted">
            {employees.length} on the roster · {shippedThisMonth} shipped this month ·{" "}
            {newRulesThisMonth} new rule{newRulesThisMonth === 1 ? "" : "s"} · {reviewCount} awaiting
            sign-off
          </p>
        </div>
        <CommissionDialog demoMode={DEMO_MODE} />
      </header>

      <AutonomySuggestionBanner />

      {isEmpty ? (
        <DashboardEmptyState employees={starterEmployees} />
      ) : (
        <div className="mt-5 grid gap-5 lg:grid-cols-[1.6fr_1fr]">
          <div className="min-w-0 space-y-5">
            <RunBoard task={boardTask} />

            <section aria-label="Queue">
              <div className="rule-t flex items-baseline justify-between pt-2.5">
                <h2 className="text-[15px] font-semibold">Queue</h2>
                <Link href="/dashboard/tasks" className="spec-label transition-colors hover:text-ink">
                  All jobs
                </Link>
              </div>
              {queueRows.length === 0 ? (
                <p className="mt-2.5 text-[13px] text-ink-muted">
                  Queue is clear. The orchestrator picks up recurring work on its own.
                </p>
              ) : (
                <ul className="mt-2">
                  {queueRows.map((t) => {
                    const emp = employeeById.get(t.aiEmployeeId);
                    return (
                      <li key={t.id} className="hairline-b last:border-b-0">
                        <Link
                          href={`/dashboard/tasks/${t.id}`}
                          className="flex items-center gap-3 py-2.5 transition-colors hover:bg-panel"
                        >
                          <Monogram name={emp?.name ?? "?"} roleType={emp?.roleType} size="sm" />
                          <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">
                            {t.title}
                          </span>
                          {t.demoSessionId && <ProvenanceTag kind="live" />}
                          <StateChip status={t.status} />
                          <span className="spec w-8 shrink-0 text-right text-ink-muted">
                            {relativeTime(t.createdAt)}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section aria-label="Ledger">
              <div className="rule-t pt-2.5">
                <h2 className="text-[15px] font-semibold">Ledger</h2>
              </div>
              <ol className="mt-2 space-y-1.5">
                {activityRows.map((a) => (
                  <li key={a.id} className="flex items-baseline gap-3">
                    <span className="spec w-8 shrink-0 text-ink-muted">
                      {relativeTime(a.createdAt)}
                    </span>
                    <span className="spec min-w-0 flex-1 truncate text-ink-secondary">
                      {formatActivityPhrase(a.actionType, (a.actionDetail ?? {}) as Record<string, unknown>)}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          </div>

          <div className="min-w-0 space-y-5">
            <section aria-label="Review tray" className="panel-tinted p-4">
              <div className="flex items-baseline justify-between">
                <h2 className="text-[15px] font-semibold">Review tray</h2>
                <span className="spec bg-ink px-1.5 py-0.5 text-[10px] text-white">
                  {reviewCount}
                </span>
              </div>
              {reviewRows.length === 0 ? (
                <p className="mt-2 text-[13px] text-ink-muted">Nothing waiting on you.</p>
              ) : (
                <ul className="mt-2">
                  {reviewRows.map((d) => {
                    const emp = employeeById.get(d.aiEmployeeId);
                    return (
                      <li key={d.id} className="hairline-b last:border-b-0">
                        <Link
                          href={`/review/${d.id}`}
                          className="flex items-center gap-2.5 py-2.5 transition-colors hover:bg-bg"
                        >
                          <Monogram name={emp?.name ?? "?"} roleType={emp?.roleType} size="sm" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] leading-tight font-medium">
                              {d.title}
                            </span>
                            <span className="spec-label">{d.deliverableType}</span>
                          </span>
                          {d.demoSessionId && <ProvenanceTag kind="live" />}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
              <Link
                href="/reviews"
                className="btn-ink mt-3 w-full"
              >
                Open review
              </Link>
            </section>

            <section aria-label="Manual amendments" className="panel p-4">
              <div className="flex items-baseline justify-between">
                <h2 className="text-[15px] font-semibold">Candidate amendments</h2>
                <Link href="/memory" className="spec-label transition-colors hover:text-ink">
                  The manual
                </Link>
              </div>
              {candidates.length === 0 ? (
                <p className="mt-2 text-[13px] text-ink-muted">
                  Edit a deliverable and the diff becomes a candidate rule here.
                </p>
              ) : (
                <ul className="mt-2.5 space-y-3">
                  {candidates.map((c) => (
                    <li key={c.id}>
                      <p className="text-[13px] leading-snug font-medium">{c.title}</p>
                      <p className="spec mt-1 flex items-center gap-2 text-ink-muted">
                        <ConfidenceTallies count={c.distinctReviewCount} />
                        {c.distinctReviewCount} review{c.distinctReviewCount === 1 ? "" : "s"} ·
                        confidence {c.confidence.toFixed(2)}
                        {c.demoSessionId && <ProvenanceTag kind="live" />}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              <div className="hairline-t mt-3 pt-2.5">
                <p className="spec-label">Standing rules</p>
                <ul className="mt-1.5 space-y-1">
                  {rules.map((r) => (
                    <li key={r.id} className="flex items-baseline gap-2 text-[12.5px]">
                      <span className="min-w-0 flex-1 truncate">{r.title}</span>
                      <span className="spec shrink-0 text-ink-muted">
                        {r.confidence.toFixed(2)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <CheckInsInline
              checkIns={pendingCheckIns.map((c) => ({
                id: c.id,
                aiEmployeeId: c.aiEmployeeId,
                scheduledFor: c.scheduledFor?.toISOString() ?? null,
                deliverableTitle: null,
                deliverableType: null,
              }))}
              employees={employees.map((e) => ({ id: e.id, name: e.name, roleType: e.roleType }))}
            />

            {proposals.length > 0 && <CollaborationProposals items={proposals} />}
          </div>
        </div>
      )}
    </div>
  );
}

function ConfidenceTallies({ count }: { count: number }) {
  return (
    <span aria-hidden className="inline-flex items-end gap-[2px]">
      {Array.from({ length: 3 }, (_, i) => (
        <span
          key={i}
          className={`inline-block h-2.5 w-[3px] ${i < count ? "tally-fill bg-identity" : "bg-hairline"}`}
        />
      ))}
    </span>
  );
}
