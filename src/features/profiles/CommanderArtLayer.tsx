"use client";
/**
 * Board service for "Set seat backgrounds to commanders" (PROF-010, ART-008): watches the game and
 * gives seats their commander's art when the game starts and when a commander is set or changed
 * (precedence: art by hand > deck art > commander art > profile art, src/lib/art/commanderArt.ts).
 * Loaded lazily by /play so the Scryfall client stays out of the board's first chunks (PERF-003).
 * Renders nothing.
 */
import { useEffect } from "react";
import { resolveCommanderArt } from "@/lib/art/commanderArt";
import { createCommanderArtRunner } from "@/lib/art/commanderArtRunner";
import { cacheRemoteArt } from "@/lib/art/repo";
import { getScryfall } from "@/lib/art/scryfall";
import { t } from "@/lib/i18n";
import { useGameStore } from "@/state/gameStore";

export function CommanderArtLayer() {
  useEffect(() => {
    const runner = createCommanderArtRunner({
      getGame: () => useGameStore.getState().session?.game,
      apply: (seatId, art) =>
        useGameStore.getState().dispatch({ type: "SEAT_SET_ART", seatId, art }),
      resolve: (name) => resolveCommanderArt(name, getScryfall()),
      onApplied: (art) => void cacheRemoteArt(art.value).catch(() => false),
      placeholders: [
        t("seat.commander.fallback", { n: 1 }),
        t("seat.commander.fallback", { n: 2 }),
      ],
    });
    void runner.check();
    const unsub = useGameStore.subscribe((s, prev) => {
      if (s.session?.game !== prev.session?.game) void runner.check();
    });
    const onOnline = () => void runner.retryFailed();
    window.addEventListener("online", onOnline);
    return () => {
      unsub();
      window.removeEventListener("online", onOnline);
    };
  }, []);
  return null;
}
