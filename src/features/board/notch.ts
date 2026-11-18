/**
 * MENU: pure geometry for the center menu button. Without the toolbar strip the button sits on
 * the seam point, which in many layouts is the middle of a seat's top edge (its name row). The
 * board computes where the button (and its match pill) cuts into each seat's name row, and the
 * tile moves its name pill / chips aside. Unit-tested in notch.test.ts.
 */
import type { Rotation } from "@/lib/ui/rotation";

/** Screen box (px), e.g. a tile's content box or the area the center button covers. */
export interface PxBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Name-row depth (px, in the seat's frame) kept clear of the center button. */
export const NOTCH_DEPTH_PX = 56;

/** Center button diameter, px (≥ 48 px touch target). */
export const CENTER_BUTTON_PX = 56;
/** Clearance kept around the button and its pill, px. */
const CLEAR_PX = 6;
/** Match pill (overlapping the button's lower edge): max width / height, px. */
const PILL_W = 84;
const PILL_H = 24;
/** How far the pill's top sits below the button centre, px. */
export const PILL_OFFSET_PX = CENTER_BUTTON_PX / 2 - 10;

/** Screen box covered by the center button at (cx, cy), with its match pill when shown. */
export function centerCover(cx: number, cy: number, pill: boolean): PxBox {
  const r = CENTER_BUTTON_PX / 2 + CLEAR_PX;
  const box = { left: cx - r, top: cy - r, right: cx + r, bottom: cy + r };
  if (!pill) return box;
  const half = PILL_W / 2 + CLEAR_PX;
  return {
    left: Math.min(box.left, cx - half),
    right: Math.max(box.right, cx + half),
    top: box.top,
    bottom: Math.max(box.bottom, cy + PILL_OFFSET_PX + PILL_H + CLEAR_PX),
  };
}

/**
 * Where `cover` cuts into a seat's name row: the interval [from, to] along the tile's top edge in
 * the player's frame (px from the player's left), or null when it doesn't reach the name row.
 * `tile` is the tile's on-screen box; `rotation` the direction its player faces.
 */
export function seatNotch(
  tile: PxBox,
  rotation: Rotation,
  cover: PxBox,
  depth = NOTCH_DEPTH_PX,
): [number, number] | null {
  let band: PxBox;
  let along: (x: number, y: number) => number;
  switch (rotation) {
    case 0:
      band = { ...tile, bottom: Math.min(tile.bottom, tile.top + depth) };
      along = (x) => x - tile.left;
      break;
    case 180:
      band = { ...tile, top: Math.max(tile.top, tile.bottom - depth) };
      along = (x) => tile.right - x;
      break;
    case 90:
      band = { ...tile, left: Math.max(tile.left, tile.right - depth) };
      along = (_x, y) => y - tile.top;
      break;
    default:
      band = { ...tile, right: Math.min(tile.right, tile.left + depth) };
      along = (_x, y) => tile.bottom - y;
      break;
  }
  const left = Math.max(band.left, cover.left);
  const right = Math.min(band.right, cover.right);
  const top = Math.max(band.top, cover.top);
  const bottom = Math.min(band.bottom, cover.bottom);
  if (right - left <= 0.5 || bottom - top <= 0.5) return null;
  const a = along(left, top);
  const b = along(right, bottom);
  const length =
    rotation === 0 || rotation === 180 ? tile.right - tile.left : tile.bottom - tile.top;
  const from = Math.max(0, Math.min(a, b));
  const to = Math.min(length, Math.max(a, b));
  return to > from ? [Math.round(from), Math.round(to)] : null;
}

export type NotchRow =
  | { kind: "none" }
  | { kind: "split"; from: number; to: number }
  | { kind: "pad"; side: "left" | "right"; pad: number };

/**
 * How a seat's name row avoids a notch: one near the middle splits the row around it (name on
 * the left, chips on the right); one toward an end pads that side of the row.
 */
export function notchRow(
  notch: readonly [number, number] | null | undefined,
  width: number,
): NotchRow {
  if (!notch || width <= 0) return { kind: "none" };
  const [from, to] = notch;
  const mid = (from + to) / 2;
  if (Math.abs(mid - width / 2) < width / 4) return { kind: "split", from, to };
  return mid < width / 2
    ? { kind: "pad", side: "left", pad: Math.round(to) }
    : { kind: "pad", side: "right", pad: Math.round(width - from) };
}
