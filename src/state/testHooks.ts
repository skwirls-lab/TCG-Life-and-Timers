"use client";
/**
 * Test-only hooks (instructions §10.4). Active ONLY in builds with NEXT_PUBLIC_TEST_HOOKS=1
 * (the `.next-test` / `.next-emu` builds); production builds compile this to a no-op.
 *
 * URL params understood by `applyTestHooks` (used by /play and other pages in e2e):
 *   seed=<int>          deterministic RNG for the game store
 *   quick=<presetId>    start a new game immediately (e.g. quick=mtg.commander). Built-in ids
 *                       start synchronously; custom preset ids (`custom.*`, CUS-001) resolve from
 *                       IndexedDB and start once any concurrent resume has finished
 *                       (`window.__tcgQuickPending` is true until then).
 *   players=<n>         player count for quick start
 *   names=A,B,C         seat names for quick start
 *   start=<n>           start value override for the preset's primary counter
 *   layout=<id>         layout variant id
 *   fp=1                keep the first-player announcement on /play quick-starts (skipped by default)
 * It also exposes `window.__tcg` = { getState, dispatch } for e2e assertions.
 */
import { primaryCounter, seededRng, type Preset } from "@/engine";
import { getBuiltInPreset } from "@/presets";
import { configureGameStore, useGameStore } from "./gameStore";

import { TEST_HOOKS_ENABLED } from "./testHooksFlag";

export { TEST_HOOKS_ENABLED };

declare global {
  interface Window {
    __tcg?: {
      getState: typeof useGameStore.getState;
      dispatch: ReturnType<typeof useGameStore.getState>["dispatch"];
    };
    /** game id whose initial first-player announcement is skipped (quick-start on /play) */
    __tcgSkipAnnounceGame?: string;
    /** true while a custom-preset quick start is resolving */
    __tcgQuickPending?: boolean;
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
  if (preset) {
    quickStart(preset, search);
    return true;
  }
  if (!quick.startsWith("custom.")) return false;
  window.__tcgQuickPending = true;
  void startCustom(quick, search).finally(() => {
    window.__tcgQuickPending = false;
  });
  return false;
}

/** Wait until a resume started alongside the hooks has settled (it would replace the game). */
function afterResume(): Promise<void> {
  if (useGameStore.getState().loadState !== "loading") return Promise.resolve();
  return new Promise((resolve) => {
    const unsub = useGameStore.subscribe((s) => {
      if (s.loadState !== "loading") {
        unsub();
        resolve();
      }
    });
  });
}

async function startCustom(id: string, search: URLSearchParams): Promise<void> {
  // Lazy: keeps the custom-preset repository out of the board chunk.
  const { getCustomPreset } = await import("@/lib/customPresets");
  const preset = await getCustomPreset(id).catch(() => undefined);
  if (!preset) return;
  await afterResume();
  quickStart(preset, search);
}

function quickStart(preset: Preset, search: URLSearchParams): void {
  const players = Number(search.get("players") ?? preset.defaultPlayers);
  const names = search.get("names")?.split(",");
  const start = search.get("start");
  const primary = primaryCounter(preset);
  const game = useGameStore.getState().newGame({
    preset,
    players,
    seats: names?.map((name) => ({ name })),
    layoutId: search.get("layout") ?? undefined,
    startOverrides: start !== null && primary ? { [primary.id]: Number(start) } : undefined,
  });
  // Board e2e specs quick-start on /play and must not be blocked by the first-player overlay.
  // Pass fp=1 to keep it (the game-flow specs test it on their own harness).
  if (window.location.pathname.startsWith("/play") && search.get("fp") !== "1") {
    window.__tcgSkipAnnounceGame = game.id;
  }
}
