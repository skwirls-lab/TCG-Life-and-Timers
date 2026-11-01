// @vitest-environment node
// @req LAY-001 @req LAY-002 @req LAY-003 @req LAY-004 @req LAY-006 @req LAY-010
import { describe, expect, it } from "vitest";
import {
  getLayout,
  layoutVariants,
  miniGrid,
  seatFrameSize,
  TOOLBAR_PX,
  type BoardLayout,
  type Rect,
} from "./layout";

const PORTRAIT = { w: 360, h: 740 };
const LANDSCAPE = { w: 915, h: 412 };
const EPS = 1e-4;

const area = (r: Rect) => r.w * r.h;
function overlap(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > EPS && h > EPS ? w * h : 0;
}

/** Geometry invariants: inside the box, no overlaps, seats + toolbar cover the viewport. */
function expectValid(l: BoardLayout) {
  const rects = [...l.seats.map((s) => s.rect), l.toolbar.rect];
  for (const r of rects) {
    expect(r.x).toBeGreaterThanOrEqual(-EPS);
    expect(r.y).toBeGreaterThanOrEqual(-EPS);
    expect(r.x + r.w).toBeLessThanOrEqual(1 + EPS);
    expect(r.y + r.h).toBeLessThanOrEqual(1 + EPS);
    expect(r.w).toBeGreaterThan(0);
    expect(r.h).toBeGreaterThan(0);
  }
  for (let i = 0; i < rects.length; i++)
    for (let j = i + 1; j < rects.length; j++) expect(overlap(rects[i]!, rects[j]!)).toBe(0);
  expect(rects.reduce((s, r) => s + area(r), 0)).toBeCloseTo(1, 4);
  l.seats.forEach((s, i) => expect(s.index).toBe(i));
}

const centre = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
/** Clockwise angle (screen coordinates, y down) of each seat around the board centre. */
function angles(l: BoardLayout): number[] {
  return l.seats.map((s) => {
    const c = centre(s.rect);
    return Math.atan2(c.y - 0.5, c.x - 0.5);
  });
}
/** Seats are in clockwise cyclic order: the angle sequence increases with exactly ≤ 1 wrap. */
function expectClockwise(l: BoardLayout) {
  const a = angles(l);
  let wraps = 0;
  for (let i = 0; i < a.length; i++) {
    const next = a[(i + 1) % a.length]!;
    if (a.length > 1 && next < a[i]!) wraps++;
  }
  expect(wraps).toBeLessThanOrEqual(1);
}

describe("layout variants (LAY-003)", () => {
  it("offers 1–3 variants for every count 1–8", () => {
    for (let n = 1; n <= 8; n++) {
      const v = layoutVariants(n);
      expect(v.length).toBeGreaterThanOrEqual(1);
      expect(v.length).toBeLessThanOrEqual(3);
      for (const x of v) expect(x.label).toBe(`board.layout.${x.id}`);
    }
    expect(layoutVariants(3)).toHaveLength(3);
    expect(layoutVariants(4).map((v) => v.id)).toEqual(["sides", "topBottom"]);
  });

  it("clamps out-of-range counts and falls back to the first variant", () => {
    expect(layoutVariants(0)).toEqual(layoutVariants(1));
    expect(layoutVariants(12)).toEqual(layoutVariants(8));
    expect(layoutVariants(Number.NaN)).toEqual(layoutVariants(2));
    const l = getLayout({ players: 4, variantId: "default", viewport: PORTRAIT });
    expect(l.variantId).toBe("sides");
  });
});

describe("getLayout geometry invariants", () => {
  for (let n = 1; n <= 8; n++) {
    for (const v of layoutVariants(n)) {
      for (const [name, vp] of [
        ["portrait", PORTRAIT],
        ["landscape", LANDSCAPE],
      ] as const) {
        it(`${n} players / ${v.id} / ${name}`, () => {
          const l = getLayout({ players: n, variantId: v.id, viewport: vp });
          expect(l.seats).toHaveLength(n);
          expect(l.variantId).toBe(v.id);
          expectValid(l);
          expectClockwise(l);
          // Every tile is big enough to hold a 48 px target in both directions.
          for (const s of l.seats) {
            const f = seatFrameSize(s, vp);
            expect(Math.min(f.w, f.h)).toBeGreaterThanOrEqual(100);
          }
        });
      }
    }
  }
});

describe("LAY-002 default portrait layouts", () => {
  const rot = (n: number, variantId?: string) =>
    getLayout({ players: n, variantId, viewport: PORTRAIT }).seats.map((s) => s.rotation);

  it("1 player: one upright tile above the toolbar", () => {
    const l = getLayout({ players: 1, viewport: PORTRAIT });
    expect(l.seats[0]!.rotation).toBe(0);
    expect(l.seats[0]!.rect).toMatchObject({ x: 0, y: 0, w: 1 });
    expect(l.seats[0]!.rect.h).toBeCloseTo(1 - TOOLBAR_PX / 740, 5);
  });

  it("2 players: top 180° / bottom 0°, toolbar between", () => {
    const l = getLayout({ players: 2, viewport: PORTRAIT });
    expect(rot(2)).toEqual([180, 0]);
    expect(l.seats[0]!.rect.y).toBe(0);
    expect(l.toolbar.orientation).toBe("horizontal");
    expect(l.toolbar.rect.y).toBeCloseTo(l.seats[0]!.rect.h);
  });

  it("3 players: three variants", () => {
    expect(rot(3, "topPair")).toEqual([180, 0, 0]);
    expect(rot(3, "sidesBottom")).toEqual([90, 270, 0]);
    expect(rot(3, "pairBottom")).toEqual([180, 180, 0]);
  });

  it("4 players default = LifeTap 2×2: left column 90°, right column 270°, toolbar strip between rows", () => {
    const l = getLayout({ players: 4, viewport: PORTRAIT });
    expect(rot(4)).toEqual([90, 270, 270, 90]);
    const [tl, tr, br, bl] = l.seats.map((s) => centre(s.rect));
    expect(tl!.x).toBeLessThan(0.5);
    expect(tl!.y).toBeLessThan(0.5);
    expect(tr!.x).toBeGreaterThan(0.5);
    expect(tr!.y).toBeLessThan(0.5);
    expect(br!.x).toBeGreaterThan(0.5);
    expect(br!.y).toBeGreaterThan(0.5);
    expect(bl!.x).toBeLessThan(0.5);
    expect(bl!.y).toBeGreaterThan(0.5);
    expect(l.toolbar.orientation).toBe("horizontal");
    expect(l.toolbar.rect.w).toBe(1);
    expect(l.toolbar.rect.y + l.toolbar.rect.h / 2).toBeCloseTo(0.5);
  });

  it("4 players alt: 2 top 180° + 2 bottom 0°", () => {
    expect(rot(4, "topBottom")).toEqual([180, 180, 0, 0]);
  });

  it("5 players: 2 left + 2 right + 1 bottom (or top)", () => {
    expect(rot(5)).toEqual([90, 270, 270, 0, 90]);
    expect(rot(5, "sidesTop")).toEqual([90, 180, 270, 270, 90]);
  });

  it("6 players: 3 left + 3 right with a vertical toolbar; alt adds top/bottom ends", () => {
    const l = getLayout({ players: 6, viewport: PORTRAIT });
    expect(rot(6)).toEqual([90, 270, 270, 270, 90, 90]);
    expect(l.toolbar.orientation).toBe("vertical");
    expect(l.toolbar.rect.h).toBe(1);
    expect(rot(6, "sidesEnds")).toEqual([90, 180, 270, 270, 0, 90]);
  });

  it("7–8 players: 4+3 / 4+4 along both long sides", () => {
    expect(rot(7).filter((r) => r === 90)).toHaveLength(4);
    expect(rot(7).filter((r) => r === 270)).toHaveLength(3);
    expect(rot(8).filter((r) => r === 90)).toHaveLength(4);
    expect(rot(8).filter((r) => r === 270)).toHaveLength(4);
  });

  it("seat 0 is the top-left-most seat and order runs clockwise (turn order)", () => {
    const l = getLayout({ players: 6, viewport: PORTRAIT });
    const c = l.seats.map((s) => centre(s.rect));
    expect(c[0]!.x).toBeLessThan(0.5);
    expect(c[0]!.y).toBeLessThan(0.34);
    // then the right column top → bottom, then the left column bottom → top
    expect(c[1]!.x).toBeGreaterThan(0.5);
    expect(c[1]!.y).toBeLessThan(c[2]!.y);
    expect(c[2]!.y).toBeLessThan(c[3]!.y);
    expect(c[4]!.x).toBeLessThan(0.5);
    expect(c[4]!.y).toBeGreaterThan(c[5]!.y);
  });
});

describe("LAY-006 landscape re-flow", () => {
  it("4 players become 2 top (180°) + 2 bottom (0°) with a vertical toolbar", () => {
    const l = getLayout({ players: 4, viewport: LANDSCAPE });
    expect(l.orientation).toBe("landscape");
    // Seat identity is kept from portrait (rotated picture): seat 0 is now bottom-left.
    expect(l.seats.map((s) => s.rotation)).toEqual([0, 180, 180, 0]);
    expect(l.toolbar.orientation).toBe("vertical");
    const c = l.seats.map((s) => centre(s.rect));
    expect(c[0]!.y).toBeGreaterThan(0.5);
    expect(c[0]!.x).toBeLessThan(0.5);
    expect(c[1]!.y).toBeLessThan(0.5);
    expect(c[2]!.x).toBeGreaterThan(0.5);
  });

  it("2 players face each other across the long axis (90° / 270°)", () => {
    const l = getLayout({ players: 2, viewport: LANDSCAPE });
    expect(l.seats.map((s) => s.rotation)).toEqual([90, 270]);
    expect(l.toolbar.rect.w).toBeCloseTo(TOOLBAR_PX / 915);
  });

  it("keeps each player's tile shape (frame size) from the portrait layout", () => {
    const p = getLayout({ players: 5, viewport: { w: 412, h: 915 } });
    const l = getLayout({ players: 5, viewport: { w: 915, h: 412 } });
    p.seats.forEach((s, i) => {
      const a = seatFrameSize(s, { w: 412, h: 915 });
      const b = seatFrameSize(l.seats[i]!, { w: 915, h: 412 });
      expect(b.w).toBeCloseTo(a.w, 3);
      expect(b.h).toBeCloseTo(a.h, 3);
    });
  });

  it("square viewports use the portrait layout", () => {
    expect(getLayout({ players: 2, viewport: { w: 500, h: 500 } }).orientation).toBe("portrait");
  });
});

describe("LAY-004 rotation override and SET-033 camera mode", () => {
  it("applies per-seat overrides", () => {
    const l = getLayout({ players: 4, viewport: PORTRAIT, overrides: [undefined, 0, undefined] });
    expect(l.seats.map((s) => s.rotation)).toEqual([90, 0, 270, 90]);
  });

  // @req SET-033
  it("camera mode faces every seat one way and beats overrides, keeping geometry", () => {
    const base = getLayout({ players: 4, viewport: PORTRAIT });
    const bottom = getLayout({
      players: 4,
      viewport: PORTRAIT,
      cameraMode: "bottom",
      overrides: [180],
    });
    const top = getLayout({ players: 4, viewport: PORTRAIT, cameraMode: "top" });
    expect(bottom.seats.map((s) => s.rotation)).toEqual([0, 0, 0, 0]);
    expect(top.seats.map((s) => s.rotation)).toEqual([180, 180, 180, 180]);
    expect(bottom.seats.map((s) => s.rect)).toEqual(base.seats.map((s) => s.rect));
  });
});

describe("SET-032 one-player mode", () => {
  // @req SET-032
  it("renders a single upright tile regardless of player count and orientation", () => {
    for (const vp of [PORTRAIT, LANDSCAPE]) {
      const l = getLayout({ players: 4, viewport: vp, onePlayer: true });
      expect(l.seats).toHaveLength(1);
      expect(l.seats[0]!.rotation).toBe(0);
      expect(l.orientation).toBe("portrait");
      expectValid(l);
    }
  });

  it("caps the toolbar on tiny viewports", () => {
    const l = getLayout({ players: 2, viewport: { w: 100, h: 100 } });
    expect(l.toolbar.rect.h).toBeCloseTo(0.2);
    expectValid(l);
  });
});

describe("CMD-002 mini-grid placement", () => {
  it("4-player default from the bottom-right seat's point of view", () => {
    const l = getLayout({ players: 4, viewport: PORTRAIT });
    const g = miniGrid(l, 2); // right column, lower, rotated 270°
    expect(g.cols).toBe(2);
    expect(g.rows).toBe(2);
    const at = (i: number) => g.cells.find((c) => c.index === i)!;
    // Own seat is in the bottom row (nearest the viewer).
    expect(at(2).row).toBe(1);
    // Seat 1 (same side, further up the screen) is to the viewer's right, also near them.
    expect(at(1)).toMatchObject({ row: 1 });
    expect(at(1).col).toBeGreaterThan(at(2).col);
    // Seats across the table are in the far row.
    expect(at(0).row).toBe(0);
    expect(at(3).row).toBe(0);
  });

  it("every viewer sees their own cell in the bottom row, for every layout", () => {
    for (let n = 2; n <= 8; n++) {
      for (const v of layoutVariants(n)) {
        const l = getLayout({ players: n, variantId: v.id, viewport: PORTRAIT });
        for (const s of l.seats) {
          const g = miniGrid(l, s.index);
          const keys = new Set(g.cells.map((c) => `${c.col},${c.row}`));
          expect(keys.size).toBe(n); // no collisions
          const own = g.cells.find((c) => c.index === s.index)!;
          if (s.rotation === 0) expect(own.row).toBe(g.rows - 1);
        }
      }
    }
  });

  it("handles 180° viewers and an unknown viewer index", () => {
    const l = getLayout({ players: 2, viewport: PORTRAIT });
    const g = miniGrid(l, 0);
    expect(g.cells.find((c) => c.index === 0)!.row).toBe(1);
    expect(miniGrid(l, 9).cells.find((c) => c.index === 1)!.row).toBe(1);
  });
});
