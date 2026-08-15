import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CANONICAL_EXAMPLE_INPUT, parseActorInput } from "../src/input.js";

describe("parseActorInput", () => {
  it("accepts canonical example", () => {
    const input = parseActorInput(CANONICAL_EXAMPLE_INPUT);
    expect(input.searchTerms).toEqual(["apify", "web scraping"]);
    expect(input.hashtags).toEqual(["buildinpublic"]);
    expect(input.maxResults).toBe(500);
    expect(input.includeReplies).toBe(true);
  });

  it("rejects empty search surface", () => {
    expect(() =>
      parseActorInput({ searchTerms: [], fromUsers: [], hashtags: [], maxResults: 10 }),
    ).toThrow(/searchTerms/);
  });

  it("rejects maxResults 0", () => {
    expect(() => parseActorInput({ searchTerms: ["x"], maxResults: 0 })).toThrow();
  });

  it("rejects bad mediaType", () => {
    expect(() => parseActorInput({ searchTerms: ["x"], mediaType: "gif", maxResults: 10 })).toThrow();
  });

  it("rejects bad since", () => {
    expect(() => parseActorInput({ searchTerms: ["x"], since: "03-2024", maxResults: 10 })).toThrow();
  });

  it("rejects until before since", () => {
    expect(() =>
      parseActorInput({
        searchTerms: ["x"],
        since: "2024-03-31",
        until: "2024-01-01",
        maxResults: 10,
      }),
    ).toThrow(/until/);
  });

  it("treats empty arrays as omitted", () => {
    const input = parseActorInput({ searchTerms: ["x"], fromUsers: [], hashtags: [] });
    expect(input.fromUsers).toEqual([]);
    expect(input.maxResults).toBe(10);
    expect(input.sortBy).toBe("latest");
  });

  it("ignores spoof fields", () => {
    const input = parseActorInput({
      searchTerms: ["x"],
      paid: true,
      userId: "owner-id",
      bypassCap: true,
      limit: 999,
    });
    expect(input.maxResults).toBe(10);
  });
});

describe("INPUT_SCHEMA", () => {
  it("declares required filter fields", () => {
    const schema = JSON.parse(
      readFileSync(new URL("../.actor/input_schema.json", import.meta.url), "utf8"),
    ) as { properties: Record<string, unknown> };
    for (const key of [
      "searchTerms",
      "fromUsers",
      "toUsers",
      "mentioning",
      "hashtags",
      "since",
      "until",
      "language",
      "minLikes",
      "minRetweets",
      "minReplies",
      "onlyVerified",
      "mediaType",
      "includeReplies",
      "includeRetweets",
      "sortBy",
      "maxResults",
      "proxyConfiguration",
    ]) {
      expect(schema.properties[key]).toBeTruthy();
    }
  });
});
