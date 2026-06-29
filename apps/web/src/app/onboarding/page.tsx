import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@beast/db";
import { companies, knowledgeItems, departments, functions } from "@beast/db";
import { OnboardingShell } from "./_components/onboarding-shell";
import { FunctionMapperShell } from "./_components/function-mapper-shell";
import { HireEmployeesShell } from "./_components/hire-employees-shell";

const CATEGORY_WEIGHTS: Record<string, number> = {
  company_overview: 10,
  products: 20,
  audience: 10,
  brand_voice: 15,
  competitors: 10,
  team: 10,
  processes: 15,
  historical: 10,
};

const ALL_CATEGORIES = Object.keys(CATEGORY_WEIGHTS);

const ROLE_DESCRIPTIONS: Record<string, string> = {
  marketing: "Writes blog posts, social media content, newsletters. Energetic and data-driven.",
  sales: "Drafts outreach emails, sequences, proposals. Direct, warm, and consultative.",
  support: "Handles ticket responses, FAQ articles, KB updates. Calm, empathetic, thorough.",
};

const ROLE_NAMES: Record<string, string> = {
  marketing: "Alex",
  sales: "Jordan",
  support: "Sam",
};

const ROLE_TITLES: Record<string, string> = {
  marketing: "Marketing Manager",
  sales: "SDR (Sales Development Rep)",
  support: "Support Lead",
};

const DEPT_TO_ROLE: Record<string, string> = {
  Marketing: "marketing",
  Sales: "sales",
  Support: "support",
};

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  const company = await db.query.companies.findFirst({
    where: eq(companies.userId, user.id),
    columns: {
      id: true,
      name: true,
      onboardingStatus: true,
      skippedCategories: true,
    },
  });

  if (!company) {
    redirect("/sign-in");
  }

  if (company.onboardingStatus === "complete") {
    redirect("/dashboard");
  }

  // Step 2: Function mapping
  if (company.onboardingStatus === "functions") {
    return <FunctionMapperShell companyName={company.name} />;
  }

  // Step 3: Hire employees
  if (company.onboardingStatus === "hiring") {
    // Load departments and their functions to show recommendations
    const depts = await db.query.departments.findMany({
      where: eq(departments.companyId, company.id),
    });

    const allFunctions = await db.query.functions.findMany({
      where: eq(functions.companyId, company.id),
    });

    // Build employee options based on departments and their AI functions
    const employeeOptions = depts
      .map((dept) => {
        const roleType = DEPT_TO_ROLE[dept.name];
        if (!roleType) return null;

        const deptFunctions = allFunctions
          .filter((f) => f.departmentId === dept.id)
          .map((f) => ({
            id: f.id,
            name: f.name,
            departmentName: dept.name,
            mode: f.mode,
          }));

        return {
          roleType: roleType as "marketing" | "sales" | "support",
          name: ROLE_NAMES[roleType]!,
          roleTitle: ROLE_TITLES[roleType]!,
          description: ROLE_DESCRIPTIONS[roleType]!,
          color: roleType,
          functions: deptFunctions,
        };
      })
      .filter(Boolean) as Array<{
        roleType: "marketing" | "sales" | "support";
        name: string;
        roleTitle: string;
        description: string;
        color: string;
        functions: Array<{ id: string; name: string; departmentName: string; mode: string }>;
      }>;

    return (
      <HireEmployeesShell
        companyName={company.name}
        employeeOptions={employeeOptions}
      />
    );
  }

  // Step 1: Interview (default for 'started' and 'interview')
  const items = await db.query.knowledgeItems.findMany({
    where: eq(knowledgeItems.companyId, company.id),
    columns: { category: true },
  });

  const filledCategories = new Set(items.map((i) => i.category));
  let contextScore = 0;
  for (const [cat, weight] of Object.entries(CATEGORY_WEIGHTS)) {
    if (filledCategories.has(cat)) contextScore += weight;
  }

  const skippedSet = new Set(
    Array.isArray(company.skippedCategories) ? company.skippedCategories : [],
  );
  const nextUnfilledCategory =
    ALL_CATEGORIES.find(
      (c) => !filledCategories.has(c) && !skippedSet.has(c),
    ) ?? null;

  const initialProgress = {
    contextScore,
    categories: ALL_CATEGORIES.map((c) => ({
      name: c,
      filled: filledCategories.has(c),
    })),
    totalItems: items.length,
    nextUnfilledCategory,
  };

  return <OnboardingShell companyName={company.name} initialProgress={initialProgress} />;
}
