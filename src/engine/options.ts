import type { GameOptions } from "./types";

/** Game-scope option defaults (§13.1-A/B; INP-006 2 s batch window; HIST-030 15 min idle gap). */
export function defaultGameOptions(overrides: Partial<GameOptions> = {}): GameOptions {
  return {
    autoKO: "auto",
    autoRevive: true,
    commanderDamageLifeLoss: true,
    partnersAllowed: true,
    turnTracking: false,
    historyEnabled: true,
    turnOrder: "clockwise",
    firstPlayerRule: "random",
    resetPerTurnFlags: true,
    tapForCalculator: false,
    firstTurnReminder: true,
    batchWindowMs: 2000,
    idleGapMs: 15 * 60_000,
    ...overrides,
  };
}

/** Default seat accent palette (matches --color-seat-1..8 in globals.css). */
export const SEAT_COLORS = [
  "#f472b6",
  "#60a5fa",
  "#facc15",
  "#34d399",
  "#fb923c",
  "#a78bfa",
  "#f87171",
  "#2dd4bf",
] as const;

export const MIN_SEATS = 1;
export const MAX_SEATS = 8;
/** Persisted Game schema version (instructions §10.5). */
export const GAME_SCHEMA_VERSION = 1;
/** Undo stack depth kept in memory (GAME-015 requires ≥ 50). */
export const UNDO_LIMIT = 100;
