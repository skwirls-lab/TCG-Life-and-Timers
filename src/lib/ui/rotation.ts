export type Rotation = 0 | 90 | 180 | 270;

/** Size of the content box after rotating to face a player (90/270 swap width and height). */
export function rotatedSize(rotation: Rotation, width: number, height: number) {
  return rotation === 90 || rotation === 270 ? { width: height, height: width } : { width, height };
}

/**
 * Map a point from the screen-space box (origin top-left) into the rotated content's local frame.
 * Used by gesture code that needs "up/down relative to the player".
 */
export function toLocal(rotation: Rotation, x: number, y: number, width: number, height: number) {
  switch (rotation) {
    case 0:
      return { x, y };
    case 90:
      // content rotated 90° clockwise: local x runs down the screen, local y runs right-to-left
      return { x: y, y: width - x };
    case 180:
      return { x: width - x, y: height - y };
    case 270:
      return { x: height - y, y: x };
  }
}

export function nextRotation(r: Rotation): Rotation {
  return ((r + 90) % 360) as Rotation;
}
