// @vitest-environment node
import { describe, expect, it } from "vitest";
import { verifyHintsEnabled } from "./verifyHints";

describe("verify hints (A-11a)", () => {
  it("are hidden in production builds and shown in dev/test builds or on request", () => {
    expect(verifyHintsEnabled({ NODE_ENV: "production" })).toBe(false);
    expect(verifyHintsEnabled({ NODE_ENV: "production", NEXT_PUBLIC_TEST_HOOKS: "1" })).toBe(true);
    expect(verifyHintsEnabled({ NODE_ENV: "development" })).toBe(true);
    expect(verifyHintsEnabled({ NODE_ENV: "production", NEXT_PUBLIC_SHOW_VERIFY: "1" })).toBe(true);
  });
});
