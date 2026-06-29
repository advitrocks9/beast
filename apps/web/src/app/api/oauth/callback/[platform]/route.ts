import { NextRequest, NextResponse } from "next/server";
import { and, eq, ne } from "drizzle-orm";
import { db, connectors, companies } from "@beast/db";
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
import { createClient } from "@/lib/supabase/server";
import { DEMO_MODE } from "@/lib/demo";

interface RouteParams {
  params: Promise<{ platform: string }>;
}

/**
 * The companyId of the currently signed-in user, or null. Binds the callback to
 * the session that is completing it: the encrypted state already pins the write
 * to a companyId, and this additionally requires that company to belong to the
 * live session, so a leaked/replayed state cannot be completed by a different
 * browser.
 */
async function sessionCompanyId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const company = await db.query.companies.findFirst({
    where: eq(companies.userId, user.id),
    columns: { id: true },
  });
  return company?.id ?? null;
}

/** Verify state, platform, and session binding in one step. */
async function resolveCompanyId(state: string, platform: string): Promise<string | null> {
  const stateData = verifyState(state, platform);
  if (!stateData) return null;
  const sessionCo = await sessionCompanyId();
  if (!sessionCo || sessionCo !== stateData.companyId) return null;
  return stateData.companyId;
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
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  // No connectors in the read-only demo; refuse before any token exchange.
  if (DEMO_MODE) {
    return NextResponse.redirect(`${appUrl}/dashboard`);
  }

  const searchParams = request.nextUrl.searchParams;

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
    return NextResponse.redirect(`${appUrl}/settings/connectors?error=oauth_failed`);
  }
}

async function handleTwitterCallback(params: URLSearchParams, appUrl: string) {
  if (params.get("denied")) {
    return NextResponse.redirect(`${appUrl}/settings/connectors?error=twitter_denied`);
  }

  // OAuth 1.0a does not echo our state param, so initOAuth carries a signed
  // token in the callback URL (?st=); Twitter preserves it and appends
  // oauth_token + oauth_verifier.
  const companyId = await resolveCompanyId(params.get("st") ?? "", "twitter");
  if (!companyId) {
    return NextResponse.redirect(`${appUrl}/settings/connectors?error=invalid_state`);
  }

  const oauthToken = params.get("oauth_token") ?? "";
  const oauthVerifier = params.get("oauth_verifier") ?? "";
  const consumerKey = process.env.TWITTER_API_KEY!;
  const consumerSecret = process.env.TWITTER_API_SECRET!;

  const result = await exchangeTwitterToken(oauthToken, oauthVerifier, consumerKey, consumerSecret, "");

  await replaceConnector({
    companyId,
    platform: "twitter",
    status: "connected",
    accessTokenEnc: encryptToken(result.accessToken),
    metadata: {
      // OAuth 1.0a token secret is a credential: encrypt at rest like the
      // access token, never store it as plaintext in the metadata jsonb.
      accessTokenSecretEnc: encryptToken(result.accessTokenSecret).toString("base64"),
      userId: result.userId,
      screenName: result.screenName,
    },
  });

  return NextResponse.redirect(`${appUrl}/settings/connectors?connected=twitter`);
}

async function handleLinkedInCallback(params: URLSearchParams, platform: string, appUrl: string) {
  const code = params.get("code") ?? "";
  const state = params.get("state") ?? "";

  const companyId = await resolveCompanyId(state, platform);
  if (!companyId) {
    return NextResponse.redirect(`${appUrl}/settings/connectors?error=invalid_state`);
  }

  const clientId = process.env.LINKEDIN_CLIENT_ID!;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET!;
  const redirectUri = `${appUrl}/api/oauth/callback/linkedin`;

  const tokenResult = await exchangeLinkedInCode(code, clientId, clientSecret, redirectUri);
  const authorUrn = await getUserUrn(tokenResult.accessToken);

  const expiresAt = new Date(Date.now() + tokenResult.expiresIn * 1000);

  await replaceConnector({
    companyId,
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

  const companyId = await resolveCompanyId(state, platform);
  if (!companyId) {
    return NextResponse.redirect(`${appUrl}/settings/connectors?error=invalid_state`);
  }

  const clientId = process.env.WORDPRESS_CLIENT_ID!;
  const clientSecret = process.env.WORDPRESS_CLIENT_SECRET!;
  const redirectUri = `${appUrl}/api/oauth/callback/wordpress`;

  const tokenResult = await exchangeWordPressCode(code, clientId, clientSecret, redirectUri);

  await replaceConnector({
    companyId,
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

  const companyId = await resolveCompanyId(state, "slack");
  if (!companyId) {
    return NextResponse.redirect(`${appUrl}/settings/connectors?error=invalid_state`);
  }

  const clientId = process.env.SLACK_CLIENT_ID!;
  const clientSecret = process.env.SLACK_CLIENT_SECRET!;
  const redirectUri = `${appUrl}/api/oauth/callback/slack`;

  const tokenResult = await exchangeSlackCode(code, clientId, clientSecret, redirectUri);

  // Create/join the #beast-team channel and store its ID
  const channel = await ensureBeastChannel(tokenResult.accessToken);

  await replaceConnector({
    companyId,
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
