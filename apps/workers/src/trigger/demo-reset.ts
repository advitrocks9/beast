import { schedules } from "@trigger.dev/sdk";
import { db, seedDemo, purgeExpiredDemoSessions } from "@beast/db";
import { env } from "@beast/shared/env";

/**
 * Daily demo reset at 09:00 UTC: reseeds the Northwind Coffee world and
 * purges visitor sessions older than 24h. Same seedDemo the cron route and
 * the CLI call; gated so product deployments never wipe a real org.
 */
export const demoResetJob = schedules.task({
  id: "demo-reset",
  cron: "0 9 * * *",
  run: async () => {
    if (env.NEXT_PUBLIC_DEMO_MODE !== "1") {
      return { skipped: true, reason: "Demo mode not enabled" };
    }
    const counts = await seedDemo(db);
    const purgedSessions = await purgeExpiredDemoSessions(db);
    return { reseeded: true, purgedSessions, counts };
  },
});
