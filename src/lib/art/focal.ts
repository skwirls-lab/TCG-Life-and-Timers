/**
 * Focal point / zoom math for seat background art (ART-004).
 *
 * A focal point `{x, y, zoom}` uses image-relative coordinates: x/y in [0, 1] name the image point
 * that is aligned with the same relative point of the frame (CSS `background-position: x% y%`
 * semantics), and `zoom` multiplies the "cover" scale. The frame is always fully covered.
 *
 * Two equivalent renderings:
 * - `coverZoomRect` computes the drawn image rectangle in px (editor, tests);
 * - `focalLayerStyle` expresses it in pure CSS with no measurement: an inner layer with
 *   `background-size: cover` + `background-position: x% y%`, scaled by `zoom` around the same
 *   point (`transform-origin: x% y%`). Scaling around the aligned point keeps that image point
 *   fixed, so the result is exactly the cover × zoom rectangle (unit-tested).
 */
import type { ArtFocal } from "@/engine";

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;
export const DEFAULT_FOCAL: ArtFocal = { x: 0.5, y: 0.5, zoom: 1 };

export interface Size {
  width: number;
  height: number;
}

export interface Rect extends Size {
  left: number;
  top: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const finite = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);

/** Sanitize a (possibly synced / legacy) focal point into display range. */
export function normalizeFocal(focal: Partial<ArtFocal> | undefined): ArtFocal {
  return {
    x: clamp(finite(focal?.x, 0.5), 0, 1),
    y: clamp(finite(focal?.y, 0.5), 0, 1),
    zoom: clamp(finite(focal?.zoom, 1), MIN_ZOOM, MAX_ZOOM),
  };
}

/** Round to 3 decimals (stored values stay small and stable). */
export function roundFocal(f: ArtFocal): ArtFocal {
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return { x: r(f.x), y: r(f.y), zoom: r(f.zoom) };
}

/** The image rectangle drawn inside `box` for `focal` ("cover" scale × zoom). */
export function coverZoomRect(box: Size, image: Size, focal?: Partial<ArtFocal>): Rect {
  const f = normalizeFocal(focal);
  if (image.width <= 0 || image.height <= 0 || box.width <= 0 || box.height <= 0)
    return { left: 0, top: 0, width: box.width, height: box.height };
  const scale = Math.max(box.width / image.width, box.height / image.height) * f.zoom;
  const width = image.width * scale;
  const height = image.height * scale;
  return {
    width,
    height,
    left: (box.width - width) * f.x,
    top: (box.height - height) * f.y,
  };
}

const pct = (v: number) => `${Math.round(v * 10000) / 100}%`;

export interface FocalLayerStyle {
  backgroundSize: string;
  backgroundPosition: string;
  backgroundRepeat: string;
  transform?: string;
  transformOrigin: string;
}

/** Styles for the inner art layer (absolutely positioned to fill a clipping frame). */
export function focalLayerStyle(focal?: Partial<ArtFocal>): FocalLayerStyle {
  const f = normalizeFocal(focal);
  const pos = `${pct(f.x)} ${pct(f.y)}`;
  return {
    backgroundSize: "cover",
    backgroundPosition: pos,
    backgroundRepeat: "no-repeat",
    ...(f.zoom > 1 ? { transform: `scale(${Math.round(f.zoom * 1000) / 1000})` } : {}),
    transformOrigin: pos,
  };
}

/**
 * Pan by a pointer delta (px in the frame's own, un-rotated coordinates). Dragging right moves the
 * image right, i.e. reveals more of its left side. Axes without overflow don't move.
 */
export function panFocal(
  focal: ArtFocal,
  delta: { dx: number; dy: number },
  box: Size,
  image: Size,
): ArtFocal {
  const f = normalizeFocal(focal);
  const r = coverZoomRect(box, image, f);
  const ox = r.width - box.width;
  const oy = r.height - box.height;
  return {
    x: ox > 0.5 ? clamp(f.x - delta.dx / ox, 0, 1) : f.x,
    y: oy > 0.5 ? clamp(f.y - delta.dy / oy, 0, 1) : f.y,
    zoom: f.zoom,
  };
}

/** Set zoom (pinch ratio or slider), clamped. */
export function zoomFocal(focal: ArtFocal, zoom: number): ArtFocal {
  const f = normalizeFocal(focal);
  return { ...f, zoom: clamp(finite(zoom, f.zoom), MIN_ZOOM, MAX_ZOOM) };
}

/** Distance between two pointers (pinch). */
export function pointerDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Convert a screen-space delta into the local frame of an element rotated by `angleDeg`
 * (the seat menu sheet turns to face its player, so screen drags must be un-rotated).
 */
export function screenToLocalDelta(dx: number, dy: number, angleDeg: number) {
  const a = (-angleDeg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const r = (v: number) => (Math.abs(v) < 1e-9 ? 0 : Math.round(v * 1e6) / 1e6);
  return { dx: r(dx * cos - dy * sin), dy: r(dx * sin + dy * cos) };
}

/** Rotation angle (deg, 0–359) of a 2D CSS matrix `matrix(a, b, c, d, e, f)`. */
export function matrixAngle(a: number, b: number): number {
  const deg = (Math.atan2(b, a) * 180) / Math.PI;
  return Math.round(((deg % 360) + 360) % 360) % 360;
}

/** Parse a computed `transform` value (`matrix(...)` / `matrix3d(...)`) into its rotation (deg). */
export function transformAngle(transform: string | null | undefined): number {
  if (!transform || transform === "none") return 0;
  const m = /^matrix(?:3d)?\(([^)]+)\)$/.exec(transform.trim());
  if (!m) return 0;
  const [a, b] = m[1]!.split(",").map((s) => Number(s.trim()));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return matrixAngle(a!, b!);
}

/** Aspect ratio (w / h) of a seat as its player sees it (sideways seats swap axes). */
export function seatViewAspect(tile: Size | undefined, rotation: number, fallback = 1.5): number {
  if (!tile || tile.width <= 0 || tile.height <= 0) return fallback;
  const sideways = rotation === 90 || rotation === 270;
  const ar = sideways ? tile.height / tile.width : tile.width / tile.height;
  return clamp(ar, 0.4, 2.5);
}
