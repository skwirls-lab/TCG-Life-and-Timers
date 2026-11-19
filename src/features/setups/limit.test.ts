// Presets (saved setups): Free = 1, Pro = unlimited, enforced only while the paywall is enabled.
// @req PAY-004
import { act } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TcgDb, setDbForTests } from "@/lib/db";
import { FREE_LIMITS, PRO_FEATURES } from "@/lib/entitlements/features";
import { rowForFeature, usePaywall } from "@/lib/entitlements/paywall";
import { useEntitlements } from "@/lib/entitlements/store";
import { createSetup } from "@/lib/setups";
import { canCreateSetup } from "./SaveSetupSheet";

const draft = {
  presetId: "mtg.commander",
  presetName: "MTG Commander",
  config: {},
  seats: [{ name: "Ann", color: "#f472b6", commanders: [] }],
  firstPlayerRule: "random" as const,
};

let db: TcgDb | null = null;
afterEach(async () => {
  act(() => {
    usePaywall.getState().close();
    useEntitlements.getState().setPolicy("ALL_FREE");
    useEntitlements.getState().setPro(false);
  });
  setDbForTests(null);
  if (db) {
    db.close();
    await db.delete();
    db = null;
  }
});

describe("preset free limit", () => {
  it("is registered as a Pro feature with a free limit of 1 and a /pro row", () => {
    expect(PRO_FEATURES).toContain("savedSetupsUnlimited");
    expect(FREE_LIMITS.savedSetups).toBe(1);
    expect(rowForFeature("savedSetupsUnlimited")?.id).toBe("savedSetups");
  });

  it("free: the second preset opens the paywall; Pro and paywall-off: unlimited", async () => {
    db = new TcgDb(`setups-limit-${Math.random()}`);
    setDbForTests(db);
    act(() => useEntitlements.getState().setPolicy("TIERED"));
    expect(await canCreateSetup()).toBe(true);
    await createSetup("One", draft, { db });
    expect(await canCreateSetup()).toBe(false);
    expect(usePaywall.getState()).toMatchObject({ isOpen: true, feature: "savedSetupsUnlimited" });

    act(() => {
      usePaywall.getState().close();
      useEntitlements.getState().setPro(true);
    });
    expect(await canCreateSetup()).toBe(true);
    act(() => {
      useEntitlements.getState().setPro(false);
      useEntitlements.getState().setPolicy("ALL_FREE");
    });
    expect(await canCreateSetup()).toBe(true);
    expect(usePaywall.getState().isOpen).toBe(false);
  });
});
