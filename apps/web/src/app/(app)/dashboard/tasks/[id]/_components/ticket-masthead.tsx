import Link from "next/link";
import { Monogram } from "@/components/monogram";

export interface TicketMastheadData {
  jobNo: string;
  taskType: string;
  parent: { id: string; title: string } | null;
  employeeName: string;
  employeeRole: string | null;
  employeeRoleTitle: string | null;
  timestamps: string;
}

export function TicketMasthead({
  jobNo,
  taskType,
  parent,
  title,
  employeeName,
  employeeRole,
  employeeRoleTitle,
  timestamps,
  state,
}: TicketMastheadData & { title: string; state: React.ReactNode }) {
  return (
    <header className="rule-b pb-4">
      <p className="spec text-ink-muted uppercase">
        Job {jobNo} · {taskType}
        {parent && (
          <>
            {" · instance of "}
            <Link
              href={`/dashboard/tasks/${parent.id}`}
              className="normal-case underline underline-offset-2 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              {parent.title}
            </Link>
          </>
        )}
      </p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <h1 className="display min-w-0 max-w-2xl text-2xl">{title}</h1>
        <div className="flex shrink-0 flex-wrap items-center gap-2">{state}</div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <span className="flex items-center gap-2">
          <Monogram name={employeeName} roleType={employeeRole} size="sm" />
          <span className="text-[13.5px] font-semibold">{employeeName}</span>
          {employeeRoleTitle && <span className="spec-label">{employeeRoleTitle}</span>}
        </span>
        <span className="spec text-ink-muted">{timestamps}</span>
      </div>
    </header>
  );
}
