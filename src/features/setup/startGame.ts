"use client";
/**
 * Start a game from a config: create it in the store, remember it for "Quick start" (GAME-001)
 * and flush the autosave so the board (and a reload) always finds it (GAME-016).
 */
import { recordNameUse } from "@/lib/profiles/repo";
import type { Game, NewGameConfig } from "@/engine";
import { flushAutosave, useGameStore } from "@/state/gameStore";
import { saveLastConfig } from "./gameConfig";

export async function startNewGame(config: NewGameConfig): Promise<Game> {
  const game = useGameStore.getState().newGame(config);
  try {
    await saveLastConfig(config);
  } catch (e) {
    console.warn("[setup] could not remember the last config", e);
  }
  // PROF-011: count games for name-only seats (default "Player N" names are skipped)
  for (const seat of game.seats) {
    if (!seat.profileId && seat.name.trim() && !/^player \d+$/i.test(seat.name.trim())) {
      await recordNameUse(seat.name, game.id).catch(() => 0);
    }
  }
  await flushAutosave();
  return game;
}

/** Load the stored game into the store when none is in memory (idempotent). */
export async function ensureGameLoaded(): Promise<void> {
  const s = useGameStore.getState();
  if (s.session || s.loadState === "loading") return;
  await s.resume();
}
