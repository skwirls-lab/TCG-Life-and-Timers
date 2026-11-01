"use client";
/**
 * Start a game from a config: create it in the store, remember it for "Quick start" (GAME-001)
 * and flush the autosave so the board (and a reload) always finds it (GAME-016).
 * The game it replaces goes through the Who-won flow first (HIST-031).
 */
import { recordNameUse } from "@/lib/profiles/repo";
import type { Game, NewGameConfig } from "@/engine";
import { confirmReset } from "@/features/history-past/whoWon";
import { flushAutosave, useGameStore } from "@/state/gameStore";
import { saveLastConfig } from "./gameConfig";

/** The active game, loading the stored one first so a replaced game is never missed. */
export async function activeGame(): Promise<Game | null> {
  const s = useGameStore.getState();
  if (!s.session && s.loadState === "loading") {
    await new Promise<void>((resolve) => {
      const unsub = useGameStore.subscribe((st) => {
        if (st.loadState === "loading") return;
        unsub();
        resolve();
      });
    });
  } else if (!s.session && s.loadState === "idle") {
    await s.resume().catch(() => false);
  }
  return useGameStore.getState().session?.game ?? null;
}

/**
 * Replace the active game with a new one (HIST-031: asks "Who won?" when needed). Resolves to the
 * new game, or null when the user closed the prompt (the current game is kept).
 */
export async function startNewGame(config: NewGameConfig): Promise<Game | null> {
  if (!(await confirmReset(await activeGame()))) return null;
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
