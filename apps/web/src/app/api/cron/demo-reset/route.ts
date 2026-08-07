import { NextRequest, NextResponse } from "next/server";
import { db, seedDemo, purgeExpiredDemoSessions } from "@beast/db";
import { env } from "@beast/shared/env";
import { DEMO_MODE } from "@/lib/demo";

export const maxDuration = 300;

/**
 * Nightly demo reset (Vercel cron or any external scheduler): reseeds the
 * Northwind Coffee world and purges visitor sessions older than 24h so the
 * shared demo org is fresh on arrival. Demo deployments only.
 */
export async function GET(request: NextRequest) {
  const secret = env.CRON_SECRET;
  if (!secret) {
    console.error("[DemoReset] CRON_SECRET not configured");
    return NextResponse.json({ error: "Cron not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!DEMO_MODE) {
    return NextResponse.json({ error: "Demo reset only runs in demo mode" }, { status: 403 });
  }

  const counts = await seedDemo(db);
  const purgedSessions = await purgeExpiredDemoSessions(db);
  return NextResponse.json({ reseeded: true, purgedSessions, counts });
}
