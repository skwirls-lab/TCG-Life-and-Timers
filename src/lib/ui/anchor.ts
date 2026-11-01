/**
 * Seat-anchored overlays (D-043 / D-058, TMR-004): where a small overlay (the pass-turn Undo
 * snackbar) goes so it sits near a seat and faces that seat's player.
 *
 * - `registerSeatAnchor(seatId, el)` lets the board register each seat tile's element; a snackbar
 *   anchored to `seatId` is then placed toward that player's edge of the tile.
 * - Without a registered tile, the caller's own rect (e.g. the PASS TURN button) is used and the
 *   overlay is centred on it.
 */
import type { Rotation } from "./rotation";

export interface AnchorRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface AnchorPlacement {
  /** Centre of the overlay (viewport px). */
  x: number;
  y: number;
  rotation: Rotation;
  /** Max overlay width in its own (rotated) frame. */
  maxWidth: number;
}

const anchors = new Map<string, Element>();

/** Register a seat tile element; returns the unregister function. */
export function registerSeatAnchor(seatId: string, el: Element): () => void {
  anchors.set(seatId, el);
  return () => {
    if (anchors.get(seatId) === el) anchors.delete(seatId);
  };
}

export function seatAnchorRect(seatId: string | undefined): AnchorRect | null {
  if (seatId === undefined) return null;
  const el = anchors.get(seatId);
  if (!el || !el.isConnected) return null;
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

/** Unit vector pointing to the player's edge ("down" in the seat's frame). */
function down(rotation: Rotation): [number, number] {
  switch (rotation) {
    case 0:
      return [0, 1];
    case 90:
      return [-1, 0];
    case 180:
      return [0, -1];
    case 270:
      return [1, 0];
  }
}

const MAX_W = 448;
const PAD = 8;

/**
 * Placement for an overlay anchored to `rect`. `region: 'seat'` moves it halfway from the centre
 * to the player's edge of a seat tile; 'center' centres it on the rect; 'above' puts it just
 * beyond the rect on the side away from the player (so a control under the finger stays
 * uncovered). The centre is clamped so the overlay stays inside the viewport.
 */
export function anchorPlacement(
  rect: AnchorRect,
  rotation: Rotation,
  region: "seat" | "center" | "above",
  viewport: { width: number; height: number },
  overlayHeight = 56,
): AnchorPlacement {
  const sideways = rotation === 90 || rotation === 270;
  const across = sideways ? rect.height : rect.width;
  const along = sideways ? rect.width : rect.height;
  const [dx, dy] = down(rotation);
  const shift =
    region === "seat"
      ? Math.max(0, along / 4)
      : region === "above"
        ? -(along / 2 + overlayHeight / 2 + PAD)
        : 0;
  // A small anchor (a button) may be narrower than the message: allow up to 320 px around it.
  const room =
    region === "above"
      ? Math.min(320 + 2 * PAD, sideways ? viewport.height : viewport.width)
      : across;
  const maxWidth = Math.max(160, Math.min(MAX_W, room - 2 * PAD));
  const halfW = (sideways ? overlayHeight : maxWidth) / 2;
  const halfH = (sideways ? maxWidth : overlayHeight) / 2;
  const clamp = (v: number, half: number, size: number) =>
    size <= 2 * (half + PAD) ? size / 2 : Math.min(size - half - PAD, Math.max(half + PAD, v));
  return {
    x: clamp(rect.left + rect.width / 2 + dx * shift, halfW, viewport.width),
    y: clamp(rect.top + rect.height / 2 + dy * shift, halfH, viewport.height),
    rotation,
    maxWidth,
  };
}
