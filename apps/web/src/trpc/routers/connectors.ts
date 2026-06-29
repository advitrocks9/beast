import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { connectors } from "@beast/db";
import { encryptToken, decryptToken } from "@beast/shared";
import {
  buildTwitterOAuthUrl,
  buildLinkedInAuthUrl,
  buildWordPressAuthUrl,
  buildSlackAuthUrl,
} from "@beast/ai";
import { createTRPCRouter, protectedProcedure, assertNotDemo } from "../init";

// OAuth state is a signed, self-contained token (AES-256-GCM) instead of a
// server-side entry, so it survives the separate serverless invocations of
// initOAuth and the callback. The payload carries the companyId and an expiry.
interface OAuthState {
  companyId: string;
  platform: string;
  exp: number;
}

function generateState(companyId: string, platform: string): string {
  const payload: OAuthState = { companyId, platform, exp: Date.now() + 10 * 60 * 1000 };
  return encryptToken(JSON.stringify(payload)).toString("base64url");
}

export function verifyState(
  state: string,
  expectedPlatform?: string,
): { companyId: string; platform: string } | null {
  if (!state) return null;
  try {
    const payload = JSON.parse(decryptToken(Buffer.from(state, "base64url"))) as OAuthState;
    if (Date.now() > payload.exp) return null;
    // Reject a state minted for a different platform being replayed on another
    // platform's callback.
    if (expectedPlatform !== undefined && payload.platform !== expectedPlatform) return null;
    return { companyId: payload.companyId, platform: payload.platform };
  } catch {
    return null;
  }
}

function getCallbackUrl(platform: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base}/api/oauth/callback/${platform}`;
}

/**
 * Strip credential-bearing keys from connector metadata before it crosses the
 * wire. The encrypted token columns are already excluded by the column select,
 * but metadata is a free-form jsonb that historically also carried secrets
 * (e.g. the Twitter OAuth1 token secret), so deny anything that looks like one.
 */
const SECRET_METADATA_KEY = /secret|token|enc$|password/i;
function sanitizeMetadata(metadata: unknown): Record<string, unknown> {
  if (!metadata || typeof metadata !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(metadata as Record<string, unknown>)) {
    if (SECRET_METADATA_KEY.test(k)) continue;
    out[k] = v;
  }
  return out;
}

export const connectorsRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.query.connectors.findMany({
      where: eq(connectors.companyId, ctx.companyId),
      columns: {
        id: true,
        platform: true,
        status: true,
        tokenExpiresAt: true,
        metadata: true,
        createdAt: true,
      },
    });
    return rows.map((r) => ({ ...r, metadata: sanitizeMetadata(r.metadata) }));
  }),

  initOAuth: protectedProcedure
    .input(z.object({
      platform: z.enum(["twitter", "linkedin", "wordpress", "slack"]),
    }))
    .mutation(async ({ ctx, input }) => {
      assertNotDemo("Connecting an account");
      const state = generateState(ctx.companyId, input.platform);
      const callbackUrl = getCallbackUrl(input.platform);

      switch (input.platform) {
        case "twitter": {
          const consumerKey = process.env.TWITTER_API_KEY;
          const consumerSecret = process.env.TWITTER_API_SECRET;
          if (!consumerKey || !consumerSecret) {
            throw new Error("Twitter API credentials not configured");
          }

          // OAuth 1.0a does not echo our state, so carry it in the callback URL.
          const twitterCallback = `${callbackUrl}?st=${state}`;
          const result = await buildTwitterOAuthUrl(twitterCallback, consumerKey, consumerSecret);

          return { redirectUrl: result.url };
        }

        case "linkedin": {
          const clientId = process.env.LINKEDIN_CLIENT_ID;
          if (!clientId) throw new Error("LinkedIn credentials not configured");

          const url = buildLinkedInAuthUrl(clientId, callbackUrl, state);
          return { redirectUrl: url };
        }

        case "wordpress": {
          const clientId = process.env.WORDPRESS_CLIENT_ID;
          if (!clientId) throw new Error("WordPress credentials not configured");

          const url = buildWordPressAuthUrl(clientId, callbackUrl, state);
          return { redirectUrl: url };
        }

        case "slack": {
          const clientId = process.env.SLACK_CLIENT_ID;
          if (!clientId) throw new Error("Slack credentials not configured");

          const url = buildSlackAuthUrl(clientId, callbackUrl, state);
          return { redirectUrl: url };
        }

        default:
          throw new Error(`Unsupported platform: ${input.platform}`);
      }
    }),

  disconnect: protectedProcedure
    .input(z.object({ connectorId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(connectors)
        .set({ status: "revoked", updatedAt: new Date() })
        .where(and(eq(connectors.id, input.connectorId), eq(connectors.companyId, ctx.companyId)));
    }),
});
