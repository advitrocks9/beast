import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, and } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { db, companies, aiEmployees } from "@beast/db";
import { Monogram } from "@/components/monogram";
import { ChatThread } from "./_components/chat-thread";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EmployeeChatPage({ params }: PageProps) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const company = await db.query.companies.findFirst({
    where: eq(companies.userId, user!.id),
    columns: { id: true },
  });

  const employee = await db.query.aiEmployees.findFirst({
    where: and(eq(aiEmployees.id, id), eq(aiEmployees.companyId, company!.id)),
  });

  if (!employee) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-3xl">
      <header className="rule-b flex flex-wrap items-end justify-between gap-3 pb-3">
        <div>
          <Link
            href={`/employees/${employee.id}`}
            className="spec-label inline-flex items-center gap-1.5 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            <ArrowLeft size={12} strokeWidth={1.5} />
            {employee.name}&apos;s desk
          </Link>
          <div className="mt-2 flex items-center gap-3">
            <Monogram name={employee.name} roleType={employee.roleType} size="lg" />
            <div>
              <h1 className="display text-2xl">{employee.name}</h1>
              <p className="spec-label mt-0.5">{employee.roleTitle} · memo thread</p>
            </div>
          </div>
        </div>
        <Link
          href={`/employees/${employee.id}/new-task`}
          className="btn-ghost focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          Brief a job
        </Link>
      </header>

      <div className="mt-4">
        <ChatThread
          employeeId={employee.id}
          employeeName={employee.name}
          employeeRoleType={employee.roleType as "marketing" | "sales" | "support"}
        />
      </div>
    </div>
  );
}
