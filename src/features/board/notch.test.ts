// @req LAY-010
/** MENU: where the center menu button cuts into the seats' name rows. */
import { describe, expect, it } from "vitest";
import { getLayout } from "@/engine/layout";
import { centerCover, notchRow, seatNotch, CENTER_BUTTON_PX, type PxBox } from "./notch";

const box = (left: number, top: number, right: number, bottom: number): PxBox => ({
  left,
  top,
  right,
  bottom,
});

describe("centerCover", () => {
  it("covers the button plus clearance, and the match pill below it", () => {
    const b = centerCover(100, 100, false);
    expect(b.right - b.left).toBeGreaterThan(CENTER_BUTTON_PX);
    expect(b.bottom - 100).toBe(100 - b.top);
    const p = centerCover(100, 100, true);
    expect(p.bottom).toBeGreaterThan(b.bottom);
    expect(p.right - p.left).toBeGreaterThan(b.right - b.left);
    expect(p.top).toBe(b.top);
  });
});

describe("seatNotch", () => {
  // A 360×740 board, two seats face to face, seam at y = 370.
  const top = box(0, 0, 360, 370);
  const bottom = box(0, 370, 360, 740);
  const cover = centerCover(180, 370, false);

  it("upright seat below the seam: interval along its top edge from its left", () => {
    const n = seatNotch(bottom, 0, cover)!;
    expect(n[0]).toBeCloseTo(180 - (cover.right - 180), 0);
    expect(n[1]).toBeCloseTo(cover.right, 0);
  });

  it("upside-down seat above the seam: mirrored along its edge", () => {
    const n = seatNotch(top, 180, cover)!;
    expect(n[0] + n[1]).toBeCloseTo(360, 0);
  });

  it("sideways seats use the vertical edge", () => {
    // Left seat (90°): its top edge is the seam on its right; player's left = screen top.
    const left = box(0, 0, 180, 400);
    const c = centerCover(180, 100, false);
    const n90 = seatNotch(left, 90, c)!;
    expect((n90[0] + n90[1]) / 2).toBeCloseTo(100, 0);
    // Right seat (270°): top edge on its left; player's left = screen bottom.
    const right = box(180, 0, 360, 400);
    const n270 = seatNotch(right, 270, c)!;
    expect((n270[0] + n270[1]) / 2).toBeCloseTo(300, 0);
  });

  it("is null when the button does not reach the name row", () => {
    expect(seatNotch(bottom, 180, cover)).toBeNull(); // the name row is at the far edge
    expect(seatNotch(box(0, 500, 360, 740), 0, cover)).toBeNull();
  });

  it("2-player board from the layout engine: both name rows are notched in the middle", () => {
    const l = getLayout({ players: 2, viewport: { w: 360, h: 740 } });
    const c = centerCover(180, 370, true);
    for (const s of l.seats) {
      const tile = box(
        s.rect.x * 360,
        s.rect.y * 740,
        (s.rect.x + s.rect.w) * 360,
        (s.rect.y + s.rect.h) * 740,
      );
      const row = notchRow(seatNotch(tile, s.rotation, c), 360);
      expect(row.kind).toBe("split");
    }
  });
});

describe("notchRow", () => {
  it("splits around a middle notch and pads around an end notch", () => {
    expect(notchRow(null, 300)).toEqual({ kind: "none" });
    expect(notchRow([0, 10], 0)).toEqual({ kind: "none" });
    expect(notchRow([120, 180], 300)).toEqual({ kind: "split", from: 120, to: 180 });
    expect(notchRow([260, 300], 300)).toEqual({ kind: "pad", side: "right", pad: 40 });
    expect(notchRow([0, 30], 300)).toEqual({ kind: "pad", side: "left", pad: 30 });
  });
});
