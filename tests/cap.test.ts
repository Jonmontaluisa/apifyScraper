import { describe, expect, it } from "vitest";
import { computeWriteCap, isLimitedFreeTier, shouldWrite } from "../src/cap.js";

describe("cap", () => {
  it("caps free users at 10", () => {
    expect(computeWriteCap(false, 1000)).toBe(10);
  });

  it("honors free maxResults below 10", () => {
    expect(computeWriteCap(false, 3)).toBe(3);
  });

  it("honors paid maxResults", () => {
    expect(computeWriteCap(true, 40)).toBe(40);
  });

  it("stops writes at cap", () => {
    expect(shouldWrite(9, 10)).toBe(true);
    expect(shouldWrite(10, 10)).toBe(false);
  });

  it("marks limited only when free and requested > 10", () => {
    expect(isLimitedFreeTier(false, 1000)).toBe(true);
    expect(isLimitedFreeTier(false, 3)).toBe(false);
    expect(isLimitedFreeTier(true, 1000)).toBe(false);
  });

  it("guards maxResults below 1", () => {
    expect(computeWriteCap(true, 0)).toBe(1);
    expect(computeWriteCap(false, 0)).toBe(1);
  });
});
