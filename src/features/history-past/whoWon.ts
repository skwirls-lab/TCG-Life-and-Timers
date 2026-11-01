"use client";
/**
 * HIST-031 "Who won?" flow. Every reset / new-game path calls
 * `requestReset({ game, proceed })`:
 * - plan "prompt" → the WhoWonHost shows the prompt; the chosen answer is saved, then `proceed()`;
 *   closing the prompt cancels the reset (nothing is saved, the game continues);
 * - plan "save"  → the game is saved with its detected result, then `proceed()`;
 * - plan "skip"  → nothing is saved (history off / trivial / already recorded), then `proceed()`.
 */
import { create } from "zustand";
import type { Game } from "@/engine";
import { resetPlan, type WinnerDecision, type WhoWonSetting } from "@/lib/records";
import { finalizeBeforeReset, markHandled } from "@/state/recordKeeper";
import { useSettingsStore } from "@/state/settingsStore";

export interface ResetRequest {
  /** The game about to be replaced (null / undefined: nothing to save). */
  game: Game | null | undefined;
  /** Runs the actual reset / new game. */
  proceed: () => void;
  /** Override the app setting (tests, dev harness). */
  setting?: WhoWonSetting;
  /** Override the clock (tests). */
  now?: number;
}

interface WhoWonState {
  pending: { game: Game; proceed: () => void } | null;
  /** Answer the open prompt. */
  answer: (decision: WinnerDecision) => Promise<void>;
  /** Close the prompt without resetting. */
  cancel: () => void;
}

export const useWhoWon = create<WhoWonState>((set, get) => ({
  pending: null,
  answer: async (decision) => {
    const p = get().pending;
    if (!p) return;
    set({ pending: null });
    try {
      await finalizeBeforeReset(p.game, decision);
    } catch (e) {
      console.warn("[whoWon] save failed", e);
    }
    p.proceed();
  },
  cancel: () => set({ pending: null }),
}));

/** Route a reset / new game through the Who-won decision (HIST-031). */
export async function requestReset(req: ResetRequest): Promise<"prompt" | "save" | "skip"> {
  const { game, proceed } = req;
  if (!game) {
    proceed();
    return "skip";
  }
  const setting = req.setting ?? useSettingsStore.getState().settings.whoWonPrompt;
  const plan = resetPlan(game, req.now ?? Date.now(), setting);
  if (plan === "prompt") {
    useWhoWon.setState({ pending: { game, proceed } });
    return plan;
  }
  if (plan === "skip") {
    markHandled(game.id);
    proceed();
    return plan;
  }
  const saving = finalizeBeforeReset(game, { kind: "auto" });
  proceed();
  try {
    await saving;
  } catch (e) {
    console.warn("[whoWon] save failed", e);
  }
  return plan;
}
