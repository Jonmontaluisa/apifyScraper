/** @type {import('@stryker-mutator/core').PartialStrykerOptions} */
export default {
  packageManager: "npm",
  testRunner: "vitest",
  checkers: ["typescript"],
  tsconfigFile: "tsconfig.json",
  mutate: ["src/entitlement.ts", "src/filters.ts", "src/cap.ts"],
  thresholds: { high: 80, low: 70, break: 70 },
  reporters: ["clear-text", "progress", "json"],
  vitest: {
    configFile: "vitest.config.ts",
  },
};
