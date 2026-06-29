import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { connectors } from "@beast/db";
import {
  buildTwitterOAuthUrl,
  buildLinkedInAuthUrl,
  buildWordPressAuthUrl,
  buildSlackAuthUrl,
} from "@beast/ai";
import { createTRPCRouter, protectedProcedure, assertNotDemo } from "../init";

// In-memory store for OAuth state tokens (short-lived).
// In production, use Redis or a DB table with TTL.
const oauthStateStore = new Map<string, { companyId: string; platform: string; extra?: Record<string, string>; expiresAt: number }>();

function generateState(companyId: string, platform: string, extra?: Record<string, string>): string {
  const state = randomBytes(24).toString("hex");
  oauthStateStore.set(state, {
    companyId,
    platform,
    extra,
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 min TTL
  });
  return state;
}

export function verifyState(state: string): { companyId: string; platform: string; extra?: Record<string, string> } | null {
  const entry = oauthStateStore.get(state);
  if (!entry) return null;
  oauthStateStore.delete(state);
  if (Date.now() > entry.expiresAt) return null;
  return entry;
}

function getCallbackUrl(platform: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base}/api/oauth/callback/${platform}`;
}

export const connectorsRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.connectors.findMany({
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

          const result = await buildTwitterOAuthUrl(callbackUrl, consumerKey, consumerSecret);

          // Store the token secret in state for the callback
          const entry = oauthStateStore.get(state);
          if (entry) {
            entry.extra = { oauthTokenSecret: result.oauthTokenSecret };
          }

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
