import { describe, expect, it } from "vitest";
import { shouldReduceMotion, themeAttr } from "./effects";

describe("app effects", () => {
  // @req SET-001
  it("maps the theme setting to the globals.css data-theme value", () => {
    expect(themeAttr("dark")).toBe("dark");
    expect(themeAttr("light")).toBe("light");
    expect(themeAttr("highContrast")).toBe("contrast");
  });

  // @req A11Y-003
  it("reduces motion when asked, or when following a reduced-motion system", () => {
    expect(shouldReduceMotion("always", false)).toBe(true);
    expect(shouldReduceMotion("never", true)).toBe(false);
    expect(shouldReduceMotion("system", true)).toBe(true);
    expect(shouldReduceMotion("system", false)).toBe(false);
  });
});
