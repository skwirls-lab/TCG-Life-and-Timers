// @vitest-environment node
// @req LAY-007
import { describe, expect, it } from "vitest";
import { nextRotation, rotatedSize, toLocal } from "./rotation";

describe("rotation helpers", () => {
  it("swaps size for 90 and 270", () => {
    expect(rotatedSize(0, 100, 50)).toEqual({ width: 100, height: 50 });
    expect(rotatedSize(90, 100, 50)).toEqual({ width: 50, height: 100 });
    expect(rotatedSize(180, 100, 50)).toEqual({ width: 100, height: 50 });
    expect(rotatedSize(270, 100, 50)).toEqual({ width: 50, height: 100 });
  });
  it("maps screen points into the local frame", () => {
    // 100x50 screen box
    expect(toLocal(0, 10, 20, 100, 50)).toEqual({ x: 10, y: 20 });
    expect(toLocal(180, 10, 20, 100, 50)).toEqual({ x: 90, y: 30 });
    // rotated 90: local box is 50 wide x 100 tall
    expect(toLocal(90, 100, 0, 100, 50)).toEqual({ x: 0, y: 0 });
    expect(toLocal(270, 0, 50, 100, 50)).toEqual({ x: 0, y: 0 });
  });
  it("cycles rotations", () => {
    expect(nextRotation(0)).toBe(90);
    expect(nextRotation(270)).toBe(0);
  });
});
