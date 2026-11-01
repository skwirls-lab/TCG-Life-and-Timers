"use client";
/** Imperative timer UI actions shared by the bar, the toolbar, the overlay and settings. */
import { type Game, type GameEvent, type TimerConfig } from "@/engine";
import { browserAudio, type Tone } from "@/lib/device/audio";
import { browserHaptics, vibrate, type HapticPattern } from "@/lib/device/haptics";
import { useGameStore } from "@/state/gameStore";
import { useSettingsStore } from "@/state/settingsStore";

/** Play a tone if the matching sound setting is on (alerts: warnings/timeouts/start; taps: pass). */
export function playTone(tone: Tone, kind: "alerts" | "taps" = "alerts"): void {
  const { sounds } = useSettingsStore.getState().settings;
  if (!sounds[kind]) return;
  browserAudio().play(tone, sounds.volume);
}

export function buzz(pattern: HapticPattern): void {
  vibrate(browserHaptics(), pattern, useSettingsStore.getState().settings.haptics);
}

const game = (): Game | undefined => useGameStore.getState().session?.game;

/**
 * PASS_TURN (TMR-003). Returns the next seat's name and an undo function that restores the exact
 * pre-pass snapshot (UNDO_TO the pass's turn event, so later actions are reverted too; the engine
 * charges the time since the pass to the passer — TMR-004, D-033). Null when nothing happened.
 */
export function passTurn(): { nextName: string; undo: () => void } | null {
  const before = game();
  if (!before) return null;
  useGameStore.getState().dispatch({ type: "PASS_TURN" });
  const after = game();
  if (!after || after === before) return null;
  const turnEvent: GameEvent | undefined = after.log
    .slice(before.log.length)
    .find((e) => e.kind === "turn");
  const nextName = after.seats.find((s) => s.id === after.turn.activeSeat)?.name ?? "";
  const undo = () => {
    const now = game();
    if (!now) return;
    if (now === after || !turnEvent) useGameStore.getState().dispatch({ type: "UNDO" });
    else useGameStore.getState().dispatch({ type: "UNDO_TO", eventId: turnEvent.id });
  };
  return { nextName, undo };
}

/** TMR-002: START — begins the first player's clock; unlocks audio (user gesture) and chimes. */
export function startClocks(): void {
  const audio = browserAudio();
  void audio
    .unlock()
    .then(() => playTone("start"))
    .catch(() => undefined);
  useGameStore.getState().dispatch({ type: "START_GAME" });
}

/**
 * Restart the clocks with a new config (mode / bank changes mid-game, §13.1-C): engine
 * TIMER_RESET_CLOCKS returns to idle clocks at the configured bank (undoable, logged); START
 * begins again. Turn tracking is turned on for any clock mode.
 */
export function restartClocks(patch: Partial<TimerConfig>): void {
  useGameStore.getState().dispatch({ type: "TIMER_RESET_CLOCKS", config: patch });
}

/** SET-013: pause running clocks while menus / settings are open (config.autoPauseMenus). */
export function pauseForMenus(): void {
  const g = game();
  if (g && g.timer.status === "running" && g.timer.config.autoPauseMenus) {
    useGameStore.getState().dispatch({ type: "TIMER_PAUSE", reason: "menu" });
  }
}
