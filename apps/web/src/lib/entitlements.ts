import { TRPCError } from "@trpc/server";
import { and, eq, gte, sql } from "drizzle-orm";
import { aiEmployees, companies, tasks } from "@beast/db";
import type { db } from "@beast/db";
import { BILLING_TIERS, TIER_LIMITS, type BillingTier } from "@beast/shared";

type Db = typeof db;

export function readTier(company: { billingTier: string }): BillingTier {
  const tier = BILLING_TIERS.find((t) => t === company.billingTier);
  if (!tier) throw new Error(`Unknown billing tier: ${company.billingTier}`);
  return tier;
}

async function tierFor(db: Db, companyId: string): Promise<BillingTier> {
  const company = await db.query.companies.findFirst({
    where: eq(companies.id, companyId),
    columns: { billingTier: true },
  });
  if (!company) throw new TRPCError({ code: "NOT_FOUND", message: "Company not found" });
  return readTier(company);
}

export async function tasksCreatedThisMonth(db: Db, companyId: string): Promise<number> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tasks)
    .where(and(eq(tasks.companyId, companyId), gte(tasks.createdAt, startOfMonth)));
  return row?.count ?? 0;
}

export async function employeeCount(db: Db, companyId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(aiEmployees)
    .where(eq(aiEmployees.companyId, companyId));
  return row?.count ?? 0;
}

export async function assertWithinTaskLimit(db: Db, companyId: string): Promise<void> {
  const tier = await tierFor(db, companyId);
  const limit = TIER_LIMITS[tier].tasksPerMonth;
  const used = await tasksCreatedThisMonth(db, companyId);
  if (used >= limit) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Monthly task limit reached (${used}/${limit} on the ${tier} plan). Upgrade in Settings > Billing to commission more work.`,
    });
  }
}

export async function assertWithinEmployeeLimit(db: Db, companyId: string): Promise<void> {
  const tier = await tierFor(db, companyId);
  const limit = TIER_LIMITS[tier].employees;
  const count = await employeeCount(db, companyId);
  if (count >= limit) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Employee limit reached (${count}/${limit} on the ${tier} plan). Upgrade in Settings > Billing to hire more.`,
    });
  }
}
