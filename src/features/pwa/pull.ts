/** Pull distance (px) past which releasing refreshes the page. */
export const PULL_THRESHOLD = 96;

/** Indicator position and state for a pull of `dy` px (rubber-banded, capped). */
export function pullProgress(dy: number): { offset: number; ready: boolean; turn: number } {
  const d = Math.max(0, dy);
  return {
    offset: Math.round(Math.min(d * 0.5, 72)),
    ready: d >= PULL_THRESHOLD,
    turn: Math.round(Math.min(d / PULL_THRESHOLD, 1) * 270),
  };
}
