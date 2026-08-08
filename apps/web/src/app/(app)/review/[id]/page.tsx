import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { eq, and, inArray } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { DEMO_MODE, demoSessionIdFromHeaders } from "@/lib/demo";
import { demoWhere } from "@/lib/demo-overlay";
import { db } from "@beast/db";
import { companies, deliverables, aiEmployees, tasks, proceduralMemories } from "@beast/db";
import { ReviewShell } from "./_components/review-shell";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ReviewPage({ params }: PageProps) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const company = await db.query.companies.findFirst({
    where: eq(companies.userId, user!.id),
    columns: { id: true },
  });

  const demoSid = DEMO_MODE ? demoSessionIdFromHeaders(await headers()) : null;
  const deliverable = await db.query.deliverables.findFirst({
    where: and(
      eq(deliverables.id, id),
      eq(deliverables.companyId, company!.id),
      demoWhere(demoSid).seedOrMine(deliverables.demoSessionId),
    ),
  });

  if (!deliverable) {
    notFound();
  }

  const content = deliverable.content as Record<string, unknown>;
  const appliedRuleIds = Array.isArray(content.appliedRules)
    ? (content.appliedRules as Array<{ ruleId?: string }>)
        .flatMap((r) => (typeof r.ruleId === "string" ? [r.ruleId] : []))
    : [];

  const [employee, task, ruleRows] = await Promise.all([
    db.query.aiEmployees.findFirst({
      where: eq(aiEmployees.id, deliverable.aiEmployeeId),
      columns: { id: true, name: true, roleType: true },
    }),
    deliverable.taskId
      ? db.query.tasks.findFirst({
          where: eq(tasks.id, deliverable.taskId),
          columns: { title: true },
        })
      : null,
    appliedRuleIds.length > 0
      ? db.query.proceduralMemories.findMany({
          where: inArray(proceduralMemories.id, appliedRuleIds),
          columns: { id: true, title: true },
        })
      : [],
  ]);

  // Seed manual titles carry their number as an "R-00N " prefix.
  const ruleNumbers: Record<string, string> = {};
  for (const r of ruleRows) {
    const match = /^(R-\d+)\s/.exec(r.title);
    if (match) ruleNumbers[r.id] = match[1]!;
  }

  return (
    <ReviewShell
      deliverable={{
        id: deliverable.id,
        title: deliverable.title,
        deliverableType: deliverable.deliverableType,
        content,
        status: deliverable.status,
        version: deliverable.version ?? 1,
        aiEmployeeId: deliverable.aiEmployeeId,
        taskId: deliverable.taskId,
        publishAfter: deliverable.publishAfter?.toISOString() ?? null,
        createdAt: deliverable.createdAt.toISOString(),
      }}
      employeeName={employee?.name ?? "AI Employee"}
      employeeRoleType={employee?.roleType ?? "marketing"}
      taskTitle={task?.title}
      ruleNumbers={ruleNumbers}
      provenance={DEMO_MODE ? (deliverable.demoSessionId ? "live" : "seeded") : null}
    />
  );
}
