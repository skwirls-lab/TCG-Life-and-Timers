import { describe, expect, it, vi } from "vitest";
import proMessages from "@/i18n/en/pro.json";
import { hasKey, t, tp } from "./index";
import { proDate, tPro } from "./pro";

describe("i18n", () => {
  it("translates and interpolates", () => {
    expect(t("common.close")).toBe("Close");
    expect(hasKey("common.close")).toBe(true);
    expect(hasKey("nope.nope")).toBe(false);
  });
  it("returns key for unknown keys", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // @ts-expect-error unknown key on purpose
    expect(t("missing.key")).toBe("missing.key");
    warn.mockRestore();
  });
  it("the route-scoped Pro dictionary is prefixed, separate and interpolates", () => {
    for (const key of Object.keys(proMessages)) {
      expect(key.startsWith("pro.")).toBe(true);
      expect(hasKey(key)).toBe(false); // never shadows a global key
    }
    expect(tPro("pro.state.renews", { date: "Jan 1" })).toBe("Renews on Jan 1");
    // @ts-expect-error unknown key on purpose
    expect(tPro("pro.nope")).toBe("pro.nope");
    expect(proDate(Date.UTC(2027, 0, 15, 12), "en-US")).toBe("Jan 15, 2027");
  });
  it("pluralizes with fallback to key", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(tp("x.items", 2)).toBe("x.items.other");
    expect(tp("x.items", 1)).toBe("x.items.one");
    warn.mockRestore();
  });
});
