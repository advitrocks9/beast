import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, demoSessions } from "@beast/db";
import { env } from "@beast/shared/env";
import { DEMO_MODE, DEMO_SESSION_COOKIE, demoSessionIdFromHeaders } from "@/lib/demo";
import { hashIp } from "@/lib/demo-limits";
import { clientIpFrom } from "@/lib/rate-limit";

const COOKIE_MAX_AGE_S = 60 * 60 * 24;

/**
 * Mint or refresh the visitor's demo session. The nightly reset purges rows
 * older than 24h, so a stale cookie falls through to a fresh session.
 */
export async function POST(request: Request) {
  // Outside the demo this route has no reason to exist; refuse structurally.
  if (!DEMO_MODE) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const existingId = demoSessionIdFromHeaders(request.headers);

  let session: { id: string; runsUsed: number } | undefined;
  if (existingId) {
    [session] = await db
      .update(demoSessions)
      .set({ lastSeenAt: new Date() })
      .where(eq(demoSessions.id, existingId))
      .returning({ id: demoSessions.id, runsUsed: demoSessions.runsUsed });
  }
  if (!session) {
    [session] = await db
      .insert(demoSessions)
      .values({ ipHash: hashIp(clientIpFrom(request)) })
      .returning({ id: demoSessions.id, runsUsed: demoSessions.runsUsed });
  }
  if (!session) throw new Error("demo session insert returned no row");

  const response = NextResponse.json({
    sessionId: session.id,
    runsUsed: session.runsUsed,
    runLimit: env.DEMO_RUNS_PER_SESSION,
  });
  response.cookies.set(DEMO_SESSION_COOKIE, session.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: new URL(request.url).protocol === "https:",
    path: "/",
    maxAge: COOKIE_MAX_AGE_S,
  });
  return response;
}
