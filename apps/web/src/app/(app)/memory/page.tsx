import { headers } from "next/headers";
import { eq, and, inArray, isNull, isNotNull, desc, asc } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { DEMO_MODE, demoSessionIdFromHeaders } from "@/lib/demo";
import { demoWhere } from "@/lib/demo-overlay";
import { db } from "@beast/db";
import {
  companies,
  aiEmployees,
  proceduralMemories,
  ruleCandidates,
  episodicMemories,
  semanticMemories,
} from "@beast/db";
import { candidateThreshold } from "@beast/ai";
import { MemoryTabs } from "./_components/memory-tabs";

export const metadata = {
  title: "Memory - Beast",
};

export default async function MemoryPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const demoSid = DEMO_MODE ? demoSessionIdFromHeaders(await headers()) : null;

  const company = await db.query.companies.findFirst({
    where: eq(companies.userId, user!.id),
    columns: { id: true, name: true },
  });

  const scope = demoWhere(demoSid);

  const [employees, rules, deprecatedRules, candidateRows, episodic, semantic] = await Promise.all([
    db.query.aiEmployees.findMany({
      where: eq(aiEmployees.companyId, company!.id),
      columns: { id: true, name: true, roleType: true },
    }),
    db.query.proceduralMemories.findMany({
      where: and(
        eq(proceduralMemories.tenantId, company!.id),
        eq(proceduralMemories.isCurrent, true),
      ),
      columns: {
        id: true,
        agentId: true,
        ruleType: true,
        taskScope: true,
        title: true,
        description: true,
        signalCount: true,
        confidence: true,
        tasksAppliedTo: true,
        createdAt: true,
      },
      orderBy: [asc(proceduralMemories.title)],
    }),
    db.query.proceduralMemories.findMany({
      where: and(
        eq(proceduralMemories.tenantId, company!.id),
        eq(proceduralMemories.isCurrent, false),
        isNotNull(proceduralMemories.deprecatedAt),
      ),
      columns: {
        id: true,
        agentId: true,
        title: true,
        description: true,
        deprecatedAt: true,
        deprecatedReason: true,
      },
      orderBy: [desc(proceduralMemories.deprecatedAt)],
    }),
    db.query.ruleCandidates.findMany({
      where: and(
        eq(ruleCandidates.tenantId, company!.id),
        isNull(ruleCandidates.promotedToId),
        scope.seedOrMine(ruleCandidates.demoSessionId),
      ),
      orderBy: [desc(ruleCandidates.updatedAt)],
    }),
    db.query.episodicMemories.findMany({
      where: eq(episodicMemories.tenantId, company!.id),
      columns: {
        id: true,
        agentId: true,
        episodeType: true,
        summary: true,
        occurredAt: true,
        taskId: true,
        isConsolidated: true,
      },
      orderBy: [desc(episodicMemories.occurredAt)],
      limit: 50,
    }),
    db.query.semanticMemories.findMany({
      where: and(
        eq(semanticMemories.tenantId, company!.id),
        isNull(semanticMemories.supersededBy),
      ),
      columns: {
        id: true,
        agentId: true,
        fact: true,
        context: true,
        category: true,
        confidence: true,
        source: true,
        validFrom: true,
      },
      orderBy: [desc(semanticMemories.validFrom)],
      limit: 50,
    }),
  ]);

  const promotingCandidates = rules.length > 0
    ? await db.query.ruleCandidates.findMany({
        where: inArray(ruleCandidates.promotedToId, rules.map((r) => r.id)),
        columns: { promotedToId: true, distinctReviewCount: true },
      })
    : [];
  const corroborationByRule = new Map(
    promotingCandidates.map((c) => [c.promotedToId, c.distinctReviewCount]),
  );

  // a session clone shadows the seed candidate it was copied from
  const sessionKeys = new Set(
    candidateRows
      .filter((c) => c.demoSessionId !== null)
      .map((c) => `${c.agentId}:${c.title}`),
  );
  const candidates = candidateRows.filter(
    (c) => c.demoSessionId !== null || !sessionKeys.has(`${c.agentId}:${c.title}`),
  );

  return (
    <MemoryTabs
      demoMode={DEMO_MODE}
      employees={employees}
      rules={rules.map((r) => ({
        id: r.id,
        agentId: r.agentId,
        ruleType: r.ruleType,
        taskScope: r.taskScope ?? [],
        title: r.title,
        description: r.description,
        confidence: r.confidence,
        corroborationCount: corroborationByRule.get(r.id) ?? r.signalCount,
        tasksAppliedTo: r.tasksAppliedTo,
        createdAt: r.createdAt.toISOString(),
      }))}
      candidates={candidates.map((c) => ({
        id: c.id,
        agentId: c.agentId,
        title: c.title,
        description: c.description,
        confidence: c.confidence,
        distinctReviewCount: c.distinctReviewCount,
        threshold: candidateThreshold(c.ruleType),
        isSessionRow: c.demoSessionId !== null,
        updatedAt: c.updatedAt.toISOString(),
      }))}
      deprecated={deprecatedRules.map((r) => ({
        id: r.id,
        agentId: r.agentId,
        title: r.title,
        description: r.description,
        deprecatedAt: r.deprecatedAt!.toISOString(),
        deprecatedReason: r.deprecatedReason ?? "Deprecated",
      }))}
      episodes={episodic.map((e) => ({
        id: e.id,
        agentId: e.agentId,
        episodeType: e.episodeType,
        summary: e.summary,
        occurredAt: e.occurredAt.toISOString(),
        taskId: e.taskId,
        isConsolidated: e.isConsolidated,
      }))}
      facts={semantic.map((f) => ({
        id: f.id,
        agentId: f.agentId,
        fact: f.fact,
        context: f.context,
        category: f.category,
        confidence: f.confidence,
        source: f.source,
        validFrom: f.validFrom.toISOString(),
      }))}
    />
  );
}
