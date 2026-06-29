import { notFound } from "next/navigation";
import { eq, and, or, isNull } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@beast/db";
import { companies, aiEmployees, goals } from "@beast/db";
import { NewTaskForm } from "./_components/new-task-form";

const ROLE_TASK_TYPES: Record<string, Array<{ value: string; label: string }>> = {
  marketing: [
    { value: "write-blog-post", label: "Blog Post" },
    { value: "create-social-post", label: "Social Media Post" },
    { value: "draft-newsletter", label: "Newsletter" },
    { value: "custom", label: "Custom Task" },
  ],
  sales: [
    { value: "draft-outreach-email", label: "Outreach Email" },
    { value: "create-email-sequence", label: "Email Sequence" },
    { value: "custom", label: "Custom Task" },
  ],
  support: [
    { value: "draft-ticket-response", label: "Ticket Response" },
    { value: "write-faq-article", label: "FAQ Article" },
    { value: "custom", label: "Custom Task" },
  ],
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function NewTaskPage({ params }: PageProps) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const company = await db.query.companies.findFirst({
    where: eq(companies.userId, user!.id),
    columns: { id: true, name: true },
  });

  const employee = await db.query.aiEmployees.findFirst({
    where: and(eq(aiEmployees.id, id), eq(aiEmployees.companyId, company!.id)),
    columns: { id: true, name: true, roleTitle: true, roleType: true },
  });

  if (!employee) {
    notFound();
  }

  const taskTypes = ROLE_TASK_TYPES[employee.roleType] ?? [{ value: "custom", label: "Custom Task" }];

  // Active goals this employee can pin a task to: assigned-to-this-employee
  // OR unassigned (matches the employee-page rule).
  const activeGoals = await db.query.goals.findMany({
    where: and(
      eq(goals.companyId, company!.id),
      eq(goals.status, "active"),
      or(eq(goals.aiEmployeeId, employee.id), isNull(goals.aiEmployeeId)),
    ),
    columns: { id: true, title: true, targetDate: true },
    orderBy: (g, { desc }) => [desc(g.createdAt)],
  });

  return (
    <NewTaskForm
      employeeId={employee.id}
      employeeName={employee.name}
      employeeRole={employee.roleTitle}
      companyName={company!.name}
      taskTypes={taskTypes}
      activeGoals={activeGoals.map((g) => ({
        id: g.id,
        title: g.title,
        targetDate: g.targetDate ?? null,
      }))}
    />
  );
}
