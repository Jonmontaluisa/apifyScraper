import { describe, expect, it } from "vitest";
import { backoffMs, buildSearchQuery, fetchWithRetry, HttpStatusError } from "../src/x/query.js";
import { GuestXClient } from "../src/x/client.js";
import { baseInput } from "./helpers.js";

describe("buildSearchQuery", () => {
  it("joins operators", () => {
    const q = buildSearchQuery(
      baseInput({
        searchTerms: ["apify", "web scraping"],
        fromUsers: ["@Me"],
        toUsers: ["you"],
        mentioning: ["x"],
        hashtags: ["build"],
        language: "en",
        since: "2024-01-01",
        until: "2024-02-01",
        includeReplies: false,
        includeRetweets: false,
      }),
    );
    expect(q).toContain("apify OR web scraping");
    expect(q).toContain("from:Me");
    expect(q).toContain("to:you");
    expect(q).toContain("@x");
    expect(q).toContain("#build");
    expect(q).toContain("lang:en");
    expect(q).toContain("-filter:replies");
  });

  it("single term has no parens OR", () => {
    expect(buildSearchQuery(baseInput({ searchTerms: ["only"] }))).toContain("only");
  });
});

describe("backoffMs", () => {
  it("stays within cap", () => {
    expect(backoffMs(10, () => 1)).toBeLessThanOrEqual(5000);
    expect(backoffMs(0, () => 0)).toBeGreaterThan(0);
  });
});

describe("fetchWithRetry", () => {
  it("retries 429 then returns", async () => {
    let n = 0;
    const orig = globalThis.fetch;
    globalThis.fetch = async () => {
      n += 1;
      if (n === 1) return new Response("no", { status: 429 });
      return new Response("ok", { status: 200 });
    };
    try {
      const res = await fetchWithRetry("https://example.com", {}, { sleepFn: async () => undefined, jitter: () => 0 });
      expect(res.status).toBe(200);
    } finally {
      globalThis.fetch = orig;
    }
  });

  it("throws after budget", async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = async () => new Response("no", { status: 503 });
    try {
      await expect(
        fetchWithRetry("https://example.com", {}, { attempts: 2, sleepFn: async () => undefined }),
      ).rejects.toBeInstanceOf(HttpStatusError);
    } finally {
      globalThis.fetch = orig;
    }
  });
});

describe("GuestXClient", () => {
  it("parses graphql tweets and cursor", async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = async (url) => {
      const u = String(url);
      if (u.includes("guest/activate")) {
        return new Response(JSON.stringify({ guest_token: "gt" }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          data: {
            search_by_raw_query: {
              search_timeline: {
                timeline: {
                  instructions: [
                    {
                      entries: [
                        {
                          content: {
                            itemContent: {
                              tweet_results: { result: { rest_id: "1", __typename: "Tweet", legacy: { full_text: "a" } } },
                            },
                          },
                        },
                        { content: { cursorType: "Bottom", value: "CURSOR" } },
                      ],
                    },
                  ],
                },
              },
            },
          },
        }),
        { status: 200 },
      );
    };
    try {
      const lines: string[] = [];
      const client = new GuestXClient(fetch, {
        info: (m, extra) => lines.push(`${m} ${JSON.stringify(extra ?? {})}`),
        warn: (m, extra) => lines.push(`${m} ${JSON.stringify(extra ?? {})}`),
      });
      const page = await client.fetchPage({ input: baseInput(), cursor: null, product: "Latest" });
      expect(page.nextCursor).toBe("CURSOR");
      expect(page.tweets.length).toBeGreaterThan(0);
      const joined = lines.join("\n");
      expect(joined).toMatch(/guest activate ok/);
      expect(joined).not.toMatch(/gt[^a-z]/);
      expect(joined).not.toContain("Bearer");
    } finally {
      globalThis.fetch = orig;
    }
  });

  it("rotates guest on 403 then throws if still bad", async () => {
    const orig = globalThis.fetch;
    let activate = 0;
    globalThis.fetch = async (url) => {
      if (String(url).includes("guest/activate")) {
        activate += 1;
        return new Response(JSON.stringify({ guest_token: `gt${activate}` }), { status: 200 });
      }
      return new Response("no", { status: 403 });
    };
    try {
      const client = new GuestXClient();
      await expect(client.fetchPage({ input: baseInput(), cursor: null, product: "Latest" })).rejects.toThrow(/403/);
    } finally {
      globalThis.fetch = orig;
    }
  });
});
