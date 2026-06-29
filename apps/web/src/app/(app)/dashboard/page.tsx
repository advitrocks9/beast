import Link from "next/link";
import { eq, and, isNull, isNotNull, inArray, notInArray, count, asc, gte, or, desc } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { DEMO_MODE } from "@/lib/demo";
import { db } from "@beast/db";
import { companies, aiEmployees, goals, deliverables, checkIns, proceduralMemories, tasks, activityLog, collaborationProposals } from "@beast/db";
import { GlassCard } from "@beast/ui";
import { MemoryReceipt } from "../review/[id]/_components/memory-receipt";
import { DashboardEmptyState } from "./_components/dashboard-empty-state";
import { AutonomySuggestionBanner } from "./_components/autonomy-suggestion-banner";
import { CheckInsInline } from "./_components/check-ins-inline";
import { WeeklyDigest } from "./_components/weekly-digest";
import { ActivityFeed, type ActivityItem } from "./_components/activity-feed";
import { ActivityEmployeeChips } from "./_components/activity-employee-chips";
import { LOW_SIGNAL_ACTIVITY_TYPES } from "@/lib/activity-format";
import { CollaborationProposals, type ProposalItem } from "./_components/collaboration-proposals";
import type { StarterRole } from "@beast/shared";

const MEMORY_PILL_CONFIDENCE_FLOOR = 0.7;
const MEMORY_PILL_MAX = 8;

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

interface DashboardPageProps {
  searchParams: Promise<{ activityEmployee?: string }>;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { activityEmployee: activityEmployeeRaw } = await searchParams;
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const activityEmployeeId = activityEmployeeRaw && UUID_RE.test(activityEmployeeRaw)
    ? activityEmployeeRaw
    : null;

  const company = await db.query.companies.findFirst({
    where: eq(companies.userId, user!.id),
    columns: { id: true, name: true, contextScore: true },
  });

  // Server-side env-var presence check. Mirrors system.integrations
  // (apps/web/src/trpc/routers/system.ts) but inlined here so the banner
  // can render in the same render pass as the rest of the dashboard
  // without an extra tRPC hop. A missing core dep (Anthropic / Gemini)
  // breaks every agent run; missing tool deps degrade output quality.
  const integrationPresent = (key: string): boolean => {
    if (DEMO_MODE) return true;
    const v = process.env[key];
    return typeof v === "string" && v.length > 0;
  };
  const missingCoreIntegrations: Array<{ label: string; envKey: string }> = [];
  if (!integrationPresent("ANTHROPIC_API_KEY"))
    missingCoreIntegrations.push({ label: "Anthropic", envKey: "ANTHROPIC_API_KEY" });
  if (!integrationPresent("GEMINI_API_KEY"))
    missingCoreIntegrations.push({ label: "Gemini embeddings", envKey: "GEMINI_API_KEY" });
  const missingToolIntegrations: Array<{ label: string; envKey: string }> = [];
  if (!integrationPresent("SERPER_API_KEY"))
    missingToolIntegrations.push({ label: "Serper search", envKey: "SERPER_API_KEY" });
  if (!integrationPresent("FIRECRAWL_API_KEY"))
    missingToolIntegrations.push({ label: "Firecrawl", envKey: "FIRECRAWL_API_KEY" });
  if (!integrationPresent("UNSTRUCTURED_API_KEY"))
    missingToolIntegrations.push({ label: "Unstructured", envKey: "UNSTRUCTURED_API_KEY" });

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    employees,
    companyGoals,
    reviewCountResult,
    pendingCheckIns,
    approvedCountRes,
    autoPublishingRows,
    planApprovalRowsRes,
    weeklyShippedRows,
    weeklyRuleRows,
    weeklyRejectedRes,
    recentActivityRows,
    pendingProposalRows,
  ] = await Promise.all([
    db.query.aiEmployees.findMany({
      where: eq(aiEmployees.companyId, company!.id),
    }),
    db.query.goals.findMany({
      where: and(eq(goals.companyId, company!.id), isNull(goals.parentGoalId)),
      orderBy: (g, { desc }) => [desc(g.createdAt)],
      limit: 5,
    }),
    db
      .select({ value: count() })
      .from(deliverables)
      .where(
        and(
          eq(deliverables.companyId, company!.id),
          inArray(deliverables.status, ["draft", "pending_review"]),
        ),
      ),
    db.query.checkIns.findMany({
      where: and(
        eq(checkIns.companyId, company!.id),
        eq(checkIns.acknowledged, false),
      ),
      // Postgres ASC defaults to NULLS LAST so a row with a real
      // scheduledFor sorts before one without; legacy rows (NULL column,
      // value still in JSONB) fall back to createdAt.
      orderBy: (c, { asc }) => [asc(c.scheduledFor), asc(c.createdAt)],
      limit: 5,
    }),
    db
      .select({ value: count() })
      .from(deliverables)
      .where(
        and(
          eq(deliverables.companyId, company!.id),
          eq(deliverables.status, "approved"),
        ),
      ),
    db
      .select({ id: deliverables.id, publishAfter: deliverables.publishAfter })
      .from(deliverables)
      .where(
        and(
          eq(deliverables.companyId, company!.id),
          eq(deliverables.status, "auto_publishing"),
        ),
      )
      .orderBy(asc(deliverables.publishAfter)),
    db
      .select({ value: count() })
      .from(tasks)
      .where(
        and(
          eq(tasks.companyId, company!.id),
          isNotNull(tasks.plan),
          eq(tasks.planApproved, false),
          inArray(tasks.status, ["pending", "in_progress", "planned"]),
        ),
      ),
    db
      .select({
        id: deliverables.id,
        title: deliverables.title,
        deliverableType: deliverables.deliverableType,
        aiEmployeeId: deliverables.aiEmployeeId,
        updatedAt: deliverables.updatedAt,
      })
      .from(deliverables)
      .where(
        and(
          eq(deliverables.companyId, company!.id),
          or(
            eq(deliverables.status, "approved"),
            eq(deliverables.status, "published"),
          ),
          gte(deliverables.updatedAt, sevenDaysAgo),
        ),
      )
      .orderBy(desc(deliverables.updatedAt))
      .limit(10),
    db.query.proceduralMemories.findMany({
      where: and(
        eq(proceduralMemories.tenantId, company!.id),
        eq(proceduralMemories.isCurrent, true),
        gte(proceduralMemories.createdAt, sevenDaysAgo),
      ),
      columns: { id: true, title: true, ruleType: true, createdAt: true },
      orderBy: (pm, { desc }) => [desc(pm.createdAt)],
    }),
    db
      .select({ value: count() })
      .from(deliverables)
      .where(
        and(
          eq(deliverables.companyId, company!.id),
          eq(deliverables.status, "rejected"),
          gte(deliverables.updatedAt, sevenDaysAgo),
        ),
      ),
    db.query.activityLog.findMany({
      where: and(
        eq(activityLog.companyId, company!.id),
        notInArray(activityLog.actionType, [...LOW_SIGNAL_ACTIVITY_TYPES]),
        activityEmployeeId ? eq(activityLog.aiEmployeeId, activityEmployeeId) : undefined,
      ),
      orderBy: [desc(activityLog.createdAt)],
      limit: 10,
    }),
    db.query.collaborationProposals.findMany({
      where: and(
        eq(collaborationProposals.companyId, company!.id),
        eq(collaborationProposals.status, "pending"),
      ),
      orderBy: (p, { desc: d }) => [d(p.createdAt)],
      limit: 10,
    }),
  ]);

  const primaryEmployeeId = employees
    .slice()
    .sort((a, b) => (a.createdAt?.getTime?.() ?? 0) - (b.createdAt?.getTime?.() ?? 0))[0]?.id;
  const primaryEmployeeName = employees.find((e) => e.id === primaryEmployeeId)?.name ?? "Alex";
  const approvedCount = approvedCountRes[0]?.value ?? 0;

  const memoryRules = primaryEmployeeId && approvedCount > 0
    ? await db.query.proceduralMemories.findMany({
        where: and(
          eq(proceduralMemories.agentId, primaryEmployeeId),
          eq(proceduralMemories.tenantId, company!.id),
          eq(proceduralMemories.isCurrent, true),
        ),
        columns: {
          id: true,
          title: true,
          description: true,
          sourceEpisodes: true,
          signalWeight: true,
          createdAt: true,
          tasksAppliedTo: true,
        },
        orderBy: (pm, { desc }) => [desc(pm.signalWeight), desc(pm.tasksAppliedTo)],
      })
    : [];

  const memoryRulesForPill = memoryRules
    .filter((r) => (r.signalWeight ?? 0) >= MEMORY_PILL_CONFIDENCE_FLOOR)
    .slice(0, MEMORY_PILL_MAX)
    .map((r) => ({
      ruleId: r.id,
      summary: r.title,
      evidence: r.description,
      extractedFromDeliverableId: r.sourceEpisodes?.[0] ?? "",
      extractedFromTitle: "",
      extractedAt: r.createdAt.toISOString(),
      confidence: r.signalWeight ?? 1.0,
      tasksAppliedTo: r.tasksAppliedTo ?? 0,
    }));

  const workingCount = employees.filter((e) => e.status === "working").length;
  const reviewCount = reviewCountResult[0]?.value ?? 0;
  const autoPublishCount = autoPublishingRows.length;
  const planApprovalCount = planApprovalRowsRes[0]?.value ?? 0;
  const nextAutoPublishAt = autoPublishingRows[0]?.publishAfter ?? null;
  const blocker = pickBlocker({
    reviewCount,
    autoPublishCount,
    nextAutoPublishAt,
    planApprovalCount,
    workingCount,
  });
  const totalDeliverables = reviewCount + approvedCount;
  const isEmpty = totalDeliverables === 0 && employees.length > 0;
  const starterEmployees = employees
    .filter((e): e is typeof e & { roleType: StarterRole } =>
      e.roleType === "marketing" || e.roleType === "sales" || e.roleType === "support",
    )
    .map((e) => ({ id: e.id, name: e.name, roleType: e.roleType as StarterRole }));
  const employeeNameById = new Map(employees.map((e) => [e.id, e.name]));
  const employeeRoleById = new Map(employees.map((e) => [e.id, e.roleType]));
  const ROLE_HEX: Record<string, string> = {
    marketing: "#E87B35",
    sales: "#3B82F6",
    support: "#22C55E",
  };
  const weeklyShippedItems = weeklyShippedRows.map((r) => ({
    id: r.id,
    title: r.title,
    deliverableType: r.deliverableType,
    employeeName: employeeNameById.get(r.aiEmployeeId) ?? "AI Employee",
  }));
  const proposalItems: ProposalItem[] = pendingProposalRows.map((r) => ({
    id: r.id,
    fromEmployeeName: employeeNameById.get(r.fromEmployeeId) ?? "AI Employee",
    fromEmployeeColor: ROLE_HEX[employeeRoleById.get(r.fromEmployeeId) ?? ""] ?? "#9CA3AF",
    toEmployeeName: employeeNameById.get(r.toEmployeeId) ?? "AI Employee",
    toEmployeeColor: ROLE_HEX[employeeRoleById.get(r.toEmployeeId) ?? ""] ?? "#9CA3AF",
    proposal: r.proposal,
    sourceDeliverableId: r.sourceDeliverableId,
    createdAt: r.createdAt.toISOString(),
  }));

  const activityItems: ActivityItem[] = recentActivityRows.map((r) => ({
    id: r.id,
    actionType: r.actionType,
    actionDetail: (r.actionDetail as Record<string, unknown>) ?? {},
    createdAt: r.createdAt.toISOString(),
    employeeId: r.aiEmployeeId,
    employeeName: r.aiEmployeeId
      ? employeeNameById.get(r.aiEmployeeId) ?? "Beast"
      : "Beast",
    employeeColor: r.aiEmployeeId
      ? ROLE_HEX[employeeRoleById.get(r.aiEmployeeId) ?? ""] ?? "#9CA3AF"
      : "#9CA3AF",
  }));
  const latestRule = weeklyRuleRows[0]
    ? { title: weeklyRuleRows[0].title, ruleType: weeklyRuleRows[0].ruleType }
    : null;

  const inlineCheckIns = pendingCheckIns.map((c) => {
    const content = (c.content as Record<string, unknown> | null) ?? {};
    const fallbackScheduled = typeof content.scheduledFor === "string"
      ? content.scheduledFor
      : null;
    return {
      id: c.id,
      aiEmployeeId: c.aiEmployeeId,
      scheduledFor: c.scheduledFor ? c.scheduledFor.toISOString() : fallbackScheduled,
      deliverableTitle: typeof content.deliverableTitle === "string"
        ? content.deliverableTitle
        : null,
      deliverableType: typeof content.deliverableType === "string"
        ? content.deliverableType
        : null,
    };
  });
  const inlineEmployees = employees.map((e) => ({
    id: e.id,
    name: e.name,
    roleType: e.roleType,
  }));

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <GlassCard hoverable={false} className="p-6">
        <h1 className="font-(--font-display) text-2xl font-bold tracking-tight">
          {getGreeting()}
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          {blocker.href ? (
            <Link href={blocker.href} className="hover:text-text underline-offset-4 hover:underline">
              {blocker.text}
            </Link>
          ) : (
            blocker.text
          )}
        </p>
      </GlassCard>

      {missingCoreIntegrations.length > 0 && (
        <div
          className="rounded-xl border border-[oklch(0.75_0.18_25/0.5)] bg-[oklch(0.97_0.04_25/0.6)] px-4 py-3 text-xs"
          role="alert"
          style={{ color: "#991B1B" }}
        >
          <p className="font-semibold">
            Agents cannot run: {missingCoreIntegrations.map((m) => m.label).join(" and ")} {missingCoreIntegrations.length === 1 ? "is" : "are"} unconfigured.
          </p>
          <p className="mt-1 text-text-secondary">
            Set{" "}
            {missingCoreIntegrations.map((m, i) => (
              <span key={m.envKey}>
                {i > 0 && (i === missingCoreIntegrations.length - 1 ? " and " : ", ")}
                <code className="rounded border border-red-200 bg-white/70 px-1.5 py-0.5 font-mono text-[11px]">
                  {m.envKey}
                </code>
              </span>
            ))}
            , redeploy, then check{" "}
            <Link href="/settings/connectors" className="font-medium underline-offset-2 hover:underline">
              /settings/connectors
            </Link>
            .
          </p>
        </div>
      )}
      {missingCoreIntegrations.length === 0 && missingToolIntegrations.length > 0 && (
        <div
          className="rounded-xl border border-[oklch(0.85_0.12_75/0.5)] bg-[oklch(0.98_0.04_75/0.5)] px-4 py-2.5 text-xs"
          role="status"
          style={{ color: "#92400E" }}
        >
          <p>
            {missingToolIntegrations.length} agent tool{missingToolIntegrations.length === 1 ? "" : "s"} unconfigured ({missingToolIntegrations.map((m) => m.label).join(", ")}). Output quality is reduced.{" "}
            <Link href="/settings/connectors" className="font-medium underline-offset-2 hover:underline">
              Open /settings/connectors
            </Link>
            .
          </p>
        </div>
      )}

      <AutonomySuggestionBanner />

      <MemoryReceipt
        rules={memoryRulesForPill}
        scopeKey={`dashboard:${company!.id}`}
        employeeName={primaryEmployeeName}
        surface="dashboard"
      />

      <WeeklyDigest
        shippedCount={weeklyShippedRows.length}
        shippedItems={weeklyShippedItems}
        pendingReviewCount={reviewCount}
        newRulesCount={weeklyRuleRows.length}
        rejectedCount={weeklyRejectedRes[0]?.value ?? 0}
        latestRule={latestRule}
      />

      {inlineCheckIns.length > 0 && (
        <CheckInsInline checkIns={inlineCheckIns} employees={inlineEmployees} />
      )}

      {proposalItems.length > 0 && (
        <CollaborationProposals items={proposalItems} />
      )}

      {/* Employee grid */}
      <div>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="heading-gradient text-lg font-semibold">Your Team</h2>
          <a
            href="/employees"
            className="text-xs font-medium text-text-secondary hover:text-foreground"
          >
            View all &rarr;
          </a>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {employees.map((emp) => (
            <EmployeeCard
              key={emp.id}
              id={emp.id}
              name={emp.name}
              role={emp.roleTitle}
              status={emp.status ?? "idle"}
              roleColor={emp.roleType}
            />
          ))}

          {/* Hire card */}
          <GlassCard className="flex min-h-[140px] items-center justify-center border-dashed p-6">
            <div className="text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-accent-light text-accent">
                <span className="text-xl">+</span>
              </div>
              <p className="mt-2 text-sm font-medium text-text-secondary">Hire Employee</p>
            </div>
          </GlassCard>
        </div>
      </div>

      {/* Goals */}
      <div>
        <h2 className="heading-gradient text-lg font-semibold mb-3">Company Goals</h2>
        {companyGoals.length > 0 ? (
          <div className="space-y-3">
            {companyGoals.map((goal) => (
              <GoalCard
                key={goal.id}
                title={goal.title}
                targetMetric={goal.targetMetric}
                targetDate={goal.targetDate}
                progressPct={goal.progressPct}
                status={goal.status}
              />
            ))}
          </div>
        ) : (
          <GlassCard hoverable={false} className="p-4">
            <p className="text-sm text-text-muted text-center py-6">
              No goals set yet. Create a company goal to get your team working toward objectives.
            </p>
          </GlassCard>
        )}
      </div>

      {/* Activity / first-project starters when empty */}
      {isEmpty ? (
        <DashboardEmptyState employees={starterEmployees} />
      ) : (
        <div>
          <ActivityEmployeeChips
            employees={employees.map((e) => ({ id: e.id, name: e.name, roleType: e.roleType ?? null }))}
            activeEmployeeId={activityEmployeeId}
          />
          <ActivityFeed
            items={activityItems}
            scopeName={activityEmployeeId
              ? employees.find((e) => e.id === activityEmployeeId)?.name ?? null
              : null}
          />
        </div>
      )}
    </div>
  );
}

function EmployeeCard({
  id,
  name,
  role,
  status,
  roleColor,
}: {
  id: string;
  name: string;
  role: string;
  status: string;
  roleColor: string;
}) {
  const colorMap: Record<string, string> = {
    marketing: "#E87B35",
    sales: "#3B82F6",
    support: "#22C55E",
  };
  const statusMap: Record<string, { color: string; label: string }> = {
    idle: { color: "#9CA3AF", label: "Idle" },
    working: { color: "#3B82F6", label: "Working" },
    waiting_review: { color: "#F59E0B", label: "Needs review" },
  };

  const roleHex = colorMap[roleColor] ?? "#9CA3AF";
  const st = statusMap[status] ?? statusMap.idle!;

  return (
    <a href={`/employees/${id}`}>
      <GlassCard className="p-5">
        <div className="flex items-start gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-full text-white text-sm font-semibold"
            style={{ backgroundColor: roleHex }}
          >
            {name[0]}
          </div>
          <div className="flex-1">
            <div className="font-semibold text-sm">{name}</div>
            <div className="text-xs text-text-secondary">{role}</div>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: st.color }} />
          <span className="text-xs text-text-secondary">{st.label}</span>
        </div>
      </GlassCard>
    </a>
  );
}

function GoalCard({
  title,
  targetMetric,
  targetDate,
  progressPct,
  status,
}: {
  title: string;
  targetMetric: string | null;
  targetDate: string | null;
  progressPct: number;
  status: string;
}) {
  const progressColor = progressPct >= 75 ? "#22C55E" : progressPct >= 40 ? "#F59E0B" : "#3B82F6";
  const statusColors: Record<string, string> = {
    active: "#3B82F6",
    completed: "#22C55E",
    paused: "#9CA3AF",
  };

  return (
    <GlassCard hoverable={false} className="p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium">{title}</p>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-medium"
          style={{
            backgroundColor: (statusColors[status] ?? "#9CA3AF") + "15",
            color: statusColors[status] ?? "#9CA3AF",
          }}
        >
          {status}
        </span>
      </div>

      {/* Progress bar */}
      <div className="mb-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-text-secondary">{targetMetric ?? "Progress"}</span>
          <span className="text-xs font-medium" style={{ color: progressColor }}>
            {progressPct}%
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-[oklch(0.9_0.01_260/0.3)]">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${progressPct}%`, backgroundColor: progressColor }}
          />
        </div>
      </div>

      {targetDate && (
        <p className="text-[10px] text-text-muted">
          Target: {new Date(targetDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </p>
      )}
    </GlassCard>
  );
}

interface BlockerInput {
  reviewCount: number;
  autoPublishCount: number;
  nextAutoPublishAt: Date | null;
  planApprovalCount: number;
  workingCount: number;
}

function pickBlocker(input: BlockerInput): { text: string; href: string | null } {
  if (input.reviewCount > 0) {
    const noun = input.reviewCount === 1 ? "deliverable needs" : "deliverables need";
    return {
      text: `${input.reviewCount} ${noun} your sign-off.`,
      href: "/reviews",
    };
  }
  if (input.autoPublishCount > 0) {
    const noun = input.autoPublishCount === 1 ? "post" : "posts";
    const seconds = input.nextAutoPublishAt
      ? Math.max(0, Math.round((input.nextAutoPublishAt.getTime() - Date.now()) / 1000))
      : 0;
    const window = seconds > 0 ? ` in ${seconds}s` : " any moment";
    return {
      text: `${input.autoPublishCount} ${noun} auto-publishing${window}. Cancel here if needed.`,
      href: "/reviews",
    };
  }
  if (input.planApprovalCount > 0) {
    const noun = input.planApprovalCount === 1 ? "plan" : "plans";
    return {
      text: `${input.planApprovalCount} ${noun} waiting on your approval.`,
      href: "/dashboard/tasks?filter=in_flight",
    };
  }
  if (input.workingCount > 0) {
    const noun = input.workingCount === 1 ? "employee is" : "employees are";
    return {
      text: `${input.workingCount} ${noun} working. Nothing on your desk yet.`,
      href: "/dashboard/tasks?filter=in_flight",
    };
  }
  return {
    text: "Your team is idle. Open a desk and tell someone what to do.",
    href: null,
  };
}
