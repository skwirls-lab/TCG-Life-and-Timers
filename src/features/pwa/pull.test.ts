import { describe, expect, it } from "vitest";
import { pullProgress, PULL_THRESHOLD } from "./pull";

describe("pull-to-refresh indicator", () => {
  it("rubber-bands, caps, and is ready past the threshold", () => {
    expect(pullProgress(-10)).toEqual({ offset: 0, ready: false, turn: 0 });
    expect(pullProgress(40)).toMatchObject({ offset: 20, ready: false });
    expect(pullProgress(PULL_THRESHOLD)).toMatchObject({ ready: true, turn: 270 });
    expect(pullProgress(1000)).toMatchObject({ offset: 72, ready: true, turn: 270 });
  });
});
