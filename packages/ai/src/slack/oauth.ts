const SLACK_AUTHORIZE_URL = "https://slack.com/oauth/v2/authorize";
const SLACK_TOKEN_URL = "https://slack.com/api/oauth.v2.access";
const SLACK_AUTH_TEST_URL = "https://slack.com/api/auth.test";

/** Bot scopes needed for V1: post messages, read channels, join channels. */
const BOT_SCOPES = "chat:write,channels:read,channels:join";

/** Build the Slack OAuth 2.0 V2 authorization URL. */
export function buildAuthUrl(
  clientId: string,
  redirectUri: string,
  state: string,
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    scope: BOT_SCOPES,
    redirect_uri: redirectUri,
    state,
  });
  return `${SLACK_AUTHORIZE_URL}?${params.toString()}`;
}

interface SlackOAuthResult {
  accessToken: string;
  teamId: string;
  teamName: string;
  botUserId: string;
  appId: string;
}

/** Exchange the authorization code for a bot access token. */
export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<SlackOAuthResult> {
  const response = await fetch(SLACK_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`Slack token exchange HTTP error: ${response.status}`);
  }

  const data = (await response.json()) as {
    ok: boolean;
    error?: string;
    access_token?: string;
    team?: { id: string; name: string };
    bot_user_id?: string;
    app_id?: string;
  };

  if (!data.ok || !data.access_token) {
    throw new Error(`Slack token exchange failed: ${data.error ?? "unknown"}`);
  }

  return {
    accessToken: data.access_token,
    teamId: data.team?.id ?? "",
    teamName: data.team?.name ?? "",
    botUserId: data.bot_user_id ?? "",
    appId: data.app_id ?? "",
  };
}

/** Verify a bot token is valid via auth.test. */
export async function verifyToken(botToken: string): Promise<{ botId: string; userId: string; teamId: string }> {
  const response = await fetch(SLACK_AUTH_TEST_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${botToken}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });

  const data = (await response.json()) as {
    ok: boolean;
    error?: string;
    bot_id?: string;
    user_id?: string;
    team_id?: string;
  };

  if (!data.ok) {
    throw new Error(`Slack auth.test failed: ${data.error ?? "unknown"}`);
  }

  return {
    botId: data.bot_id ?? "",
    userId: data.user_id ?? "",
    teamId: data.team_id ?? "",
  };
}
