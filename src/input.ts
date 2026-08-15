import { z } from "zod";
import type { ActorInput } from "./types.js";

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

function nonemptyStrings(value: string[] | undefined): string[] {
  if (!value) return [];
  return value.map((s) => s.trim()).filter((s) => s.length > 0);
}

const inputSchema = z
  .object({
    searchTerms: z.array(z.string()).optional(),
    fromUsers: z.array(z.string()).optional(),
    toUsers: z.array(z.string()).optional(),
    mentioning: z.array(z.string()).optional(),
    hashtags: z.array(z.string()).optional(),
    since: z.string().regex(dateRe, "since must be YYYY-MM-DD").optional().nullable(),
    until: z.string().regex(dateRe, "until must be YYYY-MM-DD").optional().nullable(),
    language: z.string().min(2).max(8).optional().nullable(),
    minLikes: z.number().int().min(0).optional(),
    minRetweets: z.number().int().min(0).optional(),
    minReplies: z.number().int().min(0).optional(),
    onlyVerified: z.boolean().optional(),
    mediaType: z.enum(["any", "text_only", "images", "video", "links"]).optional(),
    includeReplies: z.boolean().optional(),
    includeRetweets: z.boolean().optional(),
    sortBy: z.enum(["latest", "top"]).optional(),
    maxResults: z.number().int().min(1).optional(),
    proxyConfiguration: z.unknown().optional(),
    paid: z.unknown().optional(),
    userId: z.unknown().optional(),
    limit: z.unknown().optional(),
    bypassCap: z.unknown().optional(),
  })
  .passthrough();

export class InputValidationError extends Error {
  public override readonly name = "InputValidationError";
}

export function parseActorInput(raw: unknown): ActorInput {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) {
    throw new InputValidationError(parsed.error.issues.map((i) => i.message).join("; "));
  }
  const d = parsed.data;
  const searchTerms = nonemptyStrings(d.searchTerms);
  const fromUsers = nonemptyStrings(d.fromUsers);
  const hashtags = nonemptyStrings(d.hashtags);
  if (searchTerms.length + fromUsers.length + hashtags.length === 0) {
    throw new InputValidationError(
      "At least one of searchTerms, fromUsers, or hashtags is required",
    );
  }
  if (d.since && d.until && d.until < d.since) {
    throw new InputValidationError("until must be on or after since");
  }
  return {
    searchTerms,
    fromUsers,
    toUsers: nonemptyStrings(d.toUsers),
    mentioning: nonemptyStrings(d.mentioning),
    hashtags,
    since: d.since ?? null,
    until: d.until ?? null,
    language: d.language ?? null,
    minLikes: d.minLikes ?? 0,
    minRetweets: d.minRetweets ?? 0,
    minReplies: d.minReplies ?? 0,
    onlyVerified: d.onlyVerified ?? false,
    mediaType: d.mediaType ?? "any",
    includeReplies: d.includeReplies ?? true,
    includeRetweets: d.includeRetweets ?? false,
    sortBy: d.sortBy ?? "latest",
    maxResults: d.maxResults ?? 10,
  };
}

export const CANONICAL_EXAMPLE_INPUT = {
  searchTerms: ["apify", "web scraping"],
  fromUsers: [],
  toUsers: [],
  mentioning: [],
  hashtags: ["buildinpublic"],
  since: "2024-01-01",
  until: "2024-03-31",
  language: "en",
  minLikes: 25,
  minRetweets: 0,
  minReplies: 0,
  onlyVerified: false,
  mediaType: "any",
  includeReplies: true,
  includeRetweets: false,
  sortBy: "latest",
  maxResults: 500,
  proxyConfiguration: { useApifyProxy: false },
} as const;
