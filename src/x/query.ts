import type { ActorInput } from "../types.js";
import { stripHandle, stripHash } from "../filters.js";

export function buildSearchQuery(input: ActorInput): string {
  const parts: string[] = [];
  if (input.searchTerms.length === 1) {
    const t = input.searchTerms[0];
    if (t) parts.push(t);
  } else if (input.searchTerms.length > 1) {
    parts.push(`(${input.searchTerms.join(" OR ")})`);
  }
  for (const u of input.fromUsers) {
    parts.push(`from:${stripHandle(u)}`);
  }
  for (const u of input.toUsers) {
    parts.push(`to:${stripHandle(u)}`);
  }
  for (const u of input.mentioning) {
    parts.push(`@${stripHandle(u)}`);
  }
  for (const h of input.hashtags) {
    parts.push(`#${stripHash(h)}`);
  }
  if (input.language) parts.push(`lang:${input.language}`);
  if (input.since) parts.push(`since:${input.since}`);
  if (input.until) parts.push(`until:${input.until}`);
  if (!input.includeReplies) parts.push("-filter:replies");
  if (!input.includeRetweets) parts.push("-filter:nativeretweets");
  return parts.join(" ");
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

export function backoffMs(attempt: number, jitter: () => number = Math.random): number {
  const exp = Math.min(5000, 200 * 2 ** attempt);
  return Math.floor(exp * (0.5 + jitter() * 0.5));
}

export class HttpStatusError extends Error {
  public constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpStatusError";
  }
}

const DEFAULT_BEARER =
  "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";

export function publicWebBearer(): string {
  return process.env.X_WEB_BEARER ?? DEFAULT_BEARER;
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  opts: {
    attempts?: number;
    sleepFn?: (ms: number) => Promise<void>;
    jitter?: () => number;
    onRetry?: (info: { status: number; attempt: number; waitMs: number }) => void;
  } = {},
): Promise<Response> {
  const attempts = opts.attempts ?? 4;
  const sleepFn = opts.sleepFn ?? sleep;
  let last: Response | undefined;
  for (let i = 0; i < attempts; i += 1) {
    last = await fetch(url, init);
    if (last.status === 429 || last.status >= 500) {
      if (i === attempts - 1) {
        throw new HttpStatusError(last.status, `HTTP ${last.status}`);
      }
      const waitMs = backoffMs(i, opts.jitter);
      opts.onRetry?.({ status: last.status, attempt: i + 1, waitMs });
      await sleepFn(waitMs);
      continue;
    }
    return last;
  }
  throw new HttpStatusError(last?.status ?? 0, `HTTP ${last?.status ?? 0}`);
}
