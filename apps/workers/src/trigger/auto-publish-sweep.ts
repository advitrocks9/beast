import { schedules } from "@trigger.dev/sdk";
import { db, deliverables, connectors, activityLog } from "@beast/db";
import { eq, and, lte } from "drizzle-orm";
import { publishToPlatform } from "@beast/ai";

/**
 * Heuristic: does this platform error look like a token-auth failure?
 * Matches LinkedIn's "Invalid access token" + 401, Twitter's 401
 * unauthorized, WordPress.com's invalid_token. False positives just
 * shorten the retry budget; false negatives keep today's behavior.
 */
function isAuthFailure(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("401") ||
    m.includes("unauthorized") ||
    m.includes("invalid access token") ||
    m.includes("invalid_token") ||
    m.includes("expired_token") ||
    m.includes("token expired") ||
    m.includes("token revoked")
  );
}

/**
 * Sweeps deliverables in `auto_publishing` state whose `publish_after`
 * has elapsed and pushes them to their target platform. Runs every
 * minute. Each tick is safe to retry: the status -> published flip is
 * the idempotency boundary.
 *
 * Triggered queue/cancel mutations only flip the status; this worker
 * is the publisher. Cancellation is therefore "set status back to
 * approved before the sweep picks the row up."
 */
export const autoPublishSweepJob = schedules.task({
  id: "auto-publish-sweep",
  cron: "* * * * *",
  run: async () => {
    const now = new Date();

    const ready = await db.query.deliverables.findMany({
      where: and(
        eq(deliverables.status, "auto_publishing"),
        lte(deliverables.publishAfter, now),
      ),
      limit: 25,
    });

    let published = 0;
    let failed = 0;

    for (const deliverable of ready) {
      const platform = pickPlatform(deliverable.deliverableType);
      if (!platform) {
        // Unrecognised platform: revert to approved so a human picks it up
        await db
          .update(deliverables)
          .set({ status: "approved", publishAfter: null, updatedAt: new Date() })
          .where(eq(deliverables.id, deliverable.id));
        continue;
      }

      try {
        const connector = await db.query.connectors.findFirst({
          where: and(
            eq(connectors.companyId, deliverable.companyId),
            eq(connectors.platform, platform),
            eq(connectors.status, "connected"),
          ),
        });

        if (!connector) {
          await db
            .update(deliverables)
            .set({ status: "approved", publishAfter: null, updatedAt: new Date() })
            .where(eq(deliverables.id, deliverable.id));
          await db.insert(activityLog).values({
            companyId: deliverable.companyId,
            aiEmployeeId: deliverable.aiEmployeeId,
            actionType: "auto_publish_skipped",
            actionDetail: { deliverableId: deliverable.id, reason: "no_connector", platform },
          });
          continue;
        }

        // Optimistic claim: flip auto_publishing -> publishing before the
        // platform call so a concurrent sweep can't pick this row and
        // post twice. If the platform write succeeds but the post-write
        // DB update fails, the row stays at "publishing" and future
        // sweeps skip it (their WHERE clause matches "auto_publishing"
        // only), avoiding a duplicate LinkedIn/Twitter/WordPress post.
        // Stuck "publishing" rows need a separate recovery sweep but
        // that's a known idle state vs a runaway double-post.
        const claimed = await db
          .update(deliverables)
          .set({ status: "publishing", updatedAt: new Date() })
          .where(and(
            eq(deliverables.id, deliverable.id),
            eq(deliverables.status, "auto_publishing"),
          ))
          .returning({ id: deliverables.id });
        if (claimed.length === 0) continue;

        const result = await publishToPlatform(platform, {
          title: deliverable.title,
          content: deliverable.content as Record<string, unknown>,
          deliverableType: deliverable.deliverableType,
        }, {
          platform: connector.platform,
          accessTokenEnc: connector.accessTokenEnc,
          refreshTokenEnc: connector.refreshTokenEnc,
          metadata: (connector.metadata ?? {}) as Record<string, unknown>,
        });

        await db.transaction(async (tx) => {
          await tx.update(deliverables).set({
            status: "published",
            publishedUrl: result.url,
            publishedAt: new Date(),
            publishAfter: null,
            updatedAt: new Date(),
          }).where(eq(deliverables.id, deliverable.id));

          await tx.insert(activityLog).values({
            companyId: deliverable.companyId,
            aiEmployeeId: deliverable.aiEmployeeId,
            actionType: "deliverable_published",
            actionDetail: {
              deliverableId: deliverable.id,
              platform,
              publishedUrl: result.url,
              via: "auto_publish_sweep",
            },
          });
        });

        published++;
      } catch (err) {
        failed++;
        const message = err instanceof Error ? err.message : String(err);
        const existingContent = (deliverable.content as Record<string, unknown> | null) ?? {};
        const priorFailures = typeof existingContent._autoPublishFailures === "number"
          ? existingContent._autoPublishFailures
          : 0;
        const nextFailures = priorFailures + 1;

        // Fast path for token-auth failures: don't burn the 5-retry budget
        // re-posting through a dead token. Abort the deliverable, mark the
        // connector expired so /settings/connectors prompts reconnect.
        const authFailed = isAuthFailure(message);

        if (authFailed) {
          await db.transaction(async (tx) => {
            await tx.update(deliverables).set({
              status: "approved",
              publishAfter: null,
              updatedAt: new Date(),
              content: { ...existingContent, _autoPublishFailures: nextFailures, _autoPublishLastError: message },
            }).where(eq(deliverables.id, deliverable.id));

            await tx.update(connectors).set({
              status: "expired",
              updatedAt: new Date(),
            }).where(and(
              eq(connectors.companyId, deliverable.companyId),
              eq(connectors.platform, platform),
              eq(connectors.status, "connected"),
            ));

            await tx.insert(activityLog).values({
              companyId: deliverable.companyId,
              aiEmployeeId: deliverable.aiEmployeeId,
              actionType: "auto_publish_aborted",
              actionDetail: {
                deliverableId: deliverable.id,
                platform,
                error: message,
                reason: "connector_expired",
                failureCount: nextFailures,
              },
            });
          });
          continue;
        }

        if (nextFailures >= 5) {
          // Five consecutive failures: stop retrying and revert to approved
          // so the founder can manually re-queue from /reviews. Transient
          // errors recover before this cap; persistent failures (revoked
          // tokens, rejected content) hit the cap and stop flooding.
          await db.update(deliverables).set({
            status: "approved",
            publishAfter: null,
            updatedAt: new Date(),
            content: { ...existingContent, _autoPublishFailures: nextFailures, _autoPublishLastError: message },
          }).where(eq(deliverables.id, deliverable.id));
          await db.insert(activityLog).values({
            companyId: deliverable.companyId,
            aiEmployeeId: deliverable.aiEmployeeId,
            actionType: "auto_publish_aborted",
            actionDetail: { deliverableId: deliverable.id, platform, error: message, failureCount: nextFailures },
          });
        } else {
          // Exponential backoff: 60s, 120s, 240s, 480s. Push publishAfter
          // forward so the next sweep skips this row until the window
          // clears, instead of retrying every minute and writing a new
          // failure row each cycle. Explicit status revert here because
          // the optimistic claim above flipped to "publishing"; without
          // setting it back to "auto_publishing" the next sweep would
          // skip the row and the retry would never fire.
          const backoffSec = 60 * Math.pow(2, priorFailures);
          await db.update(deliverables).set({
            status: "auto_publishing",
            publishAfter: new Date(Date.now() + backoffSec * 1000),
            updatedAt: new Date(),
            content: { ...existingContent, _autoPublishFailures: nextFailures, _autoPublishLastError: message },
          }).where(eq(deliverables.id, deliverable.id));
          await db.insert(activityLog).values({
            companyId: deliverable.companyId,
            aiEmployeeId: deliverable.aiEmployeeId,
            actionType: "auto_publish_failed",
            actionDetail: { deliverableId: deliverable.id, platform, error: message, retryInSec: backoffSec, failureCount: nextFailures },
          });
        }
      }
    }

    return { picked: ready.length, published, failed };
  },
});

function pickPlatform(deliverableType: string): "twitter" | "linkedin" | "wordpress" | null {
  if (deliverableType === "social_twitter") return "twitter";
  if (deliverableType === "social_linkedin") return "linkedin";
  if (deliverableType === "blog_post" || deliverableType === "wordpress_post") return "wordpress";
  return null;
}
