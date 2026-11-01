/** Commander damage helpers (CMD-001..005). Pure. */
import { enabledCounters, type CounterDefinition, type Game } from "@/engine";

/** The commander-damage counter of a game (first enabled playerVsOpponent counter). */
export function matrixCounter(game: Game): CounterDefinition | undefined {
  return enabledCounters(game).find((d) => d.scope === "playerVsOpponent");
}

export type CellLevel = "none" | "warning" | "lethal";

/** Warning when within 5 of the threshold, lethal at/over it (CMD-005). */
export function cellLevel(value: number, threshold: number | null): CellLevel {
  if (threshold === null || value <= 0) return "none";
  if (value >= threshold) return "lethal";
  return value >= threshold - 5 ? "warning" : "none";
}
