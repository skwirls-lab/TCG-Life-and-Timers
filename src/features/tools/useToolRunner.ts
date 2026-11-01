"use client";
/**
 * Shared tool runner for the /tools page and the board's quick menu: one result at a time,
 * rolled with cryptoRng (TOOL-007) and logged to the active game (HIST-012).
 */
import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { cryptoRng, type Rng } from "@/engine";
import { useGameStore } from "@/state/gameStore";
import { useSettingsStore } from "@/state/settingsStore";
import { runTool, toLogNote, type ToolRequest, type ToolResult } from "./tools";

let rng: Rng = cryptoRng();

/** Test seam (unit tests only). */
export function setToolRng(next?: Rng): void {
  rng = next ?? cryptoRng();
}

interface ToolResultState {
  request: ToolRequest | null;
  result: ToolResult | null;
  /** Increments per roll so the overlay re-animates on "Roll again". */
  rev: number;
  run: (req: ToolRequest) => ToolResult | null;
  dismiss: () => void;
}

export const useToolResult = create<ToolResultState>((set) => ({
  request: null,
  result: null,
  rev: 0,
  run: (req) => {
    const session = useGameStore.getState().session;
    const result = runTool(req, rng, session?.game ?? null);
    if (!result) return null;
    if (session) useGameStore.getState().dispatch(toLogNote(result));
    set((s) => ({ request: req, result, rev: s.rev + 1 }));
    return result;
  },
  dismiss: () => set({ request: null, result: null }),
}));

function subscribeReducedMotion(cb: () => void) {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

const systemReduced = () =>
  typeof window !== "undefined" &&
  !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Dice & randomizer animations are on (setting) and motion is not reduced (TOOL-009). */
export function useToolAnimations(): boolean {
  const dice = useSettingsStore((s) => s.settings.diceAnimations);
  const pref = useSettingsStore((s) => s.settings.reduceMotion);
  const sys = useSyncExternalStore(subscribeReducedMotion, systemReduced, () => false);
  const reduced = pref === "always" || (pref === "system" && sys);
  return dice && !reduced;
}

/** Load settings once (pages outside the board may be opened directly). */
export function ensureSettingsLoaded(): void {
  const s = useSettingsStore.getState();
  if (!s.hydrated) void s.load().catch(() => undefined);
}
