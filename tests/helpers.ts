import type { ActorInput, TweetRecord } from "../src/types.js";

const defaultAuthor = {
  id: "10",
  username: "alice",
  name: "Alice",
  verified: false,
  followers: 1,
  following: 1,
};

const defaultMetrics = {
  likes: 0,
  retweets: 0,
  replies: 0,
  quotes: 0,
  bookmarks: null as number | null,
  views: null as number | null,
};

const defaultEntities = { hashtags: [] as string[], mentions: [] as string[], urls: [] as string[], media: [] as TweetRecord["entities"]["media"] };

export function baseInput(over: Partial<ActorInput> = {}): ActorInput {
  return {
    searchTerms: ["hello"],
    fromUsers: [],
    toUsers: [],
    mentioning: [],
    hashtags: [],
    since: null,
    until: null,
    language: null,
    minLikes: 0,
    minRetweets: 0,
    minReplies: 0,
    onlyVerified: false,
    mediaType: "any",
    includeReplies: true,
    includeRetweets: false,
    sortBy: "latest",
    maxResults: 10,
    ...over,
  };
}

export function baseTweet(over: Partial<TweetRecord> = {}): TweetRecord {
  const base: TweetRecord = {
    id: "1",
    url: "https://x.com/alice/status/1",
    text: "hello world",
    lang: "en",
    createdAt: "2024-02-01T12:00:00.000Z",
    conversationId: "1",
    isReply: false,
    isRetweet: false,
    isQuote: false,
    inReplyToId: null,
    quotedTweetId: null,
    author: { ...defaultAuthor },
    metrics: { ...defaultMetrics },
    entities: { ...defaultEntities, media: [] },
    source: null,
    scrapedAt: "2024-03-20T09:12:00.000Z",
    inReplyToUsername: null,
  };
  return {
    ...base,
    ...over,
    author: { ...base.author, ...over.author },
    metrics: { ...base.metrics, ...over.metrics },
    entities: { ...base.entities, ...over.entities },
  };
}

export function graphqlLikeTweet(over: Record<string, unknown> = {}): unknown {
  return {
    rest_id: "1770000000000000001",
    legacy: {
      full_text: "We just shipped a faster proxy rotation for Actors. Details: https://t.co/abc",
      created_at: "Tue Mar 19 14:05:22 +0000 2024",
      conversation_id_str: "1770000000000000001",
      lang: "en",
      favorite_count: 182,
      retweet_count: 34,
      reply_count: 12,
      quote_count: 3,
      bookmark_count: 41,
      source: '<a href="https://x.com">Twitter Web App</a>',
      entities: {
        hashtags: [],
        user_mentions: [],
        urls: [
          {
            url: "https://t.co/abc",
            expanded_url: "https://apify.com/changelog",
          },
        ],
      },
    },
    views: { count: "25890" },
    core: {
      user_results: {
        result: {
          rest_id: "123456",
          is_blue_verified: true,
          legacy: {
            screen_name: "apify",
            name: "Apify",
            followers_count: 21400,
            friends_count: 310,
            verified: true,
          },
        },
      },
    },
    ...over,
  };
}
