/**
 * Pure helpers for the board UI (no React). Unit-tested in boardHelpers.test.ts.
 */
import {
  commanderDamageGrid,
  enumLabel,
  visibleBadges,
  type BadgeMode,
  type CounterDefinition,
  type Game,
  type SeatId,
} from "@/engine";
import type { AppSettings } from "@/state/settingsStore";

/** INP-004 repeat interval per "Hold repeat speed" setting. */
export const HOLD_REPEAT_MS: Record<AppSettings["holdRepeat"], number> = {
  slow: 600,
  normal: 400,
  fast: 200,
};

/** "+3" / "−3" (true minus sign). */
export function formatDelta(delta: number): string {
  if (delta > 0) return `+${delta}`;
  if (delta < 0) return `−${Math.abs(delta)}`;
  return "0";
}

/** Primary value as displayed (true minus for negatives). */
export function formatValue(value: number): string {
  return value < 0 ? `−${Math.abs(value)}` : String(value);
}

export interface TileMetrics {
  /** Height of the name-pill row (≥ 48 px touch target). */
  topH: number;
  /** Height of the mini-grid/badges row (0 when hidden). */
  bottomH: number;
  /** +/− glyph box size. */
  glyph: number;
  /** Number box (centre band between the pill row, glyph rows/columns and the bottom row). */
  numberTop: number;
  numberH: number;
  /** Primary number font size, px (LAY-008 auto-fit). */
  fontPx: number;
  /** Commander mini-grid cell size, px. */
  cellPx: number;
}

const clampN = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * LAY-008 auto-fit, in the seat player's frame (px): the number takes the space left by the pill
 * row, the +/− glyphs (columns on wide tiles, rows on tall ones) and the bottom row, and is as
 * large as fits `chars` tabular characters (≈ 0.6 em each).
 */
export function tileMetrics(
  frame: { w: number; h: number },
  opts: { wide: boolean; details: boolean; big: boolean; chars: number; gridRows: number },
): TileMetrics {
  const { w, h } = frame;
  const topH = opts.big ? 40 : 48;
  const bottomH = opts.details ? clampN(h * 0.24, 44, 60) : 0;
  const glyph = clampN(Math.min(w, h) * 0.13, 24, 52);
  const glyphCol = opts.wide ? glyph + 16 : 0;
  const glyphRow = opts.wide ? 0 : glyph + 8;
  const numberTop = topH + glyphRow;
  const numberH = Math.max(16, h - topH - bottomH - 2 * glyphRow);
  const availW = Math.max(16, opts.wide ? w - 2 * glyphCol - 8 : w * 0.84);
  const n = Math.max(2, opts.chars);
  const fontPx = Math.floor(Math.max(14, Math.min(numberH * 0.95, availW / (n * 0.64))));
  const rows = Math.max(1, opts.gridRows);
  // The grid sits in a corner, so it may grow above the bottom row on short tiles.
  const gridH = Math.max(bottomH, h * 0.3);
  const cellPx = Math.floor(clampN((gridH - 10 - 2 * (rows - 1)) / rows, 12, 22));
  return { topH, bottomH, glyph, numberTop, numberH, fontPx, cellPx };
}

/** Default seat background: a gradient from the seat colour into near-black. */
export function defaultSeatBackground(color: string): string {
  return `linear-gradient(160deg, ${color} 0%, color-mix(in srgb, ${color} 55%, #000) 100%)`;
}

export interface BadgeView {
  /** Unique per tile (`counterId` or `counterId-<index>` for per-commander instances). */
  key: string;
  counterId: string;
  icon: string;
  name: string;
  /** Text next to the icon ("" for tokens/booleans). */
  text: string;
}

function badgeText(def: CounterDefinition, value: number): string {
  if (def.kind === "token" || def.kind === "boolean") return "";
  if (def.kind === "enum") return enumLabel(def, value) ?? String(value);
  if (def.taxMultiplier !== undefined) return String(value * def.taxMultiplier);
  return formatValue(value);
}

/** LIFE-002 badges for a seat (tokens on the holder, non-default counters, …). */
export function seatBadges(game: Game, seatId: SeatId, mode: BadgeMode): BadgeView[] {
  return visibleBadges(game, seatId, mode).map((v) => ({
    key: v.sourceIndex ? `${v.def.id}-${v.sourceIndex}` : v.def.id,
    counterId: v.def.id,
    icon: v.def.icon,
    name: v.def.shortName ?? v.def.name,
    text: badgeText(v.def, v.value),
  }));
}

export interface DamageSummary {
  sourceSeatId: SeatId;
  /** One value per source commander (2 with partners). */
  values: number[];
  self: boolean;
}

/** CMD-002 damage received by `targetSeatId`, grouped by source seat (in seat order). */
export function damageSummary(game: Game, targetSeatId: SeatId): DamageSummary[] {
  const out: DamageSummary[] = [];
  for (const cell of commanderDamageGrid(game, targetSeatId)) {
    const last = out[out.length - 1];
    if (last && last.sourceSeatId === cell.sourceSeatId) last.values.push(cell.value);
    else out.push({ sourceSeatId: cell.sourceSeatId, values: [cell.value], self: cell.self });
  }
  return out;
}

/** True when the game tracks commander damage (an enabled playerVsOpponent counter). */
export function hasCommanderDamage(game: Game): boolean {
  return game.preset.counters.some(
    (c) => c.scope === "playerVsOpponent" && game.enabledCounters.includes(c.id),
  );
}

/** Global enum counters shown in the toolbar (e.g. Day/Night, TOK-003). */
export function toolbarGlobals(game: Game): CounterDefinition[] {
  return game.preset.counters.filter(
    (c) =>
      c.scope === "global" &&
      c.kind === "enum" &&
      c.visibility === "board" &&
      game.enabledCounters.includes(c.id),
  );
}

/** Icon for an enum state label (sun/moon for Day/Night); falls back to the counter icon. */
export function enumStateIcon(def: CounterDefinition, index: number): string {
  const label = (enumLabel(def, index) ?? "").toLowerCase();
  if (label === "day") return "sun";
  if (label === "night") return "moon";
  return def.icon;
}

/** Effective reduced-motion preference (A11Y-003). */
export function prefersReducedMotion(
  setting: AppSettings["reduceMotion"],
  systemReduces: boolean,
): boolean {
  if (setting === "always") return true;
  if (setting === "never") return false;
  return systemReduces;
}

/**
 * Test-build settings overrides from the URL (`s.cameraMode=bottom&s.onePlayerMode=1`). Values:
 * 1/0/true/false → boolean, numeric → number, else string. Invalid values are dropped later by
 * `mergeSettings`.
 */
export function parseSettingsParams(search: URLSearchParams): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, raw] of search.entries()) {
    if (!k.startsWith("s.")) continue;
    const key = k.slice(2);
    let v: unknown = raw;
    if (raw === "1" || raw === "true") v = true;
    else if (raw === "0" || raw === "false") v = false;
    else if (raw !== "" && !Number.isNaN(Number(raw))) v = Number(raw);
    out[key] = v;
  }
  // Numeric settings given as 1/0 were turned into booleans above; restore them.
  for (const key of ["holdDelayMs", "bubbleMs"]) {
    if (typeof out[key] === "boolean") out[key] = out[key] ? 1 : 0;
  }
  return out;
}
