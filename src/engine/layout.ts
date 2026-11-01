/**
 * Board layout engine (T1.6) — PRD §7.1 (LAY-001..004, LAY-006, LAY-010), SET-032, SET-033.
 *
 * Pure geometry: `getLayout` turns a player count + variant + viewport into seat rectangles
 * (fractions 0–1 of the board box), a rotation per seat (the direction the seat's player faces)
 * and the toolbar strip. Seats are returned in CLOCKWISE physical order around the device, which
 * is the turn order (LAY-005): seat `i` of the game sits at `seats[i]`.
 *
 * Portrait layouts are described as horizontal "bands" (or, for 6–7 players, two side columns
 * split by a vertical toolbar). Landscape viewports re-flow (LAY-006) by computing the portrait
 * layout for the swapped viewport and rotating the whole picture 90° counter-clockwise, which
 * keeps each player's tile shape and the clockwise order (4 players become 2 top + 2 bottom).
 *
 * Not exported from `@/engine` (the index is frozen); import from `@/engine/layout`.
 */
import type { Rotation } from "./types";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SeatLayout {
  /** Seat order index (= index into game.seats). */
  index: number;
  rect: Rect;
  rotation: Rotation;
}

export type ToolbarOrientation = "horizontal" | "vertical";

export interface LayoutVariant {
  id: string;
  /** i18n key (`board.layout.<id>`); the engine can't translate. */
  label: string;
}

export interface BoardLayout {
  seats: SeatLayout[];
  toolbar: { rect: Rect; orientation: ToolbarOrientation };
  variants: LayoutVariant[];
  /** Resolved variant id (unknown ids fall back to the first variant). */
  variantId: string;
  orientation: "portrait" | "landscape";
}

export type CameraMode = "off" | "bottom" | "top";

export interface LayoutInput {
  players: number;
  variantId?: string;
  viewport: { w: number; h: number };
  cameraMode?: CameraMode;
  onePlayer?: boolean;
  /** LAY-004 per-seat manual rotation (Seat.rotationOverride), by seat index. */
  overrides?: readonly (Rotation | undefined)[];
}

/** Toolbar strip thickness in CSS px (≥ 48 px touch targets + padding). */
export const TOOLBAR_PX = 56;
export const MIN_LAYOUT_PLAYERS = 1;
export const MAX_LAYOUT_PLAYERS = 8;

// ---------------------------------------------------------------------------------------------
// Variant catalogue (portrait descriptions)
// ---------------------------------------------------------------------------------------------

/** A band of tiles spanning the full width; `weight` sets its share of the height. */
interface Band {
  kind: "band";
  cells: Rotation[];
  weight: number;
}
interface ToolbarBand {
  kind: "toolbar";
}
type BandSpec = Band | ToolbarBand;

interface BandsLayout {
  type: "bands";
  bands: BandSpec[];
}
/** Two side columns split by a vertical toolbar (6–7 players). */
interface ColumnsLayout {
  type: "columns";
  left: number;
  right: number;
}
type Spec = BandsLayout | ColumnsLayout;

const TB: ToolbarBand = { kind: "toolbar" };
const band = (cells: Rotation[], weight = 1): Band => ({ kind: "band", cells, weight });
const sides = (weight = 1) => band([90, 270], weight);
const bands = (...b: BandSpec[]): BandsLayout => ({ type: "bands", bands: b });

const VARIANTS: Record<number, [string, Spec][]> = {
  1: [["single", bands(band([0]), TB)]],
  2: [["faceOff", bands(band([180]), TB, band([0]))]],
  3: [
    ["topPair", bands(band([180]), TB, band([0, 0]))],
    ["sidesBottom", bands(sides(1.25), TB, band([0]))],
    ["pairBottom", bands(band([180, 180]), TB, band([0]))],
  ],
  4: [
    ["sides", bands(sides(), TB, sides())],
    ["topBottom", bands(band([180, 180]), TB, band([0, 0]))],
  ],
  5: [
    ["sidesBottom", bands(sides(), TB, sides(), band([0], 0.8))],
    ["sidesTop", bands(band([180], 0.8), sides(), TB, sides())],
  ],
  6: [
    ["sides", { type: "columns", left: 3, right: 3 }],
    ["sidesEnds", bands(band([180], 0.8), sides(), TB, sides(), band([0], 0.8))],
  ],
  7: [["sides", { type: "columns", left: 4, right: 3 }]],
  8: [["sides", bands(sides(), sides(), TB, sides(), sides())]],
};

/** Layout variants offered for a player count (LAY-003). */
export function layoutVariants(players: number): LayoutVariant[] {
  const n = clampPlayers(players);
  return VARIANTS[n]!.map(([id]) => ({ id, label: `board.layout.${id}` }));
}

function clampPlayers(players: number): number {
  if (!Number.isFinite(players)) return 2;
  return Math.min(MAX_LAYOUT_PLAYERS, Math.max(MIN_LAYOUT_PLAYERS, Math.round(players)));
}

// ---------------------------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------------------------

interface Cell {
  rect: Rect;
  rotation: Rotation;
}

function toolbarFraction(px: number): number {
  return Math.min(0.2, TOOLBAR_PX / Math.max(1, px));
}

function buildBands(spec: BandsLayout, h: number): { cells: Cell[]; toolbar: Rect } {
  const tb = toolbarFraction(h);
  const total = spec.bands.reduce((s, b) => s + (b.kind === "band" ? b.weight : 0), 0);
  const unit = (1 - tb) / total;
  const cells: Cell[] = [];
  let toolbar: Rect = { x: 0, y: 0, w: 1, h: tb };
  let y = 0;
  for (const b of spec.bands) {
    if (b.kind === "toolbar") {
      toolbar = { x: 0, y, w: 1, h: tb };
      y += tb;
      continue;
    }
    const bh = b.weight * unit;
    const cw = 1 / b.cells.length;
    b.cells.forEach((rotation, i) =>
      cells.push({ rect: { x: i * cw, y, w: cw, h: bh }, rotation }),
    );
    y += bh;
  }
  return { cells, toolbar };
}

function buildColumns(spec: ColumnsLayout, w: number): { cells: Cell[]; toolbar: Rect } {
  const tb = toolbarFraction(w);
  const cw = (1 - tb) / 2;
  const cells: Cell[] = [];
  const column = (count: number, x: number, rotation: Rotation) => {
    for (let i = 0; i < count; i++) {
      cells.push({ rect: { x, y: i / count, w: cw, h: 1 / count }, rotation });
    }
  };
  column(spec.left, 0, 90);
  column(spec.right, cw + tb, 270);
  return { cells, toolbar: { x: cw, y: 0, w: tb, h: 1 } };
}

/** Clockwise angle of a rect's centre around the board centre, in (−π, π]. */
function angleOf(r: Rect): number {
  const a = Math.atan2(r.y + r.h / 2 - 0.5, r.x + r.w / 2 - 0.5);
  return a <= -Math.PI + 1e-9 ? Math.PI : a;
}

/** Sort cells clockwise (screen y grows downward, so atan2 grows clockwise) from the left/top. */
function clockwise(cells: Cell[]): Cell[] {
  return [...cells].sort((a, b) => angleOf(a.rect) - angleOf(b.rect));
}

/** Rotate a portrait-frame rect 90° counter-clockwise into the landscape frame. */
function rotateRectCcw(r: Rect): Rect {
  return { x: r.y, y: 1 - r.x - r.w, w: r.h, h: r.w };
}

function rotateCcw(rotation: Rotation): Rotation {
  return ((rotation + 270) % 360) as Rotation;
}

const round = (v: number) => Math.round(v * 1e6) / 1e6;
const roundRect = (r: Rect): Rect => ({
  x: round(r.x),
  y: round(r.y),
  w: round(r.w),
  h: round(r.h),
});

/** Compute the board layout (pure). */
export function getLayout(input: LayoutInput): BoardLayout {
  const { viewport, cameraMode = "off", overrides = [] } = input;
  const onePlayer = input.onePlayer === true;
  const players = onePlayer ? 1 : clampPlayers(input.players);
  const options = VARIANTS[players]!;
  const chosen = options.find(([id]) => id === input.variantId) ?? options[0]!;
  const [variantId, spec] = chosen;
  // One-player mode keeps the tile upright in both orientations (SET-032).
  const landscape = viewport.w > viewport.h && !onePlayer;
  // Portrait-frame dimensions (swapped for landscape before rotating back).
  const pw = landscape ? viewport.h : viewport.w;
  const ph = landscape ? viewport.w : viewport.h;

  const built = spec.type === "bands" ? buildBands(spec, ph) : buildColumns(spec, pw);
  let cells = clockwise(built.cells);
  let toolbarRect = built.toolbar;
  let orientation: ToolbarOrientation = spec.type === "bands" ? "horizontal" : "vertical";
  if (landscape) {
    cells = cells.map((c) => ({ rect: rotateRectCcw(c.rect), rotation: rotateCcw(c.rotation) }));
    toolbarRect = rotateRectCcw(toolbarRect);
    orientation = orientation === "horizontal" ? "vertical" : "horizontal";
  }

  const seats: SeatLayout[] = cells.map((c, index) => {
    let rotation = c.rotation;
    if (cameraMode === "bottom") rotation = 0;
    else if (cameraMode === "top") rotation = 180;
    else if (overrides[index] !== undefined) rotation = overrides[index]!;
    return { index, rect: roundRect(c.rect), rotation };
  });

  return {
    seats,
    toolbar: { rect: roundRect(toolbarRect), orientation },
    variants: layoutVariants(players),
    variantId,
    orientation: landscape ? "landscape" : "portrait",
  };
}

// ---------------------------------------------------------------------------------------------
// Commander mini-grid placement (CMD-002)
// ---------------------------------------------------------------------------------------------

export interface MiniGridCell {
  index: number;
  col: number;
  row: number;
}

export interface MiniGrid {
  cols: number;
  rows: number;
  cells: MiniGridCell[];
}

/** Map a point (0–1 board frame) into the frame of a player whose content is rotated `r`. */
function toViewer(r: Rotation, x: number, y: number): { x: number; y: number } {
  switch (r) {
    case 0:
      return { x, y };
    case 90:
      return { x: y, y: 1 - x };
    case 180:
      return { x: 1 - x, y: 1 - y };
    case 270:
      return { x: 1 - y, y: x };
  }
}

function buckets(values: number[], tolerance: number): (v: number) => number {
  const sorted = [...values].sort((a, b) => a - b);
  const reps: number[] = [];
  for (const v of sorted) {
    if (reps.length === 0 || v - reps[reps.length - 1]! > tolerance) reps.push(v);
  }
  return (v) => {
    let best = 0;
    reps.forEach((rep, i) => {
      if (Math.abs(rep - v) < Math.abs(reps[best]! - v)) best = i;
    });
    return best;
  };
}

/**
 * The spatial arrangement of the board as seen by `viewerIndex` (their own tile is nearest them,
 * at the bottom of the grid): one cell per seat, positioned on a small cols × rows grid.
 */
export function miniGrid(layout: Pick<BoardLayout, "seats">, viewerIndex: number): MiniGrid {
  const viewer = layout.seats.find((s) => s.index === viewerIndex);
  const r = viewer?.rotation ?? 0;
  const pts = layout.seats.map((s) => ({
    index: s.index,
    ...toViewer(r, s.rect.x + s.rect.w / 2, s.rect.y + s.rect.h / 2),
  }));
  const tol = 0.05;
  const colOf = buckets(
    pts.map((p) => p.x),
    tol,
  );
  const rowOf = buckets(
    pts.map((p) => p.y),
    tol,
  );
  const cells = pts.map((p) => ({ index: p.index, col: colOf(p.x), row: rowOf(p.y) }));
  return {
    cols: Math.max(1, ...cells.map((c) => c.col + 1)),
    rows: Math.max(1, ...cells.map((c) => c.row + 1)),
    cells,
  };
}

/** Size of a seat tile in px as its player sees it (90/270 swap width and height). */
export function seatFrameSize(
  seat: Pick<SeatLayout, "rect" | "rotation">,
  viewport: { w: number; h: number },
): { w: number; h: number } {
  const w = seat.rect.w * viewport.w;
  const h = seat.rect.h * viewport.h;
  return seat.rotation === 90 || seat.rotation === 270 ? { w: h, h: w } : { w, h };
}
