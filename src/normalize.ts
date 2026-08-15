import type { TweetMedia, TweetOutput, TweetRecord } from "./types.js";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function intOrZero(value: unknown): number {
  const n = asNumber(value);
  return n === null ? 0 : Math.trunc(n);
}

function stripAt(value: string): string {
  return value.startsWith("@") ? value.slice(1) : value;
}

function stripHash(value: string): string {
  return value.startsWith("#") ? value.slice(1) : value;
}

function twitterDateToIso(createdAt: string): string {
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) {
    const asIso = new Date(createdAt.endsWith("Z") ? createdAt : `${createdAt}Z`);
    if (!Number.isNaN(asIso.getTime())) return asIso.toISOString();
    return new Date(0).toISOString();
  }
  return d.toISOString();
}

function unwrapUser(raw: unknown): Record<string, unknown> | null {
  const r = asRecord(raw);
  if (!r) return null;
  const results = asRecord(r.result);
  if (results) {
    const legacy = asRecord(results.legacy);
    const core = asRecord(results.core) ?? asRecord(results);
    return {
      ...legacy,
      ...core,
      rest_id: results.rest_id ?? r.rest_id,
      is_blue_verified: results.is_blue_verified ?? r.is_blue_verified,
      verified: legacy?.verified ?? results.verified,
    };
  }
  return r;
}

function mediaFromLegacy(legacy: Record<string, unknown>): TweetMedia[] {
  const entities = asRecord(legacy.extended_entities) ?? asRecord(legacy.entities);
  const media = entities ? (entities.media as unknown) : null;
  if (!Array.isArray(media)) return [];
  const out: TweetMedia[] = [];
  for (const item of media) {
    const m = asRecord(item);
    if (!m) continue;
    const typeRaw = asString(m.type) ?? "photo";
    const type: TweetMedia["type"] =
      typeRaw === "video" || typeRaw === "animated_gif" ? typeRaw : "photo";
    const url =
      asString(m.media_url_https) ??
      asString(m.media_url) ??
      asString(m.expanded_url) ??
      "";
    if (!url) continue;
    const video = asRecord(m.video_info);
    let videoUrl: string | null = null;
    if (video && Array.isArray(video.variants)) {
      const variants = video.variants
        .map((v) => asRecord(v))
        .filter((v): v is Record<string, unknown> => v !== null)
        .filter((v) => asString(v.content_type)?.includes("mp4"));
      const best = variants.sort(
        (a, b) => intOrZero(b.bitrate) - intOrZero(a.bitrate),
      )[0];
      videoUrl = best ? asString(best.url) : null;
    }
    out.push({
      type,
      url: type === "photo" ? url : (videoUrl ?? url),
      thumbnail: type === "photo" ? null : url,
    });
  }
  return out;
}

function hashtagsFrom(legacy: Record<string, unknown>): string[] {
  const entities = asRecord(legacy.entities);
  const tags = entities && Array.isArray(entities.hashtags) ? entities.hashtags : [];
  return tags
    .map((t) => asRecord(t))
    .map((t) => (t ? asString(t.text) : null))
    .filter((t): t is string => t !== null)
    .map(stripHash);
}

function mentionsFrom(legacy: Record<string, unknown>): string[] {
  const entities = asRecord(legacy.entities);
  const mentions = entities && Array.isArray(entities.user_mentions) ? entities.user_mentions : [];
  return mentions
    .map((t) => asRecord(t))
    .map((t) => (t ? asString(t.screen_name) : null))
    .filter((t): t is string => t !== null)
    .map(stripAt);
}

function urlsFrom(legacy: Record<string, unknown>): string[] {
  const entities = asRecord(legacy.entities);
  const urls = entities && Array.isArray(entities.urls) ? entities.urls : [];
  return urls
    .map((t) => asRecord(t))
    .map((t) => (t ? asString(t.expanded_url) ?? asString(t.url) : null))
    .filter((t): t is string => t !== null);
}

function expandText(text: string, urls: { short: string; expanded: string }[]): string {
  let out = text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  for (const u of urls) {
    out = out.split(u.short).join(u.expanded);
  }
  return out;
}

function urlPairs(legacy: Record<string, unknown>): { short: string; expanded: string }[] {
  const entities = asRecord(legacy.entities);
  const urls = entities && Array.isArray(entities.urls) ? entities.urls : [];
  const pairs: { short: string; expanded: string }[] = [];
  for (const item of urls) {
    const u = asRecord(item);
    if (!u) continue;
    const short = asString(u.url);
    const expanded = asString(u.expanded_url);
    if (short && expanded) pairs.push({ short, expanded });
  }
  return pairs;
}

export function toDatasetItem(record: TweetRecord): TweetOutput {
  const { inReplyToUsername: _drop, ...rest } = record;
  return rest;
}

export function normalizeTweet(raw: unknown, scrapedAt: string): TweetRecord | null {
  const root = asRecord(raw);
  if (!root) return null;

  const result = asRecord(root.result) ?? root;
  const legacy = asRecord(result.legacy) ?? result;
  const id =
    asString(result.rest_id) ??
    asString(legacy.id_str) ??
    asString(root.id_str) ??
    asString(root.id);
  if (!id) return null;

  const userRaw =
    asRecord(result.core)?.user_results ??
    asRecord(root.user) ??
    asRecord(legacy.user) ??
    asRecord(root.author);
  const user = unwrapUser(userRaw) ?? asRecord(userRaw) ?? {};
  const username = stripAt(
    asString(user.screen_name) ?? asString(user.username) ?? "unknown",
  );
  const name = asString(user.name) ?? username;
  const userId = asString(user.rest_id) ?? asString(user.id_str) ?? asString(user.id) ?? "";
  const verified = user.verified === true || user.is_blue_verified === true;

  const createdRaw =
    asString(legacy.created_at) ?? asString(root.createdAt) ?? asString(root.created_at);
  const createdAt = createdRaw ? twitterDateToIso(createdRaw) : scrapedAt;

  const isQuote = Boolean(legacy.is_quote_status) || Boolean(root.isQuote);
  const isRetweet = Boolean(
    asString(legacy.retweeted_status_id_str) ||
      asRecord(legacy.retweeted_status) ||
      asRecord(legacy.retweeted_status_result) ||
      root.isRetweet,
  );
  const inReplyToId =
    asString(legacy.in_reply_to_status_id_str) ?? asString(root.inReplyToId);
  const isReply = Boolean(inReplyToId) || Boolean(root.isReply);
  const quotedTweetId =
    asString(legacy.quoted_status_id_str) ?? asString(root.quotedTweetId);

  const textRaw =
    asString(legacy.full_text) ??
    asString(legacy.text) ??
    asString(root.text) ??
    "";
  const text = expandText(textRaw, urlPairs(legacy));

  const viewsCount =
    asNumber(asRecord(result.views)?.count) ?? asNumber(root.views) ?? null;
  const bookmarks =
    asNumber(legacy.bookmark_count) ?? asNumber(root.bookmarks) ?? null;

  const record: TweetRecord = {
    id: String(id),
    url: `https://x.com/${username}/status/${id}`,
    text,
    lang: asString(legacy.lang) ?? asString(root.lang),
    createdAt,
    conversationId:
      asString(legacy.conversation_id_str) ?? asString(root.conversationId) ?? String(id),
    isReply,
    isRetweet,
    isQuote,
    inReplyToId,
    quotedTweetId,
    author: {
      id: String(userId),
      username,
      name,
      verified: Boolean(verified),
      followers: intOrZero(user.followers_count ?? asRecord(user.legacy)?.followers_count),
      following: intOrZero(user.friends_count ?? asRecord(user.legacy)?.friends_count),
    },
    metrics: {
      likes: intOrZero(legacy.favorite_count ?? root.likes),
      retweets: intOrZero(legacy.retweet_count ?? root.retweets),
      replies: intOrZero(legacy.reply_count ?? root.replies),
      quotes: intOrZero(legacy.quote_count ?? root.quotes),
      bookmarks,
      views: viewsCount === null ? null : Math.trunc(viewsCount),
    },
    entities: {
      hashtags: hashtagsFrom(legacy).length ? hashtagsFrom(legacy) : Array.isArray(root.hashtags)
        ? (root.hashtags as unknown[]).map(String).map(stripHash)
        : [],
      mentions: mentionsFrom(legacy).length ? mentionsFrom(legacy) : Array.isArray(root.mentions)
        ? (root.mentions as unknown[]).map(String).map(stripAt)
        : [],
      urls: urlsFrom(legacy).length ? urlsFrom(legacy) : Array.isArray(root.urls)
        ? (root.urls as unknown[]).map(String)
        : [],
      media: mediaFromLegacy(legacy),
    },
    source: asString(legacy.source)?.replace(/<[^>]+>/g, "") ?? asString(root.source),
    scrapedAt,
    inReplyToUsername:
      asString(legacy.in_reply_to_screen_name) ?? asString(root.inReplyToUsername),
  };
  return record;
}

export const TWEET_OUTPUT_KEYS: (keyof TweetOutput)[] = [
  "id",
  "url",
  "text",
  "lang",
  "createdAt",
  "conversationId",
  "isReply",
  "isRetweet",
  "isQuote",
  "inReplyToId",
  "quotedTweetId",
  "author",
  "metrics",
  "entities",
  "source",
  "scrapedAt",
];
