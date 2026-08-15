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
  const input = parseActorInput(deps.rawInput);
  const paid = await resolvePaid(deps.entitlement, deps.userId);
  const cap = computeWriteCap(paid, input.maxResults);
  const limited = isLimitedFreeTier(paid, input.maxResults);
  deps.log.info("entitlement resolved", { paid, cap, userId: deps.userId ? "set" : null });

  const restored = await deps.persist.load();
  const seen = new Set(restored?.seenIds ?? []);
  let written = restored?.written ?? 0;
  let fetched = restored?.fetched ?? 0;
  let duplicatesDropped = restored?.duplicatesDropped ?? 0;
  let filterDropped = restored?.filterDropped ?? 0;
  const errors = restored?.errors ?? emptyErrors();
  let cursor = restored?.cursor ?? null;

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

  try {
    while (shouldWrite(written, cap)) {
      let page;
      try {
        page = await deps.http.fetchPage({ input, cursor, product });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes("429")) errors.http429 += 1;
        else if (message.includes("403")) errors.http403 += 1;
        else errors.fatal += 1;
        deps.log.warn("http page failed", { message });
        if (message.includes("404") || message.includes("400")) break;
        if (errors.fatal > 5) break;
        if (errors.http429 + errors.http403 > 20) break;
        continue;
      }

      if (page.tweets.length === 0) {
        cursor = page.nextCursor;
        if (!cursor) break;
        continue;
      }

      for (const raw of page.tweets) {
        fetched += 1;
        const tweet = normalizeTweet(raw, scrapedAt);
        if (!tweet) {
          filterDropped += 1;
          continue;
        }
        if (seen.has(tweet.id)) {
          duplicatesDropped += 1;
          continue;
        }
        seen.add(tweet.id);
        if (!matchesFilters(input, tweet)) {
          filterDropped += 1;
          continue;
        }
        if (!shouldWrite(written, cap)) break;
        await deps.dataset.push(toDatasetItem(tweet));
        written += 1;
        if (!shouldWrite(written, cap)) break;
      }

      cursor = page.nextCursor;
      await deps.persist.save(snapshot());
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
  deps.log.info("run complete", { ...stats, errors: stats.errors });
  return stats;
}
