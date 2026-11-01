// @req INP-005
import { describe, expect, it } from "vitest";
import { classifySwipe, localDelta, SWIPE_MIN_PX } from "./swipe";

describe("classifySwipe (INP-005)", () => {
  it("upright seat: screen up is up, screen down is down", () => {
    expect(classifySwipe(0, 0, -60)).toBe("up");
    expect(classifySwipe(0, 4, 60)).toBe("down");
  });

  it("upside-down seat (180°): screen down is the player's up", () => {
    expect(classifySwipe(180, 0, 60)).toBe("up");
    expect(classifySwipe(180, 0, -60)).toBe("down");
  });

  it("90° seat (player on the left edge facing right): screen right is up", () => {
    expect(classifySwipe(90, 60, 0)).toBe("up");
    expect(classifySwipe(90, -60, 0)).toBe("down");
    // A screen-vertical drag is sideways for this player.
    expect(classifySwipe(90, 0, -80)).toBeNull();
  });

  it("270° seat (player on the right edge): screen left is up", () => {
    expect(classifySwipe(270, -60, 0)).toBe("up");
    expect(classifySwipe(270, 60, 0)).toBe("down");
  });

  it("ignores short or diagonal movements", () => {
    expect(classifySwipe(0, 0, -(SWIPE_MIN_PX - 1))).toBeNull();
    expect(classifySwipe(0, 50, -60)).toBeNull(); // not 1.5× dominant
    expect(classifySwipe(0, 30, -60)).toBe("up");
    expect(classifySwipe(0, 0, -20, 10)).toBe("up"); // custom threshold
  });

  it("localDelta maps vectors through each rotation", () => {
    expect(localDelta(0, 3, 4)).toEqual({ dx: 3, dy: 4 });
    expect(localDelta(90, 3, 4)).toEqual({ dx: 4, dy: -3 });
    expect(localDelta(180, 3, 4)).toEqual({ dx: -3, dy: -4 });
    expect(localDelta(270, 3, 4)).toEqual({ dx: -4, dy: 3 });
  });
});
