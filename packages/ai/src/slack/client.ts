const SLACK_POST_MESSAGE_URL = "https://slack.com/api/chat.postMessage";
const SLACK_CONVERSATIONS_LIST_URL = "https://slack.com/api/conversations.list";
const SLACK_CONVERSATIONS_JOIN_URL = "https://slack.com/api/conversations.join";
const SLACK_CONVERSATIONS_CREATE_URL = "https://slack.com/api/conversations.create";

/** A Slack Block Kit block (simplified - we only use section, divider, context, actions). */
interface SlackBlock {
  type: string;
  text?: { type: string; text: string; emoji?: boolean };
  fields?: Array<{ type: string; text: string }>;
  elements?: Array<Record<string, unknown>>;
  accessory?: Record<string, unknown>;
  block_id?: string;
}

interface PostMessageParams {
  token: string;
  channel: string;
  text: string;
  blocks?: SlackBlock[];
  unfurlLinks?: boolean;
}

interface PostMessageResult {
  channelId: string;
  messageTs: string;
}

/** Post a message to a Slack channel using the Web API. */
export async function postMessage(params: PostMessageParams): Promise<PostMessageResult> {
  const body: Record<string, unknown> = {
    channel: params.channel,
    text: params.text, // Fallback for notifications
    unfurl_links: params.unfurlLinks ?? false,
  };
  if (params.blocks) body.blocks = params.blocks;

  const response = await fetch(SLACK_POST_MESSAGE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });

  const data = (await response.json()) as {
    ok: boolean;
    error?: string;
    channel?: string;
    ts?: string;
  };

  if (!data.ok) {
    throw new Error(`Slack postMessage failed: ${data.error ?? "unknown"}`);
  }

  return {
    channelId: data.channel ?? params.channel,
    messageTs: data.ts ?? "",
  };
}

interface ChannelInfo {
  id: string;
  name: string;
}

/** Find a channel by name. Returns null if not found. */
export async function findChannel(token: string, channelName: string): Promise<ChannelInfo | null> {
  // Strip leading # if present
  const name = channelName.replace(/^#/, "");
  let cursor: string | undefined;

  // Paginate through channels to find the match
  for (let page = 0; page < 10; page++) {
    const params = new URLSearchParams({ types: "public_channel", limit: "200" });
    if (cursor) params.set("cursor", cursor);

    const response = await fetch(`${SLACK_CONVERSATIONS_LIST_URL}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30_000),
    });

    const data = (await response.json()) as {
      ok: boolean;
      channels?: Array<{ id: string; name: string }>;
      response_metadata?: { next_cursor?: string };
    };

    if (!data.ok || !data.channels) break;

    const match = data.channels.find((ch) => ch.name === name);
    if (match) return { id: match.id, name: match.name };

    cursor = data.response_metadata?.next_cursor;
    if (!cursor) break;
  }

  return null;
}

/** Create a public channel. Returns channel info. */
export async function createChannel(token: string, channelName: string): Promise<ChannelInfo> {
  const response = await fetch(SLACK_CONVERSATIONS_CREATE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({ name: channelName, is_private: false }),
    signal: AbortSignal.timeout(30_000),
  });

  const data = (await response.json()) as {
    ok: boolean;
    error?: string;
    channel?: { id: string; name: string };
  };

  if (!data.ok) {
    // "name_taken" means channel already exists - find it instead
    if (data.error === "name_taken") {
      const existing = await findChannel(token, channelName);
      if (existing) return existing;
    }
    throw new Error(`Slack createChannel failed: ${data.error ?? "unknown"}`);
  }

  return { id: data.channel!.id, name: data.channel!.name };
}

/** Join a channel (bot must join before posting). */
export async function joinChannel(token: string, channelId: string): Promise<void> {
  const response = await fetch(SLACK_CONVERSATIONS_JOIN_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({ channel: channelId }),
    signal: AbortSignal.timeout(30_000),
  });

  const data = (await response.json()) as { ok: boolean; error?: string };

  // "already_in_channel" is fine
  if (!data.ok && data.error !== "already_in_channel") {
    throw new Error(`Slack joinChannel failed: ${data.error ?? "unknown"}`);
  }
}

/**
 * Ensure the #beast-team channel exists and the bot has joined it.
 * Returns the channel ID for storage in connector metadata.
 */
export async function ensureBeastChannel(token: string): Promise<ChannelInfo> {
  const channelName = "beast-team";

  // Try to find existing channel first
  let channel = await findChannel(token, channelName);

  if (!channel) {
    channel = await createChannel(token, channelName);
  }

  await joinChannel(token, channel.id);
  return channel;
}
