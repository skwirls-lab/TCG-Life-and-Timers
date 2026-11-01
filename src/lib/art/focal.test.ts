// @req ART-004
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  coverZoomRect,
  DEFAULT_FOCAL,
  focalLayerStyle,
  matrixAngle,
  MAX_ZOOM,
  normalizeFocal,
  panFocal,
  pointerDistance,
  roundFocal,
  screenToLocalDelta,
  seatViewAspect,
  transformAngle,
  zoomFocal,
} from "./focal";

/** The rect the CSS rendering produces: cover + position x%/y%, then scale(z) about x%/y%. */
function cssRect(
  box: { width: number; height: number },
  img: { width: number; height: number },
  f: { x: number; y: number; zoom: number },
) {
  const s0 = Math.max(box.width / img.width, box.height / img.height);
  const w0 = img.width * s0;
  const h0 = img.height * s0;
  const l0 = (box.width - w0) * f.x;
  const t0 = (box.height - h0) * f.y;
  const ox = box.width * f.x;
  const oy = box.height * f.y;
  return {
    left: ox + (l0 - ox) * f.zoom,
    top: oy + (t0 - oy) * f.zoom,
    width: w0 * f.zoom,
    height: h0 * f.zoom,
  };
}

describe("focal math (ART-004)", () => {
  // @req ART-004
  it("cover: a wide image in a square box fills the height and centers by default", () => {
    const r = coverZoomRect({ width: 100, height: 100 }, { width: 200, height: 100 });
    expect(r).toEqual({ width: 200, height: 100, left: -50, top: 0 });
  });

  it("cover × zoom scales both axes and keeps the focal point aligned", () => {
    const r = coverZoomRect(
      { width: 300, height: 100 },
      { width: 100, height: 100 },
      { x: 0, y: 1, zoom: 2 },
    );
    expect(r.width).toBe(600);
    expect(r.height).toBe(600);
    expect(r.left + 0).toBe(0); // x = 0 → left edges aligned
    expect(r.top).toBe(-500); // y = 1 → bottom edges aligned
  });

  it("the image always covers the frame (property)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 10, max: 2000 }),
        fc.integer({ min: 10, max: 2000 }),
        fc.integer({ min: 10, max: 4000 }),
        fc.integer({ min: 10, max: 4000 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 1, max: 4, noNaN: true }),
        (bw, bh, iw, ih, x, y, zoom) => {
          const r = coverZoomRect(
            { width: bw, height: bh },
            { width: iw, height: ih },
            { x, y, zoom },
          );
          const eps = 1e-6;
          expect(r.left).toBeLessThanOrEqual(eps);
          expect(r.top).toBeLessThanOrEqual(eps);
          expect(r.left + r.width).toBeGreaterThanOrEqual(bw - eps * bw);
          expect(r.top + r.height).toBeGreaterThanOrEqual(bh - eps * bh);
        },
      ),
    );
  });

  it("the CSS layer (cover + position + scale about the same point) equals cover × zoom", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 10, max: 2000 }),
        fc.integer({ min: 10, max: 2000 }),
        fc.integer({ min: 10, max: 4000 }),
        fc.integer({ min: 10, max: 4000 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 1, max: 4, noNaN: true }),
        (bw, bh, iw, ih, x, y, zoom) => {
          const box = { width: bw, height: bh };
          const img = { width: iw, height: ih };
          const a = coverZoomRect(box, img, { x, y, zoom });
          const b = cssRect(box, img, { x, y, zoom });
          for (const k of ["left", "top", "width", "height"] as const)
            expect(a[k]).toBeCloseTo(b[k], 6);
        },
      ),
    );
  });

  it("focalLayerStyle emits cover, position and scale about the focal point", () => {
    expect(focalLayerStyle({ x: 0.25, y: 0.6, zoom: 2 })).toEqual({
      backgroundSize: "cover",
      backgroundPosition: "25% 60%",
      backgroundRepeat: "no-repeat",
      transform: "scale(2)",
      transformOrigin: "25% 60%",
    });
    expect(focalLayerStyle(undefined).transform).toBeUndefined();
    expect(focalLayerStyle(undefined).backgroundPosition).toBe("50% 50%");
  });

  it("normalizes missing, out-of-range and non-finite values", () => {
    expect(normalizeFocal(undefined)).toEqual(DEFAULT_FOCAL);
    expect(normalizeFocal({ x: -1, y: 3, zoom: 0.1 })).toEqual({ x: 0, y: 1, zoom: 1 });
    expect(normalizeFocal({ x: Number.NaN, y: 0.2, zoom: 99 })).toEqual({
      x: 0.5,
      y: 0.2,
      zoom: MAX_ZOOM,
    });
    expect(roundFocal({ x: 0.123456, y: 0.98765, zoom: 1.33333 })).toEqual({
      x: 0.123,
      y: 0.988,
      zoom: 1.333,
    });
  });

  it("degenerate sizes fall back to the box", () => {
    expect(coverZoomRect({ width: 50, height: 40 }, { width: 0, height: 10 })).toEqual({
      left: 0,
      top: 0,
      width: 50,
      height: 40,
    });
  });

  it("dragging right moves the image right (focal x decreases); no overflow → no change", () => {
    const box = { width: 100, height: 100 };
    const wide = { width: 200, height: 100 };
    const f = panFocal(DEFAULT_FOCAL, { dx: 25, dy: 40 }, box, wide);
    expect(f.x).toBeCloseTo(0.25); // overflow 100 px → 25 px = 0.25
    expect(f.y).toBe(0.5); // no vertical overflow
    expect(panFocal(DEFAULT_FOCAL, { dx: -500, dy: 0 }, box, wide).x).toBe(1);
    // the drawn rect follows the pointer exactly
    const before = coverZoomRect(box, wide, DEFAULT_FOCAL);
    const after = coverZoomRect(box, wide, f);
    expect(after.left - before.left).toBeCloseTo(25);
  });

  it("zoom is clamped; pinch distance", () => {
    expect(zoomFocal(DEFAULT_FOCAL, 2.5).zoom).toBe(2.5);
    expect(zoomFocal(DEFAULT_FOCAL, 0.2).zoom).toBe(1);
    expect(zoomFocal(DEFAULT_FOCAL, 50).zoom).toBe(MAX_ZOOM);
    expect(zoomFocal({ x: 0.1, y: 0.2, zoom: 2 }, Number.NaN).zoom).toBe(2);
    expect(pointerDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it("screen deltas are un-rotated into the sheet's frame", () => {
    expect(screenToLocalDelta(10, 0, 0)).toEqual({ dx: 10, dy: 0 });
    // sheet rotated 90° clockwise: a screen drag down is a local drag right
    expect(screenToLocalDelta(0, 10, 90)).toEqual({ dx: 10, dy: 0 });
    expect(screenToLocalDelta(10, 0, 180)).toEqual({ dx: -10, dy: 0 });
    expect(screenToLocalDelta(10, 0, 270)).toEqual({ dx: 0, dy: 10 });
  });

  it("reads the rotation of computed CSS transforms", () => {
    expect(transformAngle("none")).toBe(0);
    expect(transformAngle(undefined)).toBe(0);
    expect(transformAngle("matrix(1, 0, 0, 1, 0, 0)")).toBe(0);
    expect(transformAngle("matrix(6.12323e-17, 1, -1, 6.12323e-17, 0, 0)")).toBe(90);
    expect(transformAngle("matrix(-1, 0, 0, -1, 0, 0)")).toBe(180);
    expect(transformAngle("matrix(0, -1, 1, 0, 0, 0)")).toBe(270);
    expect(transformAngle("matrix3d(0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)")).toBe(90);
    expect(transformAngle("rotate(10deg)")).toBe(0);
    expect(transformAngle("matrix(a, b)")).toBe(0);
    expect(matrixAngle(1, -1e-12)).toBe(0);
  });

  it("seat view aspect swaps for sideways seats and has a fallback", () => {
    expect(seatViewAspect({ width: 200, height: 100 }, 0)).toBe(2);
    expect(seatViewAspect({ width: 200, height: 100 }, 90)).toBe(0.5);
    expect(seatViewAspect({ width: 1000, height: 100 }, 180)).toBe(2.5);
    expect(seatViewAspect(undefined, 0)).toBe(1.5);
    expect(seatViewAspect({ width: 0, height: 10 }, 0, 1)).toBe(1);
  });
});
