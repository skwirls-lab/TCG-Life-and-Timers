/**
 * Pure game-flow helpers (T1.13): first-player spin timing (GAME-011), cause text, game-over
 * stats (GAME-014) and undoable-change detection for the undo snackbar (GAME-015).
 */
import {
  activeDuration,
  describeCause,
  type EliminationCause,
  type Game,
  type GameEvent,
  type SeatId,
} from "@/engine";
import { t } from "@/lib/i18n";

/** Total spin length (GAME-011: ~1.5–2 s). */
export const SPIN_MS = 1800;

export interface SpinStep {
  index: number;
  /** Delay before showing this step (ms). */
  delayMs: number;
}

/**
 * A decelerating highlight sequence over `n` seats that ends on `target` and lasts ~totalMs.
 * At least two full laps before landing.
 */
export function spinSequence(n: number, target: number, totalMs = SPIN_MS): SpinStep[] {
  if (n <= 0) return [];
  const t0 = ((target % n) + n) % n;
  if (n === 1) return [{ index: 0, delayMs: 0 }];
  const laps = n <= 3 ? 4 : n <= 5 ? 3 : 2;
  const steps = laps * n + t0 + 1;
  // Step 0 shows immediately; steps 1..n-1 share totalMs with cubic easing (slow at the end).
  const weights = Array.from({ length: steps }, (_, i) => {
    if (i === 0) return 0;
    const x = i / (steps - 1);
    return 1 + 7 * x * x * x;
  });
  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.map((w, i) => ({
    index: i % n,
    delayMs: i === 0 ? 0 : Math.round((w / sum) * totalMs),
  }));
}

/** The latest firstPlayer event in the log (new game, reset or SET_FIRST_PLAYER). */
export function latestFirstPlayerEvent(game: Game): GameEvent | undefined {
  for (let i = game.log.length - 1; i >= 0; i--) {
    if (game.log[i]!.kind === "firstPlayer") return game.log[i];
  }
  return undefined;
}

/** A fresh first-player pick worth announcing (the game hasn't really begun yet). */
export function shouldAnnounce(game: Game): boolean {
  return game.status === "ready" && game.activity.changes === 0 && !game.turn.awaitingFirstPlayer;
}

export function seatName(game: Game, seatId: SeatId | undefined): string {
  return game.seats.find((s) => s.id === seatId)?.name ?? "";
}

/** Human-readable elimination cause ("21 commander damage from Conner", "Poison 10"). */
export function formatCause(game: Game, seatId: SeatId, cause: EliminationCause): string {
  const d = describeCause(game, seatId, cause);
  switch (d.kind) {
    case "concede":
      return t("shell.cause.concede");
    case "time":
      return t("shell.cause.time");
    case "manual":
      return t("shell.cause.manual");
    default: {
      const counter = d.counterName ?? d.counterId ?? "";
      const value = d.value ?? "";
      if (d.sourceName) {
        return t("shell.cause.thresholdFrom", {
          value,
          counter,
          source: d.commanderName ? `${d.sourceName} (${d.commanderName})` : d.sourceName,
        });
      }
      return t("shell.cause.threshold", { value, counter });
    }
  }
}

export interface GameOverStats {
  winners: string[];
  durationMs: number;
  turns: number;
  rounds: number;
  eliminated: { seatId: SeatId; name: string; cause: string; turn: number }[];
}

export function gameOverStats(game: Game): GameOverStats {
  const result = game.result;
  const endedAt = result?.endedAt ?? game.endedAt ?? game.activity.lastAt ?? game.createdAt;
  return {
    winners: (result?.winners ?? []).map((id) => seatName(game, id)).filter(Boolean),
    durationMs: activeDuration(game, endedAt),
    turns: game.turn.turnNumber,
    rounds: game.turn.round,
    eliminated: (result?.eliminated ?? game.eliminations).map((e) => ({
      seatId: e.seatId,
      name: e.name,
      cause: formatCause(game, e.seatId, e.cause),
      turn: e.turn,
    })),
  };
}

export type UndoableChange = { kind: "reset" } | { kind: "eliminate"; seatIds: SeatId[] } | null;

/**
 * Detect a destructive change between two consecutive games (GAME-015 snackbar): a reset (new id
 * whose log starts with a 'reset' event) or new eliminations within the same game.
 */
export function detectUndoable(
  prev: Game | undefined,
  next: Game | undefined,
  isUndo = false,
): UndoableChange {
  if (!prev || !next || prev === next || isUndo) return null;
  if (prev.id !== next.id) {
    return next.log.some((e) => e.kind === "reset") ? { kind: "reset" } : null;
  }
  if (next.eliminations.length > prev.eliminations.length) {
    const before = new Set(prev.eliminations.map((e) => e.seatId));
    const seatIds = next.eliminations.map((e) => e.seatId).filter((id) => !before.has(id));
    return seatIds.length ? { kind: "eliminate", seatIds } : null;
  }
  return null;
}
