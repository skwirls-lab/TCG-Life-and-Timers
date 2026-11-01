/**
 * Record-keeping decisions (HIST-008, HIST-031, HIST-032). Pure.
 */
import { hasMeaningfulActivity, type Game } from "@/engine";
import { shouldDiscard } from "./activity";

export type WhoWonSetting = "always" | "unclear" | "never";

/** What to do with the current game when the user resets or starts a new one. */
export type ResetPlan =
  /** Keep nothing (history off, trivial game, or already recorded). */
  | "skip"
  /** Save with the detected result (or no winner). */
  | "save"
  /** Ask "Who won?". */
  | "prompt";

/** HIST-008: history is kept unless the game's "Game history" option is off. */
export function historyEnabled(game: Pick<Game, "options"> | null | undefined): boolean {
  return game?.options.historyEnabled !== false;
}

/**
 * HIST-008: whether the history entry point (toolbar 🕒) should be shown. `settings` is accepted
 * for future app-scope switches; today the game option alone decides.
 */
export function historyVisible(
  _settings: unknown,
  game: Pick<Game, "options"> | null | undefined,
): boolean {
  return historyEnabled(game);
}

/** True when the game has a detected winner. */
export function hasWinner(game: Game): boolean {
  return (game.result?.winners.length ?? 0) > 0;
}

/**
 * HIST-031 decision table:
 * - history off → skip; trivial game (HIST-032) → skip
 * - an ended game was recorded when it ended → skip (unless "always" and no winner)
 * - "never" → save; "always" → prompt unless a winner was detected
 * - "unclear" → prompt when meaningful (≥ 3 changes or ≥ 5 min active) and no winner; else save
 */
export function resetPlan(game: Game, now: number, setting: WhoWonSetting): ResetPlan {
  if (!historyEnabled(game)) return "skip";
  if (shouldDiscard(game, now)) return "skip";
  const winner = hasWinner(game);
  if (game.status === "ended" && (winner || setting !== "always")) return "skip";
  if (setting === "never") return "save";
  if (setting === "always") return winner ? "save" : "prompt";
  return !winner && hasMeaningfulActivity(game, now) ? "prompt" : "save";
}
