/**
 * INP-005 swipe-to-change: classify a pointer movement on a seat tile as a vertical swipe in the
 * seat player's own frame. Pure, so it is unit-tested without a DOM.
 */
import { toLocal, type Rotation } from "./rotation";

/** Minimum travel (CSS px, in the player's frame) for a swipe. */
export const SWIPE_MIN_PX = 36;
/** The vertical travel must dominate the horizontal travel by this factor. */
export const SWIPE_DOMINANCE = 1.5;

export type SwipeDirection = "up" | "down";

/** A screen-space movement vector expressed in the rotated content's frame. */
export function localDelta(rotation: Rotation, dx: number, dy: number) {
  // toLocal maps points; the difference of two mapped points is the mapped vector.
  const a = toLocal(rotation, 0, 0, 0, 0);
  const b = toLocal(rotation, dx, dy, 0, 0);
  return { dx: b.x - a.x, dy: b.y - a.y };
}

/**
 * "up"/"down" for the player sitting at the seat (rotation = the tile's content rotation), or null
 * when the movement is too short or not vertical enough (a drag sideways, a wobbly tap).
 */
export function classifySwipe(
  rotation: Rotation,
  dx: number,
  dy: number,
  minPx = SWIPE_MIN_PX,
): SwipeDirection | null {
  const d = localDelta(rotation, dx, dy);
  const v = Math.abs(d.dy);
  if (v < minPx || v < Math.abs(d.dx) * SWIPE_DOMINANCE) return null;
  return d.dy < 0 ? "up" : "down";
}
