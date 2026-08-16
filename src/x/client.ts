import type { ActorInput, HttpPage, LoggerPort, XClientPort } from "../types.js";
import { buildSearchQuery, fetchWithRetry, HttpStatusError, publicWebBearer } from "./query.js";

const silentLog: LoggerPort = {
  info: () => undefined,
  warn: () => undefined,
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const FEATURES = {
  rweb_video_screen_enabled: false,
  rweb_cashtags_enabled: true,
  profile_label_improvements_pcf_label_in_post_enabled: true,
  responsive_web_profile_redirect_enabled: false,
  rweb_tipjar_consumption_enabled: false,
  verified_phone_label_enabled: false,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  premium_content_api_read_enabled: false,
  communities_web_enable_tweet_community_results_fetch: true,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  articles_preview_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: false,
  responsive_web_enhance_cards_enabled: false,
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function collectTweets(node: unknown, out: unknown[]): void {
  if (Array.isArray(node)) {
    for (const n of node) collectTweets(n, out);
    return;
  }
  const r = asRecord(node);
  if (!r) return;
  const result = asRecord(r.result);
  if (r.__typename === "Tweet" || result?.__typename === "Tweet" || r.legacy || result?.legacy) {
    if (r.rest_id || result?.rest_id || asRecord(r.legacy)?.id_str) {
      out.push(r);
      return;
    }
  }
  const tweetResults = asRecord(r.tweet_results)?.result;
  if (tweetResults) {
    out.push({ result: tweetResults });
  }
  for (const v of Object.values(r)) collectTweets(v, out);
}

function findCursor(node: unknown): string | null {
  if (Array.isArray(node)) {
    for (const n of node) {
      const c = findCursor(n);
      if (c) return c;
    }
    return null;
  }
  const r = asRecord(node);
  if (!r) return null;
  if (r.cursorType === "Bottom" && typeof r.value === "string") return r.value;
  for (const v of Object.values(r)) {
    const c = findCursor(v);
    if (c) return c;
  }
  return null;
}

const SEARCH_QUERY_IDS = [
  process.env.X_SEARCH_QUERY_ID,
  "Yw6L66Pw54NHKuq4Dp7b4Q",
  "ML-n2SfAxx5S_9QMqNejbg",
  "VhUd6vHVmLBcw0uX-6jMLA",
  "nK1dw4oV3k4w5TdtcAdSww",
].filter((id): id is string => Boolean(id));

function pageFromJson(json: unknown): HttpPage {
  const tweets: unknown[] = [];
  collectTweets(json, tweets);
  const unique: unknown[] = [];
  const seen = new Set<string>();
  for (const t of tweets) {
    const rec = asRecord(t);
    const result = rec ? asRecord(rec.result) : null;
    const id =
      (typeof rec?.rest_id === "string" && rec.rest_id) ||
      (typeof result?.rest_id === "string" && result.rest_id) ||
      "";
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    unique.push(t);
  }
  return { tweets: unique, nextCursor: findCursor(json) };
}

export class GuestXClient implements XClientPort {
  private guestToken: string | null = null;
  private queryId = SEARCH_QUERY_IDS[0] ?? "Yw6L66Pw54NHKuq4Dp7b4Q";

  public constructor(
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly log: LoggerPort = silentLog,
  ) {}

  private async activateGuest(): Promise<string> {
    if (this.guestToken) {
      this.log.info("guest token reused");
      return this.guestToken;
    }
    this.log.info("guest activate start", { url: "https://api.twitter.com/1.1/guest/activate.json" });
    const res = await fetchWithRetry(
      "https://api.twitter.com/1.1/guest/activate.json",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${publicWebBearer()}`,
          "User-Agent": UA,
        },
      },
      {
        onRetry: ({ status, attempt, waitMs }) => {
          this.log.warn("guest activate backoff", { status, attempt, waitMs });
        },
      },
    );
    if (!res.ok) {
      this.log.warn("guest activate failed", { status: res.status });
      throw new HttpStatusError(res.status, `guest activate HTTP ${res.status}`);
    }
    const body = (await res.json()) as { guest_token?: string };
    if (!body.guest_token) {
      this.log.warn("guest activate missing token");
      throw new Error("guest activate missing token");
    }
    this.guestToken = body.guest_token;
    this.log.info("guest activate ok");
    return this.guestToken;
  }

  private headers(token: string): Record<string, string> {
    return {
      Authorization: `Bearer ${publicWebBearer()}`,
      "x-guest-token": token,
      "User-Agent": UA,
      Accept: "application/json",
      "Content-Type": "application/json",
      "x-twitter-active-user": "yes",
      "x-twitter-client-language": "en",
    };
  }

  private searchGetUrl(queryId: string, variables: Record<string, unknown>): string {
    return (
      `https://x.com/i/api/graphql/${queryId}/SearchTimeline?` +
      `variables=${encodeURIComponent(JSON.stringify(variables))}` +
      `&features=${encodeURIComponent(JSON.stringify(FEATURES))}`
    );
  }

  private searchPostUrl(queryId: string): string {
    return `https://x.com/i/api/graphql/${queryId}/SearchTimeline`;
  }

  public async fetchPage(query: {
    input: ActorInput;
    cursor: string | null;
    product: "Latest" | "Top";
  }): Promise<HttpPage> {
    return this.fetchSearchPage(query);
  }

  private async fetchSearchPage(query: {
    input: ActorInput;
    cursor: string | null;
    product: "Latest" | "Top";
  }): Promise<HttpPage> {
    let token = await this.activateGuest();
    const q = buildSearchQuery(query.input);
    const variables: Record<string, unknown> = {
      rawQuery: q,
      count: 20,
      querySource: "typed_query",
      product: query.product,
      withGrokTranslatedBio: true,
    };
    if (query.cursor) variables.cursor = query.cursor;
    const postBody = JSON.stringify({ variables, features: FEATURES });

    this.log.info("search request", {
      operation: "SearchTimeline",
      product: query.product,
      queryLength: q.length,
      hasCursor: Boolean(query.cursor),
      queryIdCount: SEARCH_QUERY_IDS.length,
    });

    const tryIds = async (method: "GET" | "POST"): Promise<Response> => {
      let last: Response | undefined;
      for (const id of SEARCH_QUERY_IDS) {
        last =
          method === "GET"
            ? await this.fetchImpl(this.searchGetUrl(id, variables), { headers: this.headers(token) })
            : await this.fetchImpl(this.searchPostUrl(id), {
                method: "POST",
                headers: this.headers(token),
                body: postBody,
              });
        this.log.info("search response", { method, queryId: id, status: last.status });
        if (last.status !== 404) {
          this.queryId = id;
          return last;
        }
      }
      return last ?? new Response("not found", { status: 404 });
    };

    let res = await tryIds("GET");
    if (res.status === 404) {
      this.log.info("search GET all 404, trying POST");
      res = await tryIds("POST");
    }
    if (res.status === 403 || res.status === 401) {
      this.log.warn("search auth failed, rotating guest token", { status: res.status });
      this.guestToken = null;
      token = await this.activateGuest();
      res = await this.fetchImpl(this.searchGetUrl(this.queryId, variables), { headers: this.headers(token) });
      this.log.info("search retry after rotate", { status: res.status, queryId: this.queryId });
    }
    if (res.status === 429 || res.status >= 500) {
      this.log.warn("search server error", { status: res.status });
      throw new HttpStatusError(res.status, `HTTP ${res.status}`);
    }
    if (!res.ok) {
      this.log.warn("search failed", { status: res.status });
      throw new HttpStatusError(res.status, `HTTP ${res.status}`);
    }
    const page = pageFromJson(await res.json());
    this.log.info("search page parsed", {
      tweets: page.tweets.length,
      hasNextCursor: Boolean(page.nextCursor),
    });
    return page;
  }
}
