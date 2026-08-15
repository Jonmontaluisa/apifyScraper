# x-tweet-scraper

Apify Actor: public X (Twitter) posts over **HTTP only** (guest token). No browser. Free runners get **at most 10 dataset items per run**. The Actor owner is the only paid user.

This repo follows [SPEC.md](SPEC.md). If a gauntlet gate fails, the work is not done.

## Architecture

```
INPUT (Zod) → entitlement (platform userId + private KV)
  → cap at dataset write
  → guest-token HTTP pages
  → normalize → filters → Actor.pushData
  → OUTPUT stats
```

`pushData` is a dataset write, not a UI button. The cap is `writtenCount`, not a clamped input field.

## No browser

The Actor calls X the same way a logged-out web client does: public web bearer + `POST /1.1/guest/activate.json` + GraphQL `SearchTimeline`. Query IDs rotate; set `X_SEARCH_QUERY_ID` if X ships a new client. **Keyword search may be login-walled for guests.** If that happens, the run degrades (errors in OUTPUT, fewer/zero items). We do not use cookies, a personal account, or a browser to work around it.

## Free tier

- Identity: `APIFY_USER_ID` from the platform, never from INPUT.
- Paid list: private KV store `x-tweet-scraper-entitlements` (record `{ "paid": true }` keyed by userId).
- Cloud: set Actor env `ENTITLEMENT_TOKEN` to an **owner** API token that can read that store. Runners cannot change owner env.
- Fail-closed: KV/network/unknown user → free → `min(maxResults, 10)` writes.
- Forks can delete the check in their copy. **This deployed Actor** cannot be lifted via input, extra JSON fields, or browser DevTools (the scrape runs on Apify, not in Chrome).

No anti-farming across runs (allowed by spec).

## Cost

**Apify Proxy is off.** `proxyConfiguration` is ignored. Aim is $0 proxy spend.

## Local run

```bash
npm ci
cp .env.example .env   # set APIFY_USER_ID to you + paid KV locally if you want >10
npm test
npm run test:coverage
npx apify run
```

Without `.env` userId + local store record, you are free (10 items).

## Gauntlet

```bash
npm run typecheck
npm run lint
npm run test:coverage   # ≥80% lines/branches on src (except main.ts)
npm run test:mutation   # ≥70% on entitlement, filters, cap
```

## ToS

Public data, assessment use. X ToS/robots may forbid production scraping. Confirm with counsel before client work. Guest tokens and GraphQL IDs change without notice.

## Known limitations

Guest **search** (`SearchTimeline`) often 404s without login. Documented limitation; we do not use a browser or a logged-in account.
- No performance SLA without residential proxy.
- `queryId` / feature flags drift; refresh from the live logged-out bundle when runs 400.
