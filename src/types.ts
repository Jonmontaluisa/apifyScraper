export type MediaTypeFilter = "any" | "text_only" | "images" | "video" | "links";
export type SortBy = "latest" | "top";

export interface ActorInput {
  searchTerms: string[];
  fromUsers: string[];
  toUsers: string[];
  mentioning: string[];
  hashtags: string[];
  since: string | null;
  until: string | null;
  language: string | null;
  minLikes: number;
  minRetweets: number;
  minReplies: number;
  onlyVerified: boolean;
  mediaType: MediaTypeFilter;
  includeReplies: boolean;
  includeRetweets: boolean;
  sortBy: SortBy;
  maxResults: number;
}

export interface TweetMedia {
  type: "photo" | "video" | "animated_gif";
  url: string;
  thumbnail: string | null;
}

export interface TweetOutput {
  id: string;
  url: string;
  text: string;
  lang: string | null;
  createdAt: string;
  conversationId: string | null;
  isReply: boolean;
  isRetweet: boolean;
  isQuote: boolean;
  inReplyToId: string | null;
  quotedTweetId: string | null;
  author: {
    id: string;
    username: string;
    name: string;
    verified: boolean;
    followers: number;
    following: number;
  };
  metrics: {
    likes: number;
    retweets: number;
    replies: number;
    quotes: number;
    bookmarks: number | null;
    views: number | null;
  };
  entities: {
    hashtags: string[];
    mentions: string[];
    urls: string[];
    media: TweetMedia[];
  };
  source: string | null;
  scrapedAt: string;
}

/** Internal: extra field for toUsers filter; stripped before dataset write. */
export interface TweetRecord extends TweetOutput {
  inReplyToUsername: string | null;
}

export interface RunStats {
  requested: number;
  fetched: number;
  written: number;
  duplicatesDropped: number;
  filterDropped: number;
  limited: boolean;
  reason: "free_tier" | null;
  cap: number;
  errors: {
    http429: number;
    http403: number;
    fatal: number;
  };
}

export interface HttpPage {
  tweets: unknown[];
  nextCursor: string | null;
}

export interface XClientPort {
  fetchPage(query: {
    input: ActorInput;
    cursor: string | null;
    product: "Latest" | "Top";
  }): Promise<HttpPage>;
}

export interface EntitlementPort {
  isPaid(userId: string | null): Promise<boolean>;
}

export interface DatasetPort {
  push(item: TweetOutput): Promise<void>;
}

export interface OutputPort {
  set(stats: RunStats): Promise<void>;
}

export interface PersistState {
  cursor: string | null;
  seenIds: string[];
  written: number;
  fetched: number;
  duplicatesDropped: number;
  filterDropped: number;
  errors: RunStats["errors"];
}

export interface PersistPort {
  load(): Promise<PersistState | null>;
  save(state: PersistState): Promise<void>;
}

export interface LoggerPort {
  info(message: string, extra?: Record<string, unknown>): void;
  warn(message: string, extra?: Record<string, unknown>): void;
}
