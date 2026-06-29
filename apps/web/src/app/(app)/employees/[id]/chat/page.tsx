import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, and } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db, companies, aiEmployees } from "@beast/db";
import { roleColor } from "@/lib/colors";
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

  const roleHex = roleColor(employee.roleType);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href={`/employees/${employee.id}`}
            className="text-sm text-text-secondary hover:text-text"
          >
            &larr; Back to desk
          </Link>
          <span className="text-text-muted">/</span>
          <div className="flex items-center gap-2">
            <span
              className="flex h-7 w-7 items-center justify-center rounded-full text-white text-xs font-bold"
              style={{ backgroundColor: roleHex }}
            >
              {employee.name[0]}
            </span>
            <p className="text-sm font-medium">{employee.name}</p>
            <span className="text-xs text-text-secondary">{employee.roleTitle}</span>
          </div>
        </div>
        <Link
          href={`/employees/${employee.id}/new-task`}
          className="rounded-full bg-black px-4 py-1.5 text-xs font-medium text-white hover:bg-gray-800"
        >
          + New Task
        </Link>
      </div>

      <ChatThread
        employeeId={employee.id}
        employeeName={employee.name}
        employeeRoleType={employee.roleType as "marketing" | "sales" | "support"}
      />
    </div>
  );
}
