import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@beast/db";
import { companies, knowledgeItems } from "@beast/db";
import { OnboardingShell } from "./_components/onboarding-shell";
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

const EMPLOYEE_OPTIONS = [
  {
    roleType: "marketing" as const,
    name: "Alex",
    roleTitle: "Marketing Manager",
    description: "Writes blog posts, social media content, newsletters. Energetic and data-driven.",
  },
  {
    roleType: "sales" as const,
    name: "Jordan",
    roleTitle: "SDR (Sales Development Rep)",
    description: "Drafts outreach emails, sequences, proposals. Direct, warm, and consultative.",
  },
  {
    roleType: "support" as const,
    name: "Sam",
    roleTitle: "Support Lead",
    description: "Handles ticket responses, FAQ articles, KB updates. Calm, empathetic, thorough.",
  },
];

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

  if (company.onboardingStatus === "hiring") {
    return (
      <HireEmployeesShell
        companyName={company.name}
        employeeOptions={EMPLOYEE_OPTIONS}
      />
    );
  }

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
