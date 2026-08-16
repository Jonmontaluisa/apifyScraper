import { computeWriteCap, isLimitedFreeTier, shouldWrite } from "./cap.js";
import { resolvePaid } from "./entitlement.js";
import { matchesFilters } from "./filters.js";
import { InputValidationError, parseActorInput } from "./input.js";
import { normalizeTweet, toDatasetItem } from "./normalize.js";
import type {
  DatasetPort,
  EntitlementPort,
  LoggerPort,
  OutputPort,
  PersistPort,
  PersistState,
  RunStats,
  XClientPort,
} from "./types.js";

export interface RunDeps {
  rawInput: unknown;
  userId: string | null;
  entitlement: EntitlementPort;
  http: XClientPort;
  dataset: DatasetPort;
  output: OutputPort;
  persist: PersistPort;
  now: () => Date;
  log: LoggerPort;
}

function emptyErrors(): RunStats["errors"] {
  return { http429: 0, http403: 0, fatal: 0 };
}

export async function runScraper(deps: RunDeps): Promise<RunStats> {
  deps.log.info("run start");
  const input = parseActorInput(deps.rawInput);
  deps.log.info("input accepted", {
    searchTerms: input.searchTerms.length,
    fromUsers: input.fromUsers.length,
    toUsers: input.toUsers.length,
    mentioning: input.mentioning.length,
    hashtags: input.hashtags.length,
    hasSince: Boolean(input.since),
    hasUntil: Boolean(input.until),
    hasLanguage: Boolean(input.language),
    minLikes: input.minLikes,
    minRetweets: input.minRetweets,
    minReplies: input.minReplies,
    onlyVerified: input.onlyVerified,
    mediaType: input.mediaType,
    includeReplies: input.includeReplies,
    includeRetweets: input.includeRetweets,
    sortBy: input.sortBy,
    maxResults: input.maxResults,
  });
  const paid = await resolvePaid(deps.entitlement, deps.userId);
  const cap = computeWriteCap(paid, input.maxResults);
  const limited = isLimitedFreeTier(paid, input.maxResults);
  deps.log.info("entitlement resolved", {
    paid,
    cap,
    limited,
    platformUser: deps.userId ? "present" : "missing",
  });

  const restored = await deps.persist.load();
  const seen = new Set(restored?.seenIds ?? []);
  let written = restored?.written ?? 0;
  let fetched = restored?.fetched ?? 0;
  let duplicatesDropped = restored?.duplicatesDropped ?? 0;
  let filterDropped = restored?.filterDropped ?? 0;
  const errors = restored?.errors ?? emptyErrors();
  let cursor = restored?.cursor ?? null;
  if (restored) {
    deps.log.info("state restored", {
      written,
      fetched,
      duplicatesDropped,
      filterDropped,
      seenCount: seen.size,
      hasCursor: Boolean(cursor),
    });
  }

  const snapshot = (): PersistState => ({
    cursor,
    seenIds: [...seen],
    written,
    fetched,
    duplicatesDropped,
    filterDropped,
    errors,
  });

  const product = input.sortBy === "top" ? "Top" : "Latest";
  const scrapedAt = deps.now().toISOString();
  let pageIndex = 0;

  try {
    while (shouldWrite(written, cap)) {
      pageIndex += 1;
      deps.log.info("fetch page", { pageIndex, written, cap, hasCursor: Boolean(cursor) });
      let page;
      try {
        page = await deps.http.fetchPage({ input, cursor, product });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes("429")) errors.http429 += 1;
        else if (message.includes("403")) errors.http403 += 1;
        else errors.fatal += 1;
        deps.log.warn("http page failed", { pageIndex, message });
        if (message.includes("404") || message.includes("400")) break;
        if (errors.fatal > 5) break;
        if (errors.http429 + errors.http403 > 20) break;
        continue;
      }

      if (page.tweets.length === 0) {
        cursor = page.nextCursor;
        deps.log.info("empty page", { pageIndex, hasNextCursor: Boolean(cursor) });
        if (!cursor) break;
        continue;
      }

      let pageWritten = 0;
      let pageNormalizeDropped = 0;
      let pageFilterDropped = 0;
      let pageDupes = 0;

      for (const raw of page.tweets) {
        fetched += 1;
        const tweet = normalizeTweet(raw, scrapedAt);
        if (!tweet) {
          filterDropped += 1;
          pageNormalizeDropped += 1;
          continue;
        }
        if (seen.has(tweet.id)) {
          duplicatesDropped += 1;
          pageDupes += 1;
          continue;
        }
        seen.add(tweet.id);
        if (!matchesFilters(input, tweet)) {
          filterDropped += 1;
          pageFilterDropped += 1;
          continue;
        }
        if (!shouldWrite(written, cap)) break;
        await deps.dataset.push(toDatasetItem(tweet));
        written += 1;
        pageWritten += 1;
        if (!shouldWrite(written, cap)) {
          deps.log.info("write cap reached", { written, cap, paid, limited });
          break;
        }
      }

      deps.log.info("page processed", {
        pageIndex,
        rawOnPage: page.tweets.length,
        written: pageWritten,
        normalizeDropped: pageNormalizeDropped,
        filterDropped: pageFilterDropped,
        duplicatesDropped: pageDupes,
        totalWritten: written,
      });

      cursor = page.nextCursor;
      await deps.persist.save(snapshot());
      deps.log.info("state saved", { pageIndex, written, fetched });
      if (!cursor) break;
    }
  } catch (err) {
    if (err instanceof InputValidationError) throw err;
    errors.fatal += 1;
    deps.log.warn("run aborted", { message: err instanceof Error ? err.message : String(err) });
  }

  const stats: RunStats = {
    requested: input.maxResults,
    fetched,
    written,
    duplicatesDropped,
    filterDropped,
    limited,
    reason: limited ? "free_tier" : null,
    cap,
    errors,
  };
  await deps.output.set(stats);
  deps.log.info("run complete", {
    requested: stats.requested,
    fetched: stats.fetched,
    written: stats.written,
    duplicatesDropped: stats.duplicatesDropped,
    filterDropped: stats.filterDropped,
    limited: stats.limited,
    reason: stats.reason,
    cap: stats.cap,
    errors: stats.errors,
  });
  return stats;
}
