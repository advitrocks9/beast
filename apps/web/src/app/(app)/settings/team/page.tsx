import { eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@beast/db";
import { companies, aiEmployees } from "@beast/db";
import { GlassCard } from "@beast/ui";

const ROLE_COLORS: Record<string, string> = {
  marketing: "#E87B35",
  sales: "#3B82F6",
  support: "#22C55E",
};

export default async function SettingsTeamPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const company = await db.query.companies.findFirst({
    where: eq(companies.userId, user!.id),
    columns: { id: true },
  });

  const employees = await db.query.aiEmployees.findMany({
    where: eq(aiEmployees.companyId, company!.id),
    columns: {
      id: true,
      name: true,
      roleTitle: true,
      roleType: true,
      checkInFrequency: true,
      autonomySettings: true,
      status: true,
    },
  });

  return (
    <div className="space-y-6">
      <section>
        <h2 className="heading-gradient text-lg font-semibold mb-1">AI Employees</h2>
        <p className="text-xs text-text-muted mb-3">
          Adjust autonomy, check-in frequency, and pause status from each employee desk.
        </p>
        <div className="space-y-3">
          {employees.map((emp) => {
            const autonomy = (emp.autonomySettings ?? {}) as Record<string, string>;
            const roleHex = emp.roleType ? (ROLE_COLORS[emp.roleType] ?? "#9CA3AF") : "#9CA3AF";
            return (
              <GlassCard key={emp.id} hoverable={false} className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: roleHex }}
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{emp.name}</p>
                      <p className="text-xs text-text-secondary truncate">{emp.roleTitle}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-text-secondary">
                      Check-in: <span className="font-medium">{emp.checkInFrequency}</span>
                    </p>
                    <p className="text-xs text-text-muted mt-0.5">
                      Publishing: {autonomy.publishSocial ?? "permission"}
                    </p>
                    <p className="text-[11px] text-text-muted mt-0.5">
                      Status: {emp.status ?? "idle"}
                    </p>
                  </div>
                </div>
              </GlassCard>
            );
          })}

          {employees.length === 0 && (
            <p className="text-sm text-text-muted">
              No employees yet. <a href="/hire" className="text-accent hover:underline">Hire one.</a>
            </p>
          )}
        </div>
      </section>

      <section>
        <h2 className="heading-gradient text-lg font-semibold mb-1">Human seats</h2>
        <p className="text-xs text-text-muted mb-3">
          Inviting other humans is on the Team plan and above. Multi-seat support arrives with billing.
        </p>
        <GlassCard hoverable={false} className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{user!.email}</p>
              <p className="text-xs text-text-secondary">Owner</p>
            </div>
            <span className="rounded-full bg-[oklch(0.97_0.005_260/0.5)] px-3 py-1 text-xs font-medium text-text-secondary">
              Solo
            </span>
          </div>
        </GlassCard>
      </section>
    </div>
  );
}
