import { GlassCard } from "@beast/ui";
import { startersForRole, type StarterRole } from "@beast/shared";
import { roleColor } from "@/lib/colors";
import { StarterCard } from "./starter-card";

interface EmployeeRef {
  id: string;
  name: string;
  roleType: StarterRole;
}

interface DashboardEmptyStateProps {
  employees: EmployeeRef[];
}

export function DashboardEmptyState({ employees }: DashboardEmptyStateProps) {
  if (employees.length === 0) {
    return null;
  }

  return (
    <div>
      <h2 className="heading-gradient text-lg font-semibold mb-1">
        Pick a first project
      </h2>
      <p className="mb-4 text-sm text-text-secondary">
        Each card is a real task. Tap Start, edit the brief if you want, and your AI employee drafts a deliverable in a few minutes.
      </p>

      <div className="space-y-6">
        {employees.map((employee) => {
          const starters = startersForRole(employee.roleType);
          if (starters.length === 0) return null;
          const hex = roleColor(employee.roleType);
          return (
            <div key={employee.id}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {starters.map((s) => (
                  <StarterCard
                    key={s.id}
                    starter={s}
                    employeeId={employee.id}
                    employeeName={employee.name}
                    hex={hex}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <GlassCard hoverable={false} className="mt-6 p-4">
        <p className="text-center text-xs text-text-muted">
          Want a custom first task? Click any employee card above to open their desk and brief them yourself.
        </p>
      </GlassCard>
    </div>
  );
}
