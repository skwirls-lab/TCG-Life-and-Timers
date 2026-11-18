/**
 * Automatic commander backgrounds (PROF-010, ART-008): whenever the game changes (a new game
 * starts, a seat sets or changes its commander, the option is switched on) every seat that
 * `seatsNeedingCommanderArt` selects gets its commander's art, resolved once per seat + name.
 * Failures (offline without a cached copy, unknown card name) are quiet and retried after
 * `retryFailed()` (the board calls it when the device comes back online). Precedence is in
 * ./commanderArt.ts; the resolved art is re-checked against the latest game before it's applied,
 * so art picked by hand in the meantime always wins.
 */
import type { ArtRef, Game, SeatId } from "@/engine";
import {
  commanderKey,
  seatsNeedingCommanderArt,
  stillNeedsCommanderArt,
  withOrigin,
  type CommanderArtTarget,
} from "./commanderArt";

type GameLike = Pick<Game, "id" | "preset" | "enabledCounters" | "options" | "seats">;

export interface CommanderArtRunnerDeps {
  getGame: () => GameLike | null | undefined;
  apply: (seatId: SeatId, art: ArtRef) => void;
  /** commander name → art (ART-008 resolution); throws when it can't */
  resolve: (name: string) => Promise<ArtRef>;
  /** after art was applied (e.g. keep an offline copy of the image) */
  onApplied?: (art: ArtRef) => void;
  /** "Commander N" placeholder names that are never looked up */
  placeholders?: readonly string[];
}

export interface CommanderArtRunner {
  /** Apply commander art where needed; resolves when this round's lookups have settled. */
  check: () => Promise<void>;
  /** Forget failed lookups (e.g. back online) and check again. */
  retryFailed: () => Promise<void>;
}

export function createCommanderArtRunner(deps: CommanderArtRunnerDeps): CommanderArtRunner {
  const placeholders = deps.placeholders ?? [];
  const inflight = new Set<string>();
  const failed = new Set<string>();
  const keyOf = (gameId: string, t: CommanderArtTarget) =>
    `${gameId}\u0000${t.seatId}\u0000${commanderKey(t.name)}`;

  async function run(gameId: string, target: CommanderArtTarget): Promise<void> {
    const key = keyOf(gameId, target);
    inflight.add(key);
    try {
      const art = await deps.resolve(target.name);
      const latest = deps.getGame();
      if (!latest || latest.id !== gameId) return;
      if (!stillNeedsCommanderArt(latest, target, placeholders)) return;
      const tagged = withOrigin(art, "commander");
      deps.apply(target.seatId, tagged);
      deps.onApplied?.(tagged);
    } catch {
      failed.add(key); // degrade quietly: the seat keeps its current background
    } finally {
      inflight.delete(key);
    }
  }

  async function check(): Promise<void> {
    const game = deps.getGame();
    if (!game) return;
    const jobs = seatsNeedingCommanderArt(game, placeholders).filter((t) => {
      const key = keyOf(game.id, t);
      return !inflight.has(key) && !failed.has(key);
    });
    await Promise.all(jobs.map((t) => run(game.id, t)));
  }

  return {
    check,
    retryFailed: () => {
      failed.clear();
      return check();
    },
  };
}
