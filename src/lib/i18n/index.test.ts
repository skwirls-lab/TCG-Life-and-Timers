import { describe, expect, it, vi } from "vitest";
import { hasKey, t, tp } from "./index";

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
  it("pluralizes with fallback to key", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(tp("x.items", 2)).toBe("x.items.other");
    expect(tp("x.items", 1)).toBe("x.items.one");
    warn.mockRestore();
  });
});
