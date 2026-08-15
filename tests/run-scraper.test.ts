import { describe, expect, it } from "vitest";
import { runScraper } from "../src/run-scraper.js";
import type { HttpPage, PersistState, RunStats, TweetOutput } from "../src/types.js";
import { graphqlLikeTweet } from "./helpers.js";

function tweets(n: number): unknown[] {
  return Array.from({ length: n }, (_, i) =>
    graphqlLikeTweet({
      rest_id: String(i + 1),
      legacy: {
        ...(graphqlLikeTweet() as { legacy: Record<string, unknown> }).legacy,
        full_text: `hello ${i} apify`,
        favorite_count: 30,
      },
    }),
  );
}

function makeRun(opts: {
  rawInput: unknown;
  userId: string | null;
  paidIds?: string[];
  pages: HttpPage[];
  throwOnStore?: boolean;
  failFirst?: number;
}) {
  const pushed: TweetOutput[] = [];
  let outputs: RunStats | null = null;
  let state: PersistState | null = null;
  let calls = 0;
  const pages = [...opts.pages];
  return {
    pushed,
    get output() {
      return outputs;
    },
    run: () =>
      runScraper({
        rawInput: opts.rawInput,
        userId: opts.userId,
        entitlement: {
          isPaid: async (id) => {
            if (opts.throwOnStore) throw new Error("kv");
            return Boolean(id && opts.paidIds?.includes(id));
          },
        },
        http: {
          fetchPage: async () => {
            calls += 1;
            if (opts.failFirst && calls <= opts.failFirst) {
              throw new Error("HTTP 429");
            }
            return pages.shift() ?? { tweets: [], nextCursor: null };
          },
        },
        dataset: { push: async (item) => { pushed.push(item); } },
        output: { set: async (s) => { outputs = s; } },
        persist: {
          load: async () => state,
          save: async (s) => { state = s; },
        },
        now: () => new Date("2024-03-20T09:12:00.000Z"),
        log: { info: () => undefined, warn: () => undefined },
      }),
  };
}

describe("runScraper cap", () => {
  it("free user maxResults 1000 writes 10", async () => {
    const ctx = makeRun({
      rawInput: { searchTerms: ["apify"], maxResults: 1000, minLikes: 0 },
      userId: "free",
      pages: [{ tweets: tweets(50), nextCursor: null }],
    });
    const stats = await ctx.run();
    expect(ctx.pushed).toHaveLength(10);
    expect(stats.limited).toBe(true);
    expect(stats.reason).toBe("free_tier");
    expect(stats.cap).toBe(10);
  });

  it("paid owner writes maxResults", async () => {
    const ctx = makeRun({
      rawInput: { searchTerms: ["apify"], maxResults: 40 },
      userId: "owner",
      paidIds: ["owner"],
      pages: [{ tweets: tweets(50), nextCursor: null }],
    });
    const stats = await ctx.run();
    expect(ctx.pushed).toHaveLength(40);
    expect(stats.limited).toBe(false);
  });

  it("ignores paid flag in input", async () => {
    const ctx = makeRun({
      rawInput: { searchTerms: ["apify"], maxResults: 1000, paid: true, userId: "owner-id" },
      userId: "free",
      paidIds: ["owner-id"],
      pages: [{ tweets: tweets(50), nextCursor: null }],
    });
    await ctx.run();
    expect(ctx.pushed).toHaveLength(10);
  });

  it("fail-closed when store throws", async () => {
    const ctx = makeRun({
      rawInput: { searchTerms: ["apify"], maxResults: 1000 },
      userId: "owner",
      paidIds: ["owner"],
      throwOnStore: true,
      pages: [{ tweets: tweets(50), nextCursor: null }],
    });
    await ctx.run();
    expect(ctx.pushed).toHaveLength(10);
  });

  it("extra fields do not raise cap", async () => {
    const ctx = makeRun({
      rawInput: { searchTerms: ["apify"], maxResults: 1000, limit: 999, bypassCap: true },
      userId: "free",
      pages: [{ tweets: tweets(50), nextCursor: null }],
    });
    await ctx.run();
    expect(ctx.pushed).toHaveLength(10);
  });

  it("free maxResults 3 writes 3 and limited false", async () => {
    const ctx = makeRun({
      rawInput: { searchTerms: ["apify"], maxResults: 3 },
      userId: "free",
      pages: [{ tweets: tweets(50), nextCursor: null }],
    });
    const stats = await ctx.run();
    expect(ctx.pushed).toHaveLength(3);
    expect(stats.limited).toBe(false);
  });

  it("does not crash on 429 then success", async () => {
    const ctx = makeRun({
      rawInput: { searchTerms: ["apify"], maxResults: 1 },
      userId: "owner",
      paidIds: ["owner"],
      failFirst: 1,
      pages: [{ tweets: tweets(5), nextCursor: null }],
    });
    await expect(ctx.run()).resolves.toBeTruthy();
    expect(ctx.pushed).toHaveLength(1);
  });

  it("dedups ids across pages", async () => {
    const dup = tweets(1);
    const ctx = makeRun({
      rawInput: { searchTerms: ["apify"], maxResults: 10 },
      userId: "owner",
      paidIds: ["owner"],
      pages: [
        { tweets: dup, nextCursor: "c2" },
        { tweets: dup, nextCursor: null },
      ],
    });
    await ctx.run();
    expect(ctx.pushed.filter((t) => t.id === "1")).toHaveLength(1);
  });

  it("empty result set does not throw", async () => {
    const ctx = makeRun({
      rawInput: { searchTerms: ["apify"], maxResults: 10 },
      userId: "owner",
      paidIds: ["owner"],
      pages: [{ tweets: [], nextCursor: null }],
    });
    const stats = await ctx.run();
    expect(ctx.pushed).toHaveLength(0);
    expect(stats.written).toBe(0);
  });

  it("pages until cursor exhausted with empty page", async () => {
    const ctx = makeRun({
      rawInput: { searchTerms: ["apify"], maxResults: 2 },
      userId: "owner",
      paidIds: ["owner"],
      pages: [
        { tweets: [], nextCursor: "c1" },
        { tweets: tweets(2), nextCursor: null },
      ],
    });
    await ctx.run();
    expect(ctx.pushed.length).toBeGreaterThan(0);
  });

  it("drops tweets that fail filters and un-normalizable rows", async () => {
    const ctx = makeRun({
      rawInput: { searchTerms: ["nomatch"], maxResults: 10 },
      userId: "owner",
      paidIds: ["owner"],
      pages: [{ tweets: [{ nope: true }, ...tweets(2)], nextCursor: null }],
    });
    const stats = await ctx.run();
    expect(ctx.pushed).toHaveLength(0);
    expect(stats.filterDropped).toBeGreaterThan(0);
  });

  it("counts 403 errors", async () => {
    const ctx = makeRun({
      rawInput: { searchTerms: ["apify"], maxResults: 1 },
      userId: "owner",
      paidIds: ["owner"],
      pages: [{ tweets: tweets(1), nextCursor: null }],
    });
    const orig = ctx.run;
    void orig;
    let calls = 0;
    const pushed: TweetOutput[] = [];
    const stats = await runScraper({
      rawInput: { searchTerms: ["apify"], maxResults: 1 },
      userId: "owner",
      entitlement: { isPaid: async () => true },
      http: {
        fetchPage: async () => {
          calls += 1;
          if (calls === 1) throw new Error("HTTP 403");
          return { tweets: tweets(1), nextCursor: null };
        },
      },
      dataset: { push: async (item) => { pushed.push(item); } },
      output: { set: async () => undefined },
      persist: { load: async () => null, save: async () => undefined },
      now: () => new Date("2024-03-20T09:12:00.000Z"),
      log: { info: () => undefined, warn: () => undefined },
    });
    expect(stats.errors.http403).toBe(1);
    expect(pushed.length).toBe(1);
  });

  it("fatal persist error is swallowed into stats", async () => {
    await expect(
      runScraper({
        rawInput: { searchTerms: ["apify"], maxResults: 1 },
        userId: "owner",
        entitlement: { isPaid: async () => true },
        http: { fetchPage: async () => ({ tweets: tweets(1), nextCursor: "x" }) },
        dataset: { push: async () => undefined },
        output: { set: async () => undefined },
        persist: {
          load: async () => null,
          save: async () => {
            throw new Error("disk");
          },
        },
        now: () => new Date("2024-03-20T09:12:00.000Z"),
        log: { info: () => undefined, warn: () => undefined },
      }),
    ).resolves.toMatchObject({ errors: { fatal: 1 } });
  });

  it("rejects invalid input before push", async () => {
    const ctx = makeRun({
      rawInput: { searchTerms: [], fromUsers: [], hashtags: [], maxResults: 10 },
      userId: "free",
      pages: [{ tweets: tweets(5), nextCursor: null }],
    });
    await expect(ctx.run()).rejects.toThrow();
    expect(ctx.pushed).toHaveLength(0);
  });
});

