import { describe, expect, it } from "vitest";
import { KvEntitlementPort, resolvePaid } from "../src/entitlement.js";

describe("entitlement", () => {
  it("unknown user is free", async () => {
    const port = new KvEntitlementPort(async () => null);
    expect(await port.isPaid("abc")).toBe(false);
    expect(await port.isPaid(null)).toBe(false);
  });

  it("paid true in store", async () => {
    const port = new KvEntitlementPort(async (id) => (id === "owner" ? { paid: true } : null));
    expect(await port.isPaid("owner")).toBe(true);
    expect(await port.isPaid("other")).toBe(false);
  });

  it("paid must be boolean true", async () => {
    const port = new KvEntitlementPort(async () => ({ paid: "yes" }));
    expect(await port.isPaid("x")).toBe(false);
  });

  it("fail-closed on throw", async () => {
    expect(
      await resolvePaid(
        {
          isPaid: async () => {
            throw new Error("kv down");
          },
        },
        "owner",
      ),
    ).toBe(false);
  });

  it("resolvePaid true when store says so", async () => {
    expect(await resolvePaid({ isPaid: async () => true }, "owner")).toBe(true);
  });
});
