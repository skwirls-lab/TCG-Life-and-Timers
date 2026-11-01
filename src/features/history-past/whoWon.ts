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
// Only the pure decision table is bundled with the board; the record keeper (record building,
// compression, Dexie writes) loads lazily (PERF-003). AppEffects starts it right after mount.
import { resetPlan, type WhoWonSetting } from "@/lib/records/policy";
import type { WinnerDecision } from "@/lib/records/types";
import { useSettingsStore } from "@/state/settingsStore";

export interface ResetRequest {
  /** The game about to be replaced (null / undefined: nothing to save). */
  game: Game | null | undefined;
  /** Runs the actual reset / new game. */
  proceed: () => void;
  /** Runs when the prompt is closed without an answer (the reset is cancelled). */
  onCancel?: () => void;
  /** Override the app setting (tests, dev harness). */
  setting?: WhoWonSetting;
  /** Override the clock (tests). */
  now?: number;
}

interface WhoWonState {
  pending: { game: Game; proceed: () => void; onCancel?: () => void } | null;
  /** Answer the open prompt. */
  answer: (decision: WinnerDecision) => Promise<void>;
  /** Close the prompt without resetting. */
  cancel: () => void;
}

const keeper = () => import("@/state/recordKeeper");

export const useWhoWon = create<WhoWonState>((set, get) => ({
  pending: null,
  answer: async (decision) => {
    const p = get().pending;
    if (!p) return;
    set({ pending: null });
    try {
      await (await keeper()).finalizeBeforeReset(p.game, decision);
    } catch (e) {
      console.warn("[whoWon] save failed", e);
    }
    p.proceed();
  },
  cancel: () => {
    const p = get().pending;
    set({ pending: null });
    p?.onCancel?.();
  },
}));

/** Route a reset / new game through the Who-won decision (HIST-031). */
export async function requestReset(req: ResetRequest): Promise<"prompt" | "save" | "skip"> {
  const { game, proceed, onCancel } = req;
  if (!game) {
    proceed();
    return "skip";
  }
  const setting = req.setting ?? useSettingsStore.getState().settings.whoWonPrompt;
  const plan = resetPlan(game, req.now ?? Date.now(), setting);
  if (plan === "prompt") {
    // A newer request replaces an open one; the older reset is cancelled.
    const open = useWhoWon.getState().pending;
    useWhoWon.setState({ pending: { game, proceed, ...(onCancel ? { onCancel } : {}) } });
    open?.onCancel?.();
    return plan;
  }
  if (plan === "skip") {
    void keeper().then((m) => m.markHandled(game.id));
    proceed();
    return plan;
  }
  // finalizeBeforeReset marks the game handled synchronously, so the keeper never saves it twice.
  let saving: Promise<unknown> = Promise.resolve();
  try {
    saving = (await keeper()).finalizeBeforeReset(game, { kind: "auto" });
  } catch (e) {
    console.warn("[whoWon] save failed", e);
  }
  proceed();
  try {
    await saving;
  } catch (e) {
    console.warn("[whoWon] save failed", e);
  }
  return plan;
}

/**
 * Promise form of `requestReset` for async new-game paths: resolves true once the current game has
 * been dealt with (saved / skipped per the Who-won decision) and the caller may replace it, false
 * when the user closed the prompt (keep the current game).
 */
export function confirmReset(
  game: Game | null | undefined,
  opts: Pick<ResetRequest, "setting" | "now"> = {},
): Promise<boolean> {
  return new Promise((resolve) => {
    void requestReset({
      ...opts,
      game,
      proceed: () => resolve(true),
      onCancel: () => resolve(false),
    });
  });
}
