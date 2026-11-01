/**
 * Dice, coin and randomizer primitives (PRD §16 TOOL-001/002/003/008). Pure; randomness comes
 * from an injected `Rng` — production code passes `cryptoRng()` (crypto.getRandomValues with
 * rejection sampling, TOOL-007).
 */
import type { Rng } from "@/engine";

export const STANDARD_DICE = [4, 6, 8, 10, 12, 20] as const;
export const ALL_DICE = [...STANDARD_DICE, 100] as const;
export const CUSTOM_DIE_MIN = 2;
export const CUSTOM_DIE_MAX = 1000;
export const MULTI_DICE_MIN = 1;
export const MULTI_DICE_MAX = 10;

export type CoinFace = "heads" | "tails";

export interface DiceRoll {
  sides: number;
  values: number[];
  total: number;
}

export interface CoinFlips {
  /** Every flip in order. */
  flips: CoinFace[];
  /** Number of heads. */
  heads: number;
}

function assertSides(sides: number): void {
  if (!Number.isInteger(sides) || sides < CUSTOM_DIE_MIN || sides > CUSTOM_DIE_MAX) {
    throw new RangeError(`die sides must be an integer in ${CUSTOM_DIE_MIN}..${CUSTOM_DIE_MAX}`);
  }
}

/** Sanitize a user-entered custom die size into 2..1000 (non-numbers → fallback). */
export function clampDieSides(n: number, fallback = 20): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(CUSTOM_DIE_MAX, Math.max(CUSTOM_DIE_MIN, Math.round(n)));
}

/** Sanitize a dice count into 1..10. */
export function clampDiceCount(n: number): number {
  if (!Number.isFinite(n)) return MULTI_DICE_MIN;
  return Math.min(MULTI_DICE_MAX, Math.max(MULTI_DICE_MIN, Math.round(n)));
}

/** One die: uniform integer in 1..sides (sides in 2..1000). */
export function rollDie(rng: Rng, sides: number): number {
  assertSides(sides);
  return rng.int(sides) + 1;
}

/** `count` dice of `sides` (e.g. 3d6): each value and the sum. */
export function rollDice(rng: Rng, count: number, sides: number): DiceRoll {
  if (!Number.isInteger(count) || count < MULTI_DICE_MIN || count > MULTI_DICE_MAX) {
    throw new RangeError(`dice count must be an integer in ${MULTI_DICE_MIN}..${MULTI_DICE_MAX}`);
  }
  assertSides(sides);
  const values = Array.from({ length: count }, () => rollDie(rng, sides));
  return { sides, values, total: values.reduce((a, b) => a + b, 0) };
}

export function flipCoin(rng: Rng): CoinFace {
  return rng.int(2) === 0 ? "heads" : "tails";
}

/** Flip `count` coins ("Flip N"); count is clamped to 1..10. */
export function flipCoins(rng: Rng, count: number): CoinFlips {
  const flips = Array.from({ length: clampDiceCount(count) }, () => flipCoin(rng));
  return { flips, heads: flips.filter((f) => f === "heads").length };
}

/**
 * "Flip until tails" (Pokémon): flips until the first tails; `heads` counts the heads before it.
 * `maxFlips` is a safety net against a broken rng (the odds of reaching it are 2^-1000).
 */
export function flipUntilTails(rng: Rng, maxFlips = 1000): CoinFlips {
  const flips: CoinFace[] = [];
  for (let i = 0; i < maxFlips; i++) {
    const f = flipCoin(rng);
    flips.push(f);
    if (f === "tails") break;
  }
  return { flips, heads: flips.filter((f) => f === "heads").length };
}

/** Random seat among the given (living) seats (TOOL-003). */
export function pickPlayer<T>(rng: Rng, seatIds: readonly T[]): T {
  if (seatIds.length === 0) throw new RangeError("pickPlayer: no seats");
  return seatIds[rng.int(seatIds.length)]!;
}

/**
 * Random opponent of `chooserId` (TOOL-008): uniform among `aliveSeatIds` minus the chooser, so
 * it never returns the chooser or an eliminated seat. null when there is no living opponent.
 */
export function pickOpponent<T>(rng: Rng, chooserId: T, aliveSeatIds: readonly T[]): T | null {
  const candidates = aliveSeatIds.filter((id) => id !== chooserId);
  if (candidates.length === 0) return null;
  return candidates[rng.int(candidates.length)]!;
}
