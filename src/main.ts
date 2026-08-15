import { Actor, log } from "apify";
import { ApifyClient } from "apify-client";
import { KvEntitlementPort } from "./entitlement.js";
import { InputValidationError } from "./input.js";
import { runScraper } from "./run-scraper.js";
import type { PersistState, TweetOutput } from "./types.js";
import { GuestXClient } from "./x/client.js";

const STATE_KEY = "SCRAPER_STATE";

await Actor.init();

Actor.on("migrating", async () => {
  await Actor.reboot();
});

try {
  const rawInput = await Actor.getInput();
  const userId = Actor.getEnv().userId ?? process.env.APIFY_USER_ID ?? null;
  const storeName = process.env.ENTITLEMENT_STORE_NAME ?? "x-tweet-scraper-entitlements";
  const ownerToken = process.env.ENTITLEMENT_TOKEN;

  const entitlement = new KvEntitlementPort(async (id) => {
    if (ownerToken) {
      const client = new ApifyClient({ token: ownerToken });
      const store = await client.keyValueStores().getOrCreate(storeName);
      const rec = await client.keyValueStore(store.id).getRecord(id);
      return rec?.value ?? null;
    }
    const store = await Actor.openKeyValueStore(storeName);
    return store.getValue(id);
  });

  await runScraper({
    rawInput: rawInput ?? {},
    userId,
    entitlement,
    http: new GuestXClient(),
    dataset: {
      push: async (item: TweetOutput) => {
        await Actor.pushData(item);
      },
    },
    output: {
      set: async (stats) => {
        await Actor.setValue("OUTPUT", stats);
        log.info("run summary", stats);
      },
    },
    persist: {
      load: async () => (await Actor.getValue<PersistState>(STATE_KEY)) ?? null,
      save: async (state) => {
        await Actor.setValue(STATE_KEY, state);
      },
    },
    now: () => new Date(),
    log: {
      info: (m, extra) => log.info(m, extra),
      warn: (m, extra) => log.warning(m, extra),
    },
  });
} catch (err) {
  if (err instanceof InputValidationError) {
    log.error(err.message);
  }
  throw err;
} finally {
  await Actor.exit();
}
