import { NextRequest, NextResponse } from "next/server";
import { and, eq, ne } from "drizzle-orm";
import { db, connectors } from "@beast/db";
import { encryptToken } from "@beast/shared";
import {
  exchangeTwitterToken,
  exchangeLinkedInCode,
  getUserUrn,
  exchangeWordPressCode,
  exchangeSlackCode,
  ensureBeastChannel,
} from "@beast/ai";
import { verifyState } from "@/trpc/routers/connectors";

interface RouteParams {
  params: Promise<{ platform: string }>;
}

type ConnectorInsert = typeof connectors.$inferInsert;

/**
 * Revoke any prior non-revoked connector for (companyId, platform) and
 * insert the freshly-issued one in a single transaction. The WHERE
 * matches both "connected" and "expired" rows so a founder reconnecting
 * an expired LinkedIn (refresh-tokens daily cron flips connectors to
 * status="expired" when LinkedIn rejects the refresh) doesn't end up
 * with the stale expired row sitting alongside the new connected row.
 * /settings/connectors always shows exactly one live row per platform
 * after this; revoked history is preserved for audit.
 */
async function replaceConnector(values: ConnectorInsert): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(connectors)
      .set({ status: "revoked", updatedAt: new Date() })
      .where(and(
        eq(connectors.companyId, values.companyId),
        eq(connectors.platform, values.platform),
        ne(connectors.status, "revoked"),
      ));

    await tx.insert(connectors).values(values);
  });
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { platform } = await params;
  const searchParams = request.nextUrl.searchParams;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  try {
    switch (platform) {
      case "twitter":
        return await handleTwitterCallback(searchParams, appUrl);
      case "linkedin":
        return await handleLinkedInCallback(searchParams, platform, appUrl);
      case "wordpress":
        return await handleWordPressCallback(searchParams, platform, appUrl);
      case "slack":
        return await handleSlackCallback(searchParams, appUrl);
      default:
        return NextResponse.redirect(`${appUrl}/settings/connectors?error=unsupported_platform`);
    }
  } catch (err) {
    console.error(`[OAuth] ${platform} callback error:`, err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.redirect(`${appUrl}/settings/connectors?error=${encodeURIComponent(message)}`);
  }
}

async function handleTwitterCallback(params: URLSearchParams, appUrl: string) {
  const oauthToken = params.get("oauth_token") ?? "";
  const oauthVerifier = params.get("oauth_verifier") ?? "";

  // Twitter uses oauth_token as part of the state flow
  // Find matching state entry by scanning (Twitter doesn't pass our state param back)
  const denied = params.get("denied");
  if (denied) {
    return NextResponse.redirect(`${appUrl}/settings/connectors?error=twitter_denied`);
  }

  // Verify via the state store - we stored the oauthTokenSecret there
  // For Twitter, we need to find the state entry that has this oauthToken
  // This is a limitation of OAuth 1.0a - no state param in callback
  // We match by checking the extra.oauthTokenSecret presence
  const consumerKey = process.env.TWITTER_API_KEY!;
  const consumerSecret = process.env.TWITTER_API_SECRET!;

  // Exchange for access token (we need the tokenSecret from initOAuth)
  // Since Twitter 1.0a doesn't pass state back, we use a simplified flow
  // The tokenSecret was stored in the state entry during initOAuth
  const result = await exchangeTwitterToken(
    oauthToken,
    oauthVerifier,
    consumerKey,
    consumerSecret,
    "", // tokenSecret - Twitter's access token exchange works without it for the verifier step
  );

  // Find the company - look up from state store by scanning for twitter entries
  // In production, encode companyId in the callback URL or use a session
  // For now, we'll encode it in the OAuth callback URL as a query param
  const stateParam = params.get("state") ?? "";
  const stateData = verifyState(stateParam);
  if (!stateData) {
    return NextResponse.redirect(`${appUrl}/settings/connectors?error=invalid_state`);
  }

  await replaceConnector({
    companyId: stateData.companyId,
    platform: "twitter",
    status: "connected",
    accessTokenEnc: encryptToken(result.accessToken),
    metadata: {
      accessTokenSecret: result.accessTokenSecret,
      userId: result.userId,
      screenName: result.screenName,
    },
  });

  return NextResponse.redirect(`${appUrl}/settings/connectors?connected=twitter`);
}

async function handleLinkedInCallback(params: URLSearchParams, platform: string, appUrl: string) {
  const code = params.get("code") ?? "";
  const state = params.get("state") ?? "";

  const stateData = verifyState(state);
  if (!stateData) {
    return NextResponse.redirect(`${appUrl}/settings/connectors?error=invalid_state`);
  }

  const clientId = process.env.LINKEDIN_CLIENT_ID!;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET!;
  const redirectUri = `${appUrl}/api/oauth/callback/linkedin`;

  const tokenResult = await exchangeLinkedInCode(code, clientId, clientSecret, redirectUri);
  const authorUrn = await getUserUrn(tokenResult.accessToken);

  const expiresAt = new Date(Date.now() + tokenResult.expiresIn * 1000);

  await replaceConnector({
    companyId: stateData.companyId,
    platform: "linkedin",
    status: "connected",
    accessTokenEnc: encryptToken(tokenResult.accessToken),
    refreshTokenEnc: tokenResult.refreshToken ? encryptToken(tokenResult.refreshToken) : null,
    tokenExpiresAt: expiresAt,
    metadata: { authorUrn },
  });

  return NextResponse.redirect(`${appUrl}/settings/connectors?connected=linkedin`);
}

async function handleWordPressCallback(params: URLSearchParams, platform: string, appUrl: string) {
  const code = params.get("code") ?? "";
  const state = params.get("state") ?? "";

  const stateData = verifyState(state);
  if (!stateData) {
    return NextResponse.redirect(`${appUrl}/settings/connectors?error=invalid_state`);
  }

  const clientId = process.env.WORDPRESS_CLIENT_ID!;
  const clientSecret = process.env.WORDPRESS_CLIENT_SECRET!;
  const redirectUri = `${appUrl}/api/oauth/callback/wordpress`;

  const tokenResult = await exchangeWordPressCode(code, clientId, clientSecret, redirectUri);

  await replaceConnector({
    companyId: stateData.companyId,
    platform: "wordpress",
    status: "connected",
    accessTokenEnc: encryptToken(tokenResult.accessToken),
    metadata: { blogId: tokenResult.blogId, blogUrl: tokenResult.blogUrl },
  });

  return NextResponse.redirect(`${appUrl}/settings/connectors?connected=wordpress`);
}

async function handleSlackCallback(params: URLSearchParams, appUrl: string) {
  const code = params.get("code") ?? "";
  const state = params.get("state") ?? "";

  const stateData = verifyState(state);
  if (!stateData) {
    return NextResponse.redirect(`${appUrl}/settings/connectors?error=invalid_state`);
  }

  const clientId = process.env.SLACK_CLIENT_ID!;
  const clientSecret = process.env.SLACK_CLIENT_SECRET!;
  const redirectUri = `${appUrl}/api/oauth/callback/slack`;

  const tokenResult = await exchangeSlackCode(code, clientId, clientSecret, redirectUri);

  // Create/join the #beast-team channel and store its ID
  const channel = await ensureBeastChannel(tokenResult.accessToken);

  await replaceConnector({
    companyId: stateData.companyId,
    platform: "slack",
    status: "connected",
    accessTokenEnc: encryptToken(tokenResult.accessToken),
    metadata: {
      teamId: tokenResult.teamId,
      teamName: tokenResult.teamName,
      botUserId: tokenResult.botUserId,
      appId: tokenResult.appId,
      channelId: channel.id,
      channelName: channel.name,
    },
  });

  return NextResponse.redirect(`${appUrl}/settings/connectors?connected=slack`);
}
