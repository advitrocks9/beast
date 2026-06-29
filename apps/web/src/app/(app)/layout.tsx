import { redirect } from "next/navigation";
import { eq, and, inArray, count } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@beast/db";
import { companies, aiEmployees, deliverables } from "@beast/db";
import { AppShell } from "@/components/app-shell";
import { DEMO_MODE } from "@/lib/demo";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  const company = await db.query.companies.findFirst({
    where: eq(companies.userId, user.id),
    columns: { id: true, onboardingStatus: true },
  });

  if (!company || company.onboardingStatus !== "complete") {
    redirect("/onboarding");
  }

  const [employees, reviewCountResult] = await Promise.all([
    db.query.aiEmployees.findMany({
      where: eq(aiEmployees.companyId, company.id),
      columns: { id: true, name: true, roleType: true, status: true },
    }),
    db
      .select({ value: count() })
      .from(deliverables)
      .where(
        and(
          eq(deliverables.companyId, company.id),
          inArray(deliverables.status, ["draft", "pending_review"]),
        ),
      ),
  ]);

  const reviewCount = reviewCountResult[0]?.value ?? 0;

  const sidebarEmployees = employees.map((e) => ({
    id: e.id,
    name: e.name,
    roleType: e.roleType as "marketing" | "sales" | "support",
    status: (e.status ?? "idle") as "idle" | "working" | "review" | "active",
  }));

  return (
    <AppShell employees={sidebarEmployees} reviewCount={reviewCount} demoMode={DEMO_MODE}>
      {children}
    </AppShell>
  );
}
