import { describe, expect, it } from "vitest";
import { matchesFilters } from "../src/filters.js";
import { baseInput, baseTweet } from "./helpers.js";

describe("matchesFilters", () => {
  it("ORs searchTerms", () => {
    expect(
      matchesFilters(baseInput({ searchTerms: ["apify", "web scraping"] }), baseTweet({ text: "I love apify" })),
    ).toBe(true);
  });

  it("ANDs language and hashtag", () => {
    expect(
      matchesFilters(
        baseInput({ searchTerms: [], hashtags: ["buildinpublic"], language: "en" }),
        baseTweet({ lang: "es", entities: { hashtags: ["buildinpublic"], mentions: [], urls: [], media: [] } }),
      ),
    ).toBe(false);
  });

  it("drops retweets when includeRetweets false", () => {
    expect(matchesFilters(baseInput({ includeRetweets: false }), baseTweet({ isRetweet: true }))).toBe(false);
  });

  it("keeps replies when includeReplies true", () => {
    expect(
      matchesFilters(
        baseInput({ includeReplies: true }),
        baseTweet({ isReply: true, inReplyToId: "9", inReplyToUsername: "bob" }),
      ),
    ).toBe(true);
  });

  it("drops replies when includeReplies false", () => {
    expect(matchesFilters(baseInput({ includeReplies: false }), baseTweet({ isReply: true }))).toBe(false);
  });

  it("applies minLikes", () => {
    expect(matchesFilters(baseInput({ minLikes: 25 }), baseTweet({ metrics: { likes: 10, retweets: 0, replies: 0, quotes: 0, bookmarks: null, views: null } }))).toBe(false);
  });

  it("inclusive since until", () => {
    expect(
      matchesFilters(
        baseInput({ since: "2024-01-01", until: "2024-03-31" }),
        baseTweet({ createdAt: "2024-01-01T00:00:00.000Z" }),
      ),
    ).toBe(true);
    expect(
      matchesFilters(
        baseInput({ until: "2024-03-31" }),
        baseTweet({ createdAt: "2024-03-31T23:59:59.999Z" }),
      ),
    ).toBe(true);
  });

  it("empty fromUsers does not constrain author", () => {
    expect(matchesFilters(baseInput({ fromUsers: [], searchTerms: ["hello"] }), baseTweet({ text: "hello" }))).toBe(
      true,
    );
  });

  it("keeps quotes when includeRetweets false", () => {
    expect(matchesFilters(baseInput({ includeRetweets: false }), baseTweet({ isQuote: true, isRetweet: false }))).toBe(
      true,
    );
  });

  it("fromUsers strips @ and is case-insensitive", () => {
    expect(
      matchesFilters(
        baseInput({ searchTerms: [], fromUsers: ["@Alice"] }),
        baseTweet({ author: { id: "10", username: "alice", name: "A", verified: false, followers: 1, following: 1 } }),
      ),
    ).toBe(true);
  });

  it("toUsers requires reply to listed handle", () => {
    expect(
      matchesFilters(
        baseInput({ toUsers: ["bob"] }),
        baseTweet({ isReply: true, inReplyToUsername: "bob", inReplyToId: "2" }),
      ),
    ).toBe(true);
    expect(matchesFilters(baseInput({ toUsers: ["bob"] }), baseTweet({ isReply: false }))).toBe(false);
  });

  it("mentioning intersects", () => {
    expect(
      matchesFilters(
        baseInput({ mentioning: ["bob"] }),
        baseTweet({ entities: { hashtags: [], mentions: ["bob"], urls: [], media: [] } }),
      ),
    ).toBe(true);
  });

  it("onlyVerified", () => {
    expect(matchesFilters(baseInput({ onlyVerified: true }), baseTweet())).toBe(false);
  });

  it("mediaType images and text_only and links and video", () => {
    const photo = baseTweet({
      entities: {
        hashtags: [],
        mentions: [],
        urls: [],
        media: [{ type: "photo", url: "https://p.t/x.jpg", thumbnail: null }],
      },
    });
    expect(matchesFilters(baseInput({ mediaType: "images" }), photo)).toBe(true);
    expect(matchesFilters(baseInput({ mediaType: "text_only" }), photo)).toBe(false);
    expect(matchesFilters(baseInput({ mediaType: "text_only" }), baseTweet())).toBe(true);
    expect(
      matchesFilters(
        baseInput({ mediaType: "links" }),
        baseTweet({ entities: { hashtags: [], mentions: [], urls: ["https://a.com"], media: [] } }),
      ),
    ).toBe(true);
    expect(
      matchesFilters(
        baseInput({ mediaType: "video" }),
        baseTweet({
          entities: {
            hashtags: [],
            mentions: [],
            urls: [],
            media: [{ type: "video", url: "https://v", thumbnail: "https://t" }],
          },
        }),
      ),
    ).toBe(true);
  });

  it("minRetweets and minReplies", () => {
    expect(
      matchesFilters(
        baseInput({ minRetweets: 2 }),
        baseTweet({ metrics: { likes: 0, retweets: 1, replies: 0, quotes: 0, bookmarks: null, views: null } }),
      ),
    ).toBe(false);
    expect(
      matchesFilters(
        baseInput({ minReplies: 2 }),
        baseTweet({ metrics: { likes: 0, retweets: 0, replies: 1, quotes: 0, bookmarks: null, views: null } }),
      ),
    ).toBe(false);
  });

  it("drops invalid createdAt", () => {
    expect(matchesFilters(baseInput(), baseTweet({ createdAt: "nope" }))).toBe(false);
  });
});
