import { notFound } from "next/navigation";
import { eq, and } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@beast/db";
import { companies, deliverables, aiEmployees, tasks } from "@beast/db";
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

  const deliverable = await db.query.deliverables.findFirst({
    where: and(eq(deliverables.id, id), eq(deliverables.companyId, company!.id)),
  });

  if (!deliverable) {
    notFound();
  }

  const employee = await db.query.aiEmployees.findFirst({
    where: eq(aiEmployees.id, deliverable.aiEmployeeId),
    columns: { id: true, name: true, roleType: true },
  });

  const task = deliverable.taskId
    ? await db.query.tasks.findFirst({
        where: eq(tasks.id, deliverable.taskId),
        columns: { title: true },
      })
    : null;

  return (
    <ReviewShell
      deliverable={{
        id: deliverable.id,
        title: deliverable.title,
        deliverableType: deliverable.deliverableType,
        content: deliverable.content as Record<string, unknown>,
        status: deliverable.status,
        version: deliverable.version ?? 1,
        aiEmployeeId: deliverable.aiEmployeeId,
        taskId: deliverable.taskId,
        publishAfter: deliverable.publishAfter?.toISOString() ?? null,
      }}
      employeeName={employee?.name ?? "AI Employee"}
      employeeRoleType={employee?.roleType ?? "marketing"}
      taskTitle={task?.title}
    />
  );
}
