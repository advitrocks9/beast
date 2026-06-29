import { postTweet } from "./twitter";
import { createPost as createLinkedInPost, getUserUrn } from "./linkedin";
import { createPost as createWordPressPost } from "./wordpress";
import { decryptToken } from "@beast/shared";

export { buildOAuthUrl as buildTwitterOAuthUrl, exchangeOAuthToken as exchangeTwitterToken } from "./twitter";
export { buildAuthUrl as buildLinkedInAuthUrl, exchangeCode as exchangeLinkedInCode, refreshAccessToken as refreshLinkedInToken, getUserUrn } from "./linkedin";
export { buildAuthUrl as buildWordPressAuthUrl, exchangeCode as exchangeWordPressCode } from "./wordpress";

interface ConnectorData {
  platform: string;
  accessTokenEnc: Buffer;
  refreshTokenEnc: Buffer | null;
  metadata: Record<string, unknown>;
}

interface DeliverableData {
  title: string;
  content: Record<string, unknown>;
  deliverableType: string;
}

interface PublishResult {
  url: string;
  platformPostId: string;
}

/**
 * Publish a deliverable to the appropriate platform.
 * Decrypts stored tokens, calls the platform API, returns the published URL.
 */
export async function publishToPlatform(
  platform: string,
  deliverable: DeliverableData,
  connector: ConnectorData,
): Promise<PublishResult> {
  const accessToken = decryptToken(connector.accessTokenEnc);

  switch (platform) {
    case "twitter": {
      const text = extractText(deliverable);
      const consumerKey = process.env.TWITTER_API_KEY!;
      const consumerSecret = process.env.TWITTER_API_SECRET!;
      // OAuth 1.0a token secret is encrypted at rest in metadata.
      // accessTokenSecretEnc (base64 of the AES-GCM blob); fall back to a legacy
      // plaintext accessTokenSecret for rows minted before encryption.
      const encSecret = connector.metadata.accessTokenSecretEnc as string | undefined;
      const tokenSecret = encSecret
        ? decryptToken(Buffer.from(encSecret, "base64"))
        : ((connector.metadata.accessTokenSecret as string) ?? "");

      const result = await postTweet(text, accessToken, tokenSecret, consumerKey, consumerSecret);
      return { url: result.url, platformPostId: result.id };
    }

    case "linkedin": {
      const text = extractText(deliverable);
      const authorUrn = (connector.metadata.authorUrn as string) ?? "";
      if (!authorUrn) throw new Error("LinkedIn connector missing authorUrn in metadata");

      const result = await createLinkedInPost(text, accessToken, authorUrn);
      return { url: result.url, platformPostId: result.id };
    }

    case "wordpress": {
      const siteId = (connector.metadata.blogId as string) ?? "";
      if (!siteId) throw new Error("WordPress connector missing blogId in metadata");

      const title = deliverable.title;
      const content = (deliverable.content.content as string)
        ?? (deliverable.content.text as string)
        ?? JSON.stringify(deliverable.content);

      const result = await createWordPressPost(title, content, accessToken, siteId, "publish");
      return { url: result.url, platformPostId: String(result.id) };
    }

    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

/** Extract the main text content from a deliverable for social posting. */
function extractText(deliverable: DeliverableData): string {
  const c = deliverable.content;
  return (c.content as string)
    ?? (c.text as string)
    ?? (c.body as string)
    ?? JSON.stringify(c);
}
