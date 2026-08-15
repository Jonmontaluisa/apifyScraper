import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeTweet, toDatasetItem, TWEET_OUTPUT_KEYS } from "../src/normalize.js";
import { graphqlLikeTweet } from "./helpers.js";

const require = createRequire(import.meta.url);
const Ajv = require("ajv") as new (opts?: object) => { compile: (schema: object) => (data: unknown) => boolean };
const addFormats = require("ajv-formats") as (ajv: unknown) => void;

const schema = JSON.parse(
  readFileSync(new URL("../schema/tweet-output.json", import.meta.url), "utf8"),
) as { $schema?: string };
delete schema.$schema;
const ajv = new Ajv({ strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

describe("normalizeTweet", () => {
  it("fills all keys and nulls", () => {
    const t = normalizeTweet(
      {
        id_str: "99",
        text: "hi",
        created_at: "2024-03-19T14:05:22.000Z",
        user: { id_str: "1", screen_name: "apify", name: "Apify" },
      },
      "2024-03-20T09:12:00.000Z",
    );
    expect(t).not.toBeNull();
    if (!t) return;
    for (const k of TWEET_OUTPUT_KEYS) {
      expect(t[k] === undefined).toBe(false);
    }
    expect(t.lang).toBeNull();
    expect(t.metrics.bookmarks).toBeNull();
    expect(t.metrics.views).toBeNull();
    expect(t.source).toBeNull();
    expect(t.entities.media).toEqual([]);
    expect(typeof t.id).toBe("string");
    expect(validate(toDatasetItem(t))).toBe(true);
  });

  it("builds url and expands t.co", () => {
    const t = normalizeTweet(graphqlLikeTweet(), "2024-03-20T09:12:00.000Z");
    expect(t?.url).toBe("https://x.com/apify/status/1770000000000000001");
    expect(t?.entities.urls).toContain("https://apify.com/changelog");
    expect(t?.text).toContain("https://apify.com/changelog");
    expect(t?.id).toBe("1770000000000000001");
    expect(t?.author.verified).toBe(true);
    expect(t?.metrics.views).toBe(25890);
    expect(t?.source).toBe("Twitter Web App");
    expect(validate(toDatasetItem(t!))).toBe(true);
  });

  it("returns null without id", () => {
    expect(normalizeTweet({ text: "x" }, "2024-01-01T00:00:00.000Z")).toBeNull();
    expect(normalizeTweet(null, "2024-01-01T00:00:00.000Z")).toBeNull();
  });

  it("maps media variants", () => {
    const t = normalizeTweet(
      {
        id_str: "2",
        text: "v",
        created_at: "Wed Mar 19 14:05:22 +0000 2024",
        user: { screen_name: "a", id_str: "1", name: "A" },
        extended_entities: {
          media: [
            {
              type: "video",
              media_url_https: "https://p.twimg.com/thumb.jpg",
              video_info: {
                variants: [
                  { content_type: "video/mp4", bitrate: 100, url: "https://v/low.mp4" },
                  { content_type: "video/mp4", bitrate: 900, url: "https://v/high.mp4" },
                ],
              },
            },
          ],
        },
      },
      "2024-03-20T09:12:00.000Z",
    );
    expect(t?.entities.media[0]?.type).toBe("video");
    expect(t?.entities.media[0]?.url).toBe("https://v/high.mp4");
  });

  it("uses root-level entity arrays", () => {
    const t = normalizeTweet(
      {
        id: "5",
        text: "hi",
        createdAt: "not-a-date",
        lang: "en",
        hashtags: ["#Tag"],
        mentions: ["@Bob"],
        urls: ["https://e.com"],
        user: { username: "u", name: "U", id: "1" },
      },
      "2024-03-20T09:12:00.000Z",
    );
    expect(t?.entities.hashtags).toEqual(["Tag"]);
    expect(t?.entities.mentions).toEqual(["Bob"]);
    expect(t?.entities.urls).toEqual(["https://e.com"]);
  });

  it("maps photo media", () => {
    const t = normalizeTweet(
      {
        id_str: "8",
        text: "p",
        created_at: "2024-03-19T14:05:22.000Z",
        user: { screen_name: "a", id_str: "1", name: "A" },
        entities: {
          media: [{ type: "photo", media_url_https: "https://p.twimg.com/x.jpg" }],
        },
      },
      "2024-03-20T09:12:00.000Z",
    );
    expect(t?.entities.media[0]?.type).toBe("photo");
  });

  it("matches spec example item keys via graphql fixture", () => {
    const t = toDatasetItem(normalizeTweet(graphqlLikeTweet(), "2024-03-20T09:12:00.000Z")!);
    expect(t.author.username).toBe("apify");
    expect(t.author.followers).toBe(21400);
    expect(t.isReply).toBe(false);
  });
});
