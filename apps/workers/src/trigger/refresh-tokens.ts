import { schedules } from "@trigger.dev/sdk";
import { db, connectors, activityLog } from "@beast/db";
import { eq, and, lt, ne } from "drizzle-orm";
import { encryptToken, decryptToken } from "@beast/shared";
import { refreshLinkedInToken } from "@beast/ai";

/**
 * Daily token refresh job.
 * Refreshes LinkedIn tokens that expire within 24 hours.
 * Twitter tokens don't expire. WordPress.com tokens are long-lived.
 */
export const refreshTokensJob = schedules.task({
  id: "refresh-tokens",
  // Declarative schedule so Trigger.dev auto-creates the recurrence on
  // deploy. Without this, no LinkedIn token ever refreshes and connectors
  // silently flip to expired status. Runs daily at midnight UTC; the
  // worker scans for tokens expiring within the next 24 hours so the
  // window covers any timezone with a day's slack.
  cron: "0 0 * * *",
  run: async () => {
    const soon = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Find connectors with tokens expiring within 24 hours
    const expiring = await db.query.connectors.findMany({
      where: and(
        eq(connectors.status, "connected"),
        lt(connectors.tokenExpiresAt, soon),
        ne(connectors.platform, "twitter"),
      ),
    });

    let refreshed = 0;
    let failed = 0;

    for (const connector of expiring) {
      try {
        if (connector.platform === "linkedin" && connector.refreshTokenEnc) {
          const refreshToken = decryptToken(connector.refreshTokenEnc);
          const clientId = process.env.LINKEDIN_CLIENT_ID!;
          const clientSecret = process.env.LINKEDIN_CLIENT_SECRET!;

          const result = await refreshLinkedInToken(refreshToken, clientId, clientSecret);
          const newExpiry = new Date(Date.now() + result.expiresIn * 1000);

          await db.update(connectors).set({
            accessTokenEnc: encryptToken(result.accessToken),
            refreshTokenEnc: result.refreshToken ? encryptToken(result.refreshToken) : connector.refreshTokenEnc,
            tokenExpiresAt: newExpiry,
            updatedAt: new Date(),
          }).where(eq(connectors.id, connector.id));

          refreshed++;
        }
      } catch (err) {
        console.error(`[TokenRefresh] Failed for connector ${connector.id}:`, err);
        const message = err instanceof Error ? err.message : String(err);

        // Mark as expired and surface a dashboard activity row in the
        // same tx so the founder gets a "your LinkedIn disconnected"
        // notification instead of having to discover the expired pill
        // by visiting /settings/connectors. atomic so retry can't lose
        // the audit row.
        await db.transaction(async (tx) => {
          await tx.update(connectors).set({
            status: "expired",
            updatedAt: new Date(),
          }).where(eq(connectors.id, connector.id));

          await tx.insert(activityLog).values({
            companyId: connector.companyId,
            aiEmployeeId: null,
            actionType: "connector_expired",
            actionDetail: {
              connectorId: connector.id,
              platform: connector.platform,
              error: message,
            },
          });
        });

        failed++;
      }
    }

    return { checked: expiring.length, refreshed, failed };
  },
});
