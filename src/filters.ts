import type { ActorInput, TweetRecord } from "./types.js";

export function stripHandle(value: string): string {
  const t = value.trim();
  return t.startsWith("@") ? t.slice(1) : t;
}

export function stripHash(value: string): string {
  const t = value.trim();
  return t.startsWith("#") ? t.slice(1) : t;
}

function lower(value: string): string {
  return value.toLowerCase();
}

function startOfDayUtc(date: string): number {
  return Date.parse(`${date}T00:00:00.000Z`);
}

function endOfDayUtc(date: string): number {
  return Date.parse(`${date}T23:59:59.999Z`);
}

function hasSearchTerm(text: string, terms: string[]): boolean {
  if (terms.length === 0) return true;
  const hay = lower(text);
  return terms.some((t) => hay.includes(lower(t)));
}

function authorIn(username: string, users: string[]): boolean {
  if (users.length === 0) return true;
  const u = lower(stripHandle(username));
  return users.some((x) => lower(stripHandle(x)) === u);
}

function allHashtags(tweetTags: string[], required: string[]): boolean {
  if (required.length === 0) return true;
  const have = new Set(tweetTags.map((t) => lower(stripHash(t))));
  return required.every((r) => have.has(lower(stripHash(r))));
}

function mentionsIntersect(tweetMentions: string[], required: string[]): boolean {
  if (required.length === 0) return true;
  const have = new Set(tweetMentions.map((t) => lower(stripHandle(t))));
  return required.some((r) => have.has(lower(stripHandle(r))));
}

function mediaOk(tweet: TweetRecord, mediaType: ActorInput["mediaType"]): boolean {
  const media = tweet.entities.media;
  const urls = tweet.entities.urls;
  if (mediaType === "any") return true;
  if (mediaType === "text_only") return media.length === 0 && urls.length === 0;
  if (mediaType === "images") return media.some((m) => m.type === "photo" || m.type === "animated_gif");
  if (mediaType === "video") return media.some((m) => m.type === "video");
  return urls.length >= 1;
}

export function matchesFilters(input: ActorInput, tweet: TweetRecord): boolean {
  if (!hasSearchTerm(tweet.text, input.searchTerms)) return false;
  if (!authorIn(tweet.author.username, input.fromUsers)) return false;
  if (!allHashtags(tweet.entities.hashtags, input.hashtags)) return false;
  if (input.language && tweet.lang !== input.language) return false;
  if (tweet.metrics.likes < input.minLikes) return false;
  if (tweet.metrics.retweets < input.minRetweets) return false;
  if (tweet.metrics.replies < input.minReplies) return false;
  if (input.onlyVerified && !tweet.author.verified) return false;
  if (!input.includeReplies && tweet.isReply) return false;
  if (!input.includeRetweets && tweet.isRetweet) return false;
  if (!mediaOk(tweet, input.mediaType)) return false;
  if (input.toUsers.length > 0) {
    if (!tweet.isReply || !tweet.inReplyToUsername) return false;
    if (!authorIn(tweet.inReplyToUsername, input.toUsers)) return false;
  }
  if (!mentionsIntersect(tweet.entities.mentions, input.mentioning)) return false;
  const created = Date.parse(tweet.createdAt);
  if (Number.isNaN(created)) return false;
  if (input.since && created < startOfDayUtc(input.since)) return false;
  if (input.until && created > endOfDayUtc(input.until)) return false;
  return true;
}
