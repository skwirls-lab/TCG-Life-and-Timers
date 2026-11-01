// @req PAY-004 @req ART-007
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { hasKey } from "@/lib/i18n";
import { PRO_FEATURES } from "./features";
import { requireLimit, requirePro, useProGate } from "./gate";
import { COMPARISON_ROWS, openPaywall, rowForFeature, rowsByArea, usePaywall } from "./paywall";
import { useEntitlements } from "./store";

afterEach(() => {
  act(() => {
    usePaywall.getState().close();
    useEntitlements.getState().setPolicy("ALL_FREE");
    useEntitlements.getState().setPro(false);
  });
});

describe("paywall model (PRD §17.2)", () => {
  // @req PAY-004
  it("every Pro feature is sold by exactly one comparison row", () => {
    for (const f of PRO_FEATURES) {
      expect(COMPARISON_ROWS.filter((r) => r.features.includes(f))).toHaveLength(1);
      expect(rowForFeature(f)).not.toBeNull();
    }
    expect(rowForFeature(null)).toBeNull();
    expect(rowForFeature(undefined)).toBeNull();
  });

  // @req ART-007
  it("keeps Scryfall art, tools and core play free", () => {
    for (const id of ["art", "basePlay", "counters", "tools", "timersBasic", "accountSync"]) {
      const row = COMPARISON_ROWS.find((r) => r.id === id)!;
      expect(row.free).toEqual({ kind: "yes" });
      expect(row.features).toEqual([]);
    }
  });

  it("has a translation for every label, text cell and feature", () => {
    for (const r of COMPARISON_ROWS) {
      expect(hasKey(r.label)).toBe(true);
      for (const c of [r.free, r.pro]) if (c.kind === "text") expect(hasKey(c.key)).toBe(true);
      expect(hasKey(`pay.area.${r.area}`)).toBe(true);
    }
    for (const f of PRO_FEATURES) expect(hasKey(`pay.feature.${f}`)).toBe(true);
  });

  it("groups rows by area in table order with unique ids", () => {
    const groups = rowsByArea();
    expect(groups.map((g) => g.area)).toEqual([
      "play",
      "tools",
      "timers",
      "customize",
      "history",
      "sync",
      "ads",
    ]);
    expect(groups.flatMap((g) => g.rows)).toEqual([...COMPARISON_ROWS]);
    expect(new Set(COMPARISON_ROWS.map((r) => r.id)).size).toBe(COMPARISON_ROWS.length);
  });
});

describe("paywall store and gates", () => {
  // @req PAY-004
  it("opens with an optional feature and closes", () => {
    openPaywall("themesPro");
    expect(usePaywall.getState()).toMatchObject({ isOpen: true, feature: "themesPro" });
    usePaywall.getState().close();
    expect(usePaywall.getState()).toMatchObject({ isOpen: false, feature: null });
    usePaywall.getState().open();
    expect(usePaywall.getState()).toMatchObject({ isOpen: true, feature: null });
  });

  // @req PAY-001 @req PAY-004
  it("useProGate allows everything when ALL_FREE and opens the paywall when locked", () => {
    const gate = renderHook(() => useProGate("players7to8"));
    expect(gate.result.current.allowed).toBe(true);
    act(() => useEntitlements.getState().setPolicy("TIERED"));
    gate.rerender();
    expect(gate.result.current.allowed).toBe(false);
    act(() => gate.result.current.open());
    expect(usePaywall.getState()).toMatchObject({ isOpen: true, feature: "players7to8" });
    act(() => useEntitlements.getState().setPro(true));
    gate.rerender();
    expect(gate.result.current.allowed).toBe(true);
  });

  // @req PAY-004
  it("requirePro / requireLimit only open the paywall when denied", () => {
    expect(requirePro("historyExport")).toBe(true);
    expect(requireLimit("profiles", 100, "profilesUnlimited")).toBe(true);
    expect(usePaywall.getState().isOpen).toBe(false);

    useEntitlements.getState().setPolicy("TIERED");
    expect(requireLimit("profiles", 3, "profilesUnlimited")).toBe(true);
    expect(usePaywall.getState().isOpen).toBe(false);
    expect(requireLimit("profiles", 4, "profilesUnlimited")).toBe(false);
    expect(usePaywall.getState().feature).toBe("profilesUnlimited");
    expect(requirePro("historyExport")).toBe(false);
    expect(usePaywall.getState().feature).toBe("historyExport");

    useEntitlements.getState().setPro(true);
    expect(requireLimit("customPresets", 50, "customPresetsUnlimited")).toBe(true);
    expect(requirePro("historyExport")).toBe(true);
  });
});
