import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const FORBIDDEN = [/(?:^|["'\s])playwright(?:["'\s]|$)/i, /["']puppeteer["']/i, /selenium/i, /["']browserless["']/i];

describe("forbidden dependencies", () => {
  it("package.json has no browser engines", () => {
    const pkg = readFileSync(new URL("../package.json", import.meta.url), "utf8");
    for (const re of FORBIDDEN) {
      expect(pkg).not.toMatch(re);
    }
  });

  it("src does not import browser engines", () => {
    const files = ["main.ts", "run-scraper.ts", "x/client.ts"];
    for (const f of files) {
      const body = readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
      for (const re of FORBIDDEN) {
        expect(body).not.toMatch(re);
      }
    }
  });
});
