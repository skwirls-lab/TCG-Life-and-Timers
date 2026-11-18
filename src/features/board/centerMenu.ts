"use client";
/**
 * MENU: the center menu's pause rules (no engine change: TIMER_PAUSE / TIMER_RESUME).
 *
 * - Opening the menu pauses running clocks (reason "menu") and remembers that it did.
 * - Closing it (tap outside, Back, Escape, Resume) resumes them only if the menu paused them;
 *   clocks that were already paused (or idle) stay as they were.
 * - A sheet opened from the menu (players, quick tools, calculator) keeps the menu "open" (the
 *   panel hides), so the clocks stay paused and the PAUSED overlay stays away; when that sheet
 *   closes, the same rule applies. Settings / History / Tools pages: the flag survives leaving the
 *   board and `resumeAfterReturn` applies the rule when the board is shown again.
 */
import type { Game } from "@/engine";
import { useGameStore } from "@/state/gameStore";
import { isCenterMenu, useBoardUi, type CenterMenuSub } from "./boardStore";

const game = (): Game | undefined => useGameStore.getState().session?.game;
const dispatch: ReturnType<typeof useGameStore.getState>["dispatch"] = (a) =>
  useGameStore.getState().dispatch(a);

/** The center button element, so focus can come back to it when the menu closes. */
let buttonEl: HTMLElement | null = null;
export function registerCenterButton(el: HTMLElement | null): void {
  buttonEl = el;
}

export function openCenterMenu(): void {
  const g = game();
  if (!g || useBoardUi.getState().menu) return;
  const running = g.timer.status === "running" && g.status !== "ended";
  // Menu first, then pause: the PAUSED overlay never sees a paused game without a menu.
  useBoardUi.setState({ menu: { kind: "center" }, menuPaused: running ? g.id : null });
  if (running) dispatch({ type: "TIMER_PAUSE", reason: "menu" });
}

/** Resume the clocks if the menu paused them (and nothing else changed them since). */
function resumeIfMenuPaused(): void {
  const paused = useBoardUi.getState().menuPaused;
  useBoardUi.setState({ menuPaused: null });
  const g = game();
  if (paused && g && g.id === paused && g.timer.status === "paused" && g.status !== "ended") {
    dispatch({ type: "TIMER_RESUME" });
  }
}

export function closeCenterMenu({ focus = true }: { focus?: boolean } = {}): void {
  if (!isCenterMenu(useBoardUi.getState().menu)) return;
  // Resume before the menu goes away, so the PAUSED overlay does not flash.
  resumeIfMenuPaused();
  useBoardUi.setState({ menu: null });
  // The button never unmounts with the menu, so focus can go back right away (no timer: the
  // board may run under a frozen clock).
  if (focus && buttonEl?.isConnected) buttonEl.focus({ preventScroll: true });
}

export function toggleCenterMenu(): void {
  if (isCenterMenu(useBoardUi.getState().menu)) closeCenterMenu();
  else openCenterMenu();
}

/** Hide the panel for a sheet (or page) opened from the menu; the clocks stay paused. */
export function openCenterSub(sub: CenterMenuSub): void {
  if (!isCenterMenu(useBoardUi.getState().menu)) return;
  useBoardUi.setState({ menu: { kind: "center", sub } });
}

/** "Pause clocks" in the menu: keep them paused after the menu closes (the PAUSED overlay shows). */
export function keepClocksPaused(): void {
  const g = game();
  if (g && useBoardUi.getState().menuPaused === g.id && g.timer.status === "paused") {
    // Re-tag the pause as the user's own (same instant: no time is charged).
    dispatch({ type: "TIMER_RESUME" });
    dispatch({ type: "TIMER_PAUSE", reason: "user" });
  }
  useBoardUi.setState({ menuPaused: null });
  closeCenterMenu();
}

/** "Resume clocks" / START in the menu: the clocks are handled; just close. */
export function closeWithoutResume(): void {
  useBoardUi.setState({ menuPaused: null });
  closeCenterMenu();
}

/**
 * Back on the board after a page opened from the menu: apply the closing rule (called before
 * paint, so the PAUSED overlay does not flash).
 */
export function resumeAfterReturn(): void {
  if (useBoardUi.getState().menu) return;
  resumeIfMenuPaused();
}

/** Whether the menu paused the clocks of the current game (labels in the panel). */
export function menuPausedClocks(): boolean {
  const g = game();
  return !!g && useBoardUi.getState().menuPaused === g.id;
}
