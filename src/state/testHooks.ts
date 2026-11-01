"use client";
/**
 * Test-only hooks (instructions §10.4). Active ONLY in builds with NEXT_PUBLIC_TEST_HOOKS=1
 * (the `.next-test` / `.next-emu` builds); production builds compile this to a no-op.
 *
 * URL params understood by `applyTestHooks` (used by /play and other pages in e2e):
 *   seed=<int>          deterministic RNG for the game store
 *   quick=<presetId>    start a new game immediately (e.g. quick=mtg.commander)
 *   players=<n>         player count for quick start
 *   names=A,B,C         seat names for quick start
 *   start=<n>           start value override for the preset's primary counter
 *   layout=<id>         layout variant id
 * It also exposes `window.__tcg` = { getState, dispatch } for e2e assertions.
 */
import { primaryCounter, seededRng } from "@/engine";
import { getBuiltInPreset } from "@/presets";
import { configureGameStore, useGameStore } from "./gameStore";

export const TEST_HOOKS_ENABLED = process.env.NEXT_PUBLIC_TEST_HOOKS === "1";

declare global {
  interface Window {
    __tcg?: {
      getState: typeof useGameStore.getState;
      dispatch: ReturnType<typeof useGameStore.getState>["dispatch"];
    };
  }
}

/** Returns true when a quick-start game was created. */
export function applyTestHooks(search: URLSearchParams): boolean {
  if (!TEST_HOOKS_ENABLED || typeof window === "undefined") return false;
  window.__tcg = {
    getState: useGameStore.getState,
    dispatch: (a) => useGameStore.getState().dispatch(a),
  };
  const seed = search.get("seed");
  if (seed !== null) configureGameStore({ rng: seededRng(Number(seed) || 1) });
  const quick = search.get("quick");
  if (!quick) return false;
  const preset = getBuiltInPreset(quick);
  if (!preset) return false;
  const players = Number(search.get("players") ?? preset.defaultPlayers);
  const names = search.get("names")?.split(",");
  const start = search.get("start");
  const primary = primaryCounter(preset);
  useGameStore.getState().newGame({
    preset,
    players,
    seats: names?.map((name) => ({ name })),
    layoutId: search.get("layout") ?? undefined,
    startOverrides: start !== null && primary ? { [primary.id]: Number(start) } : undefined,
  });
  return true;
}
