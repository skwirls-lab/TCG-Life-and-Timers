// @req TMR-004 @req GAME-015
import { describe, expect, it } from "vitest";
import { anchorPlacement, registerSeatAnchor, seatAnchorRect } from "./anchor";

const VP = { width: 400, height: 800 };
const top = { left: 0, top: 0, width: 400, height: 400 }; // seat at the top (rotation 180)
const bottom = { left: 0, top: 400, width: 400, height: 400 }; // seat at the bottom (rotation 0)

describe("seat-anchored placement", () => {
  it("moves toward the player's edge of the tile and faces the player", () => {
    expect(anchorPlacement(bottom, 0, "seat", VP)).toEqual({
      x: 200,
      y: 700,
      rotation: 0,
      maxWidth: 384,
    });
    expect(anchorPlacement(top, 180, "seat", VP)).toMatchObject({ x: 200, y: 100, rotation: 180 });
    const left = { left: 0, top: 0, width: 200, height: 800 };
    // 90°: the player sits at the left; the snackbar's width runs along the tile's height.
    expect(anchorPlacement(left, 90, "seat", VP)).toEqual({
      x: 50,
      y: 400,
      rotation: 90,
      maxWidth: 448,
    });
    const right = { left: 200, top: 0, width: 200, height: 800 };
    expect(anchorPlacement(right, 270, "seat", VP)).toMatchObject({ x: 350, y: 400 });
  });

  it("centres on a plain rect and keeps the overlay inside the viewport", () => {
    const button = { left: 300, top: 760, width: 100, height: 40 };
    const p = anchorPlacement(button, 0, "center", VP);
    expect(p.maxWidth).toBe(160);
    expect(p.x).toBe(400 - 80 - 8);
    expect(p.y).toBe(800 - 28 - 8);
    // 'above': beyond the rect on the side away from the player (the button stays uncovered).
    const pass = { left: 150, top: 700, width: 100, height: 40 };
    expect(anchorPlacement(pass, 0, "above", VP)).toMatchObject({
      x: 200,
      y: 720 - 20 - 28 - 8,
      maxWidth: 320,
    });
    expect(anchorPlacement({ ...pass, top: 60 }, 180, "above", VP).y).toBe(80 + 56);
    // A viewport smaller than the overlay: centred.
    expect(anchorPlacement(button, 0, "center", { width: 100, height: 40 })).toMatchObject({
      x: 50,
      y: 20,
    });
  });

  it("registers seat tiles and reads their rects", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    el.getBoundingClientRect = () => ({ left: 1, top: 2, width: 3, height: 4 }) as DOMRect;
    const off = registerSeatAnchor("s1", el);
    expect(seatAnchorRect("s1")).toEqual({ left: 1, top: 2, width: 3, height: 4 });
    expect(seatAnchorRect(undefined)).toBeNull();
    expect(seatAnchorRect("s2")).toBeNull();
    // A newer registration wins; the old unregister doesn't remove it.
    const el2 = document.createElement("div");
    document.body.appendChild(el2);
    const off2 = registerSeatAnchor("s1", el2);
    off();
    expect(seatAnchorRect("s1")).not.toBeNull();
    el2.remove();
    expect(seatAnchorRect("s1")).toBeNull(); // detached
    off2();
    el.remove();
  });
});
