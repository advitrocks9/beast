const WP_AUTH_URL = "https://public-api.wordpress.com/oauth2/authorize";
const WP_TOKEN_URL = "https://public-api.wordpress.com/oauth2/token";
const WP_API_BASE = "https://public-api.wordpress.com/rest/v1.1";

/** Build the WordPress.com OAuth 2.0 authorization URL. */
export function buildAuthUrl(
  clientId: string,
  redirectUri: string,
  state: string,
  blogUrl?: string,
): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
  });
  if (blogUrl) params.set("blog", blogUrl);
  return `${WP_AUTH_URL}?${params.toString()}`;
}

/** Exchange authorization code for access token. */
export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<{ accessToken: string; blogId: string; blogUrl: string }> {
  const response = await fetch(WP_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`WordPress token exchange failed: ${response.status} ${error}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    blog_id: string;
    blog_url: string;
  };

  return {
    accessToken: data.access_token,
    blogId: data.blog_id,
    blogUrl: data.blog_url,
  };
}

/** Create a WordPress post via the REST API. */
export async function createPost(
  title: string,
  content: string,
  accessToken: string,
  siteId: string,
  status: "publish" | "draft" = "draft",
): Promise<{ id: number; url: string }> {
  const response = await fetch(`${WP_API_BASE}/sites/${siteId}/posts/new`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title, content, status }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`WordPress post failed: ${response.status} ${error}`);
  }

  const data = (await response.json()) as { ID: number; URL: string };
  return { id: data.ID, url: data.URL };
}
