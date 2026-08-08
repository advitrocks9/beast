import { NextRequest, NextResponse } from "next/server";
import { generateCheckIn, runTick } from "@beast/ai";
import { db, companies } from "@beast/db";
import { eq } from "drizzle-orm";
import { env } from "@beast/shared/env";
import type { TickResult } from "@beast/ai";

export const maxDuration = 300;

/**
 * Cron entrypoint for the orchestrator tick (Vercel cron or any external
 * scheduler). Sweeps every onboarded company; check-ins run inline since
 * there is no Trigger.dev here.
 */
export async function GET(request: NextRequest) {
  const secret = env.CRON_SECRET;
  if (!secret) {
    console.error("[Cron] CRON_SECRET not configured");
    return NextResponse.json({ error: "Cron not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const active = await db.query.companies.findMany({
    where: eq(companies.onboardingStatus, "complete"),
    columns: { id: true, timezone: true },
  });

  const results: Array<TickResult | { companyId: string; error: string }> = [];
  for (const company of active) {
    try {
      const { checkInsToDispatch, ...stats } = await runTick({
        companyId: company.id,
        timezone: company.timezone,
        now: new Date(),
      });

      for (const checkIn of checkInsToDispatch) {
        try {
          await generateCheckIn(checkIn);
        } catch (err) {
          stats.errors.push(
            `Check-in ${checkIn.employeeId}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      results.push(stats);
    } catch (err) {
      console.error(`[Cron] Tick failed for company ${company.id}:`, err);
      results.push({
        companyId: company.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({ companies: results.length, results });
}
