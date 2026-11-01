// @vitest-environment node
// @req ARCH-008 @req PAY-001
import { describe, expect, it } from "vitest";
import { PRO_FEATURES } from "./features";
import { can, defaultPolicy, limit } from "./policy";

describe("entitlements policy", () => {
  it("defaults to ALL_FREE unless the paywall env is on", () => {
    expect(defaultPolicy({})).toBe("ALL_FREE");
    expect(defaultPolicy({ NEXT_PUBLIC_PAYWALL_ENABLED: "1" })).toBe("TIERED");
  });
  it("allows everything when ALL_FREE", () => {
    for (const f of PRO_FEATURES) expect(can({ policy: "ALL_FREE", pro: false }, f)).toBe(true);
  });
  it("gates features when TIERED", () => {
    expect(can({ policy: "TIERED", pro: false }, "historyExport")).toBe(false);
    expect(can({ policy: "TIERED", pro: true }, "historyExport")).toBe(true);
  });
  it("applies free limits only to free tiered users", () => {
    expect(limit({ policy: "TIERED", pro: false }, "profiles")).toBe(4);
    expect(limit({ policy: "TIERED", pro: true }, "profiles")).toBe(Infinity);
    expect(limit({ policy: "ALL_FREE", pro: false }, "cloudArtImages")).toBe(200);
    expect(limit({ policy: "TIERED", pro: false }, "cloudArtImages")).toBe(10);
  });
});
