// @req CUS-007
import { describe, expect, it } from "vitest";
import { SHARE_PAGE_PLACEHOLDER, shareCodeFromPath } from "./sharePath";

describe("shareCodeFromPath (static /p/{code} page)", () => {
  it("reads the code from /p/{code}", () => {
    expect(shareCodeFromPath("/p/AbC12345")).toBe("AbC12345");
    expect(shareCodeFromPath("/p/AbC12345/")).toBe("AbC12345");
    expect(shareCodeFromPath("/p/bad%20code")).toBe("bad code");
  });
  it("is empty for other paths, the placeholder page and bad escapes", () => {
    expect(shareCodeFromPath("/")).toBe("");
    expect(shareCodeFromPath("/p/")).toBe("");
    expect(shareCodeFromPath("/p/a/b")).toBe("");
    expect(shareCodeFromPath(`/p/${SHARE_PAGE_PLACEHOLDER}`)).toBe("");
    expect(shareCodeFromPath("/p/%E0%A4%A")).toBe("");
  });
});
