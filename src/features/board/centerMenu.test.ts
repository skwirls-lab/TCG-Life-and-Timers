// @req TMR-020 @req SET-013
/** MENU: the center menu's pause / resume rules (no engine change). */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { seededRng } from "@/engine";
import { configureGameStore, resetGameStore, useGameStore } from "@/state/gameStore";
import { newGame, sessionOf } from "../../../tests/unit/helpers/engine";
import { useBoardUi } from "./boardStore";
import {
  closeCenterMenu,
  closeWithoutResume,
  keepClocksPaused,
  menuPausedClocks,
  openCenterMenu,
  openCenterSub,
  registerCenterButton,
  resumeAfterReturn,
  toggleCenterMenu,
} from "./centerMenu";

const status = () => useGameStore.getState().session!.game.timer.status;
const reason = () => useGameStore.getState().session!.game.timer.pausedReason;
const dispatch = (a: Parameters<ReturnType<typeof useGameStore.getState>["dispatch"]>[0]) =>
  useGameStore.getState().dispatch(a);

beforeEach(() => {
  vi.useFakeTimers();
  configureGameStore({ now: () => Date.now(), rng: seededRng(1) });
  useGameStore.setState({
    session: sessionOf(newGame({ timer: { mode: "bank", bankMs: 600_000, warningsMs: [] } })),
  });
  useBoardUi.setState({ menu: null, menuPaused: null, calc: null, cmdMode: false });
});

afterEach(() => {
  vi.useRealTimers();
  resetGameStore();
  registerCenterButton(null);
});

describe("center menu pause rules", () => {
  it("opening pauses running clocks; closing resumes them", () => {
    dispatch({ type: "START_GAME" });
    expect(status()).toBe("running");
    openCenterMenu();
    expect(useBoardUi.getState().menu).toEqual({ kind: "center" });
    expect(status()).toBe("paused");
    expect(reason()).toBe("menu");
    expect(menuPausedClocks()).toBe(true);
    openCenterMenu(); // already open: no-op
    closeCenterMenu();
    expect(useBoardUi.getState().menu).toBeNull();
    expect(status()).toBe("running");
    expect(menuPausedClocks()).toBe(false);
  });

  it("clocks that were already paused stay paused", () => {
    dispatch({ type: "START_GAME" });
    dispatch({ type: "TIMER_PAUSE", reason: "user" });
    openCenterMenu();
    expect(menuPausedClocks()).toBe(false);
    closeCenterMenu();
    expect(status()).toBe("paused");
    expect(reason()).toBe("user");
  });

  it("idle clocks are left alone", () => {
    toggleCenterMenu();
    expect(useBoardUi.getState().menu).not.toBeNull();
    expect(status()).toBe("idle");
    toggleCenterMenu();
    expect(useBoardUi.getState().menu).toBeNull();
    expect(status()).toBe("idle");
  });

  it("a sheet opened from the menu keeps the clocks paused until it closes", () => {
    dispatch({ type: "START_GAME" });
    openCenterMenu();
    openCenterSub("players");
    expect(useBoardUi.getState().menu).toEqual({ kind: "center", sub: "players" });
    expect(status()).toBe("paused");
    closeCenterMenu();
    expect(status()).toBe("running");
  });

  it("a page opened from the menu: the rule applies when the board is back", () => {
    dispatch({ type: "START_GAME" });
    openCenterMenu();
    openCenterSub("route");
    // PlayScreen unmounts (menu reset) and the user comes back later.
    useBoardUi.setState({ menu: null });
    expect(status()).toBe("paused");
    resumeAfterReturn();
    expect(status()).toBe("running");
    resumeAfterReturn(); // once only
    expect(status()).toBe("running");
  });

  it("does not resume another game", () => {
    dispatch({ type: "START_GAME" });
    openCenterMenu();
    useBoardUi.setState({ menu: null, menuPaused: "some-other-game" });
    resumeAfterReturn();
    expect(status()).toBe("paused");
  });

  it("Pause clocks keeps them paused as the user's own pause", () => {
    dispatch({ type: "START_GAME" });
    openCenterMenu();
    keepClocksPaused();
    expect(useBoardUi.getState().menu).toBeNull();
    expect(status()).toBe("paused");
    expect(reason()).toBe("user");
  });

  it("START / Resume clocks close without touching the clocks again", () => {
    openCenterMenu();
    dispatch({ type: "START_GAME" });
    closeWithoutResume();
    expect(useBoardUi.getState().menu).toBeNull();
    expect(status()).toBe("running");
  });

  it("returns focus to the center button", () => {
    const el = document.createElement("button");
    document.body.append(el);
    registerCenterButton(el);
    openCenterMenu();
    closeCenterMenu();
    vi.runAllTimers();
    expect(document.activeElement).toBe(el);
    el.remove();
  });

  it("ignores a seat menu and a missing game", () => {
    useBoardUi.setState({ menu: { seatId: "s1" } });
    openCenterMenu();
    openCenterSub("tools");
    closeCenterMenu();
    expect(useBoardUi.getState().menu).toEqual({ seatId: "s1" });
    resumeAfterReturn();
    useBoardUi.setState({ menu: null });
    useGameStore.setState({ session: null });
    openCenterMenu();
    expect(useBoardUi.getState().menu).toBeNull();
    expect(menuPausedClocks()).toBe(false);
  });
});
