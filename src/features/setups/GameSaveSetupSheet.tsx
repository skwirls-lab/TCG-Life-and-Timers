"use client";
/**
 * The game menu's "Save as preset" (lazy chunk, PERF-003: nothing here ships with /play's first
 * load). Snapshots the running game's config and seats; offers "Update '<name>'" when the game
 * was started from a preset.
 */
import { useEffect, useMemo, useState } from "react";
import type { SavedSetup } from "@/lib/setups";
import { useGameStore } from "@/state/gameStore";
import { setupSourceOf } from "./actions";
import { draftFromGame, suggestSetupName } from "./model";
import { SaveSetupSheet } from "./SaveSetupSheet";

export function GameSaveSetupSheet({ onClose }: { onClose: () => void }) {
  const game = useGameStore((s) => s.session?.game);
  const draft = useMemo(() => (game ? draftFromGame(game) : null), [game]);
  const [source, setSource] = useState<SavedSetup | null | undefined>(undefined);
  const gameId = game?.id;

  useEffect(() => {
    if (!gameId) return;
    let alive = true;
    setupSourceOf(gameId)
      .then((s) => alive && setSource(s ?? null))
      .catch(() => alive && setSource(null));
    return () => {
      alive = false;
    };
  }, [gameId]);

  if (!game || source === undefined) return null;
  return (
    <SaveSetupSheet
      open
      onClose={onClose}
      draft={draft}
      source={source}
      suggestion={suggestSetupName(
        game.seats.map((s) => s.name),
        game.preset.name,
      )}
    />
  );
}

export default GameSaveSetupSheet;
