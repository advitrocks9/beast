import { createHash } from "node:crypto";
import { and, eq, gte, sql } from "drizzle-orm";
import { db, demoSessions, demoBudget } from "@beast/db";
import { env } from "@beast/shared/env";

// Static salt: ip_hash only needs to be non-reversible at a glance, not secret.
const IP_HASH_SALT = "beast-demo-ip-v1";

export function hashIp(ip: string): string {
  return createHash("sha256").update(`${IP_HASH_SALT}:${ip}`).digest("hex");
}

export type RunAllowance =
  | { allowed: true }
  | { allowed: false; reason: "session" | "ip" | "budget" };

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function checkRunAllowance(sessionId: string, ipHash: string): Promise<RunAllowance> {
  const session = await db.query.demoSessions.findFirst({
    where: eq(demoSessions.id, sessionId),
    columns: { runsUsed: true },
  });
  if (!session || session.runsUsed >= env.DEMO_RUNS_PER_SESSION) {
    return { allowed: false, reason: "session" };
  }

  const dayStart = new Date(`${utcDay()}T00:00:00Z`);
  const [ipUsage] = await db
    .select({ runs: sql<number>`coalesce(sum(${demoSessions.runsUsed}), 0)::int` })
    .from(demoSessions)
    .where(and(eq(demoSessions.ipHash, ipHash), gte(demoSessions.createdAt, dayStart)));
  if (!ipUsage) throw new Error("aggregate query returned no row");
  if (ipUsage.runs >= env.DEMO_RUNS_PER_IP_DAILY) {
    return { allowed: false, reason: "ip" };
  }

  const budget = await db.query.demoBudget.findFirst({
    where: eq(demoBudget.day, utcDay()),
    columns: { tokensUsed: true },
  });
  if ((budget?.tokensUsed ?? 0) >= env.DEMO_DAILY_TOKEN_BUDGET) {
    return { allowed: false, reason: "budget" };
  }

  return { allowed: true };
}

export async function recordRunUsage(sessionId: string, tokensUsed: number): Promise<void> {
  await db
    .update(demoSessions)
    .set({ runsUsed: sql`${demoSessions.runsUsed} + 1`, lastSeenAt: new Date() })
    .where(eq(demoSessions.id, sessionId));
  await db
    .insert(demoBudget)
    .values({ day: utcDay(), tokensUsed, runs: 1 })
    .onConflictDoUpdate({
      target: demoBudget.day,
      set: {
        tokensUsed: sql`${demoBudget.tokensUsed} + ${tokensUsed}`,
        runs: sql`${demoBudget.runs} + 1`,
      },
    });
}
