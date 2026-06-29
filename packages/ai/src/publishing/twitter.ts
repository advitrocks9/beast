import { createHmac, randomBytes } from "node:crypto";

const TWITTER_REQUEST_TOKEN_URL = "https://api.twitter.com/oauth/request_token";
const TWITTER_AUTH_URL = "https://api.twitter.com/oauth/authorize";
const TWITTER_ACCESS_TOKEN_URL = "https://api.twitter.com/oauth/access_token";
const TWITTER_TWEET_URL = "https://api.twitter.com/2/tweets";

/** Generate an OAuth 1.0a signature base string + HMAC-SHA1 signature. */
function signRequest(
  method: string,
  url: string,
  params: Record<string, string>,
  consumerSecret: string,
  tokenSecret: string,
): string {
  // Sort params alphabetically, percent-encode
  const sortedParams = Object.keys(params)
    .sort()
    .map((k) => `${encodeRFC3986(k)}=${encodeRFC3986(params[k]!)}`)
    .join("&");

  const baseString = `${method.toUpperCase()}&${encodeRFC3986(url)}&${encodeRFC3986(sortedParams)}`;
  const signingKey = `${encodeRFC3986(consumerSecret)}&${encodeRFC3986(tokenSecret)}`;

  return createHmac("sha1", signingKey).update(baseString).digest("base64");
}

function encodeRFC3986(str: string): string {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function generateNonce(): string {
  return randomBytes(16).toString("hex");
}

function buildAuthHeader(params: Record<string, string>): string {
  const pairs = Object.keys(params)
    .filter((k) => k.startsWith("oauth_"))
    .sort()
    .map((k) => `${encodeRFC3986(k)}="${encodeRFC3986(params[k]!)}"`)
    .join(", ");
  return `OAuth ${pairs}`;
}

/** Step 1: Get a request token and build the authorization URL. */
export async function buildOAuthUrl(
  callbackUrl: string,
  consumerKey: string,
  consumerSecret: string,
): Promise<{ url: string; oauthToken: string; oauthTokenSecret: string }> {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: generateNonce(),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_version: "1.0",
    oauth_callback: callbackUrl,
  };

  oauthParams.oauth_signature = signRequest("POST", TWITTER_REQUEST_TOKEN_URL, oauthParams, consumerSecret, "");

  const response = await fetch(TWITTER_REQUEST_TOKEN_URL, {
    method: "POST",
    headers: { Authorization: buildAuthHeader(oauthParams) },
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Twitter request token failed: ${response.status} ${text}`);
  }

  const body = await response.text();
  const parsed = new URLSearchParams(body);

  const oauthToken = parsed.get("oauth_token") ?? "";
  const oauthTokenSecret = parsed.get("oauth_token_secret") ?? "";

  return {
    url: `${TWITTER_AUTH_URL}?oauth_token=${oauthToken}`,
    oauthToken,
    oauthTokenSecret,
  };
}

/** Step 2: Exchange the verifier for an access token. */
export async function exchangeOAuthToken(
  oauthToken: string,
  oauthVerifier: string,
  consumerKey: string,
  consumerSecret: string,
  tokenSecret: string,
): Promise<{ accessToken: string; accessTokenSecret: string; userId: string; screenName: string }> {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: generateNonce(),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: oauthToken,
    oauth_verifier: oauthVerifier,
    oauth_version: "1.0",
  };

  oauthParams.oauth_signature = signRequest("POST", TWITTER_ACCESS_TOKEN_URL, oauthParams, consumerSecret, tokenSecret);

  const response = await fetch(TWITTER_ACCESS_TOKEN_URL, {
    method: "POST",
    headers: { Authorization: buildAuthHeader(oauthParams) },
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`Twitter access token exchange failed: ${response.status}`);
  }

  const body = await response.text();
  const parsed = new URLSearchParams(body);

  return {
    accessToken: parsed.get("oauth_token") ?? "",
    accessTokenSecret: parsed.get("oauth_token_secret") ?? "",
    userId: parsed.get("user_id") ?? "",
    screenName: parsed.get("screen_name") ?? "",
  };
}

/** Post a tweet using Twitter API v2. */
export async function postTweet(
  text: string,
  accessToken: string,
  accessTokenSecret: string,
  consumerKey: string,
  consumerSecret: string,
): Promise<{ id: string; url: string }> {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: generateNonce(),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: accessToken,
    oauth_version: "1.0",
  };

  oauthParams.oauth_signature = signRequest("POST", TWITTER_TWEET_URL, oauthParams, consumerSecret, accessTokenSecret);

  const response = await fetch(TWITTER_TWEET_URL, {
    method: "POST",
    headers: {
      Authorization: buildAuthHeader(oauthParams),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Twitter post failed: ${response.status} ${error}`);
  }

  const data = (await response.json()) as { data: { id: string } };
  return {
    id: data.data.id,
    url: `https://x.com/i/status/${data.data.id}`,
  };
}
