// @req TMR-051 @req TMR-021 @req TMR-031
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSession, remaining, type TimerConfig } from "@/engine";
import { newGame, T0 } from "../../tests/unit/helpers/engine";
import type { Input } from "../../tests/unit/helpers/timer";
import { resetGameStore, useGameStore } from "./gameStore";
import { onTimerSignal, startTimerScheduler, type TimerSignal } from "./timerScheduler";

const SEC = 1000;
const MIN = 60_000;

let visibility: DocumentVisibilityState = "visible";
let stop: (() => void) | null = null;
let signals: TimerSignal[] = [];
let offSignal: (() => void) | null = null;

function setVisibility(v: DocumentVisibilityState) {
  visibility = v;
  document.dispatchEvent(new Event("visibilitychange"));
}

function load(timer: Partial<TimerConfig>) {
  const game = newGame({
    timer: { mode: "bank", bankMs: 10 * MIN, timeoutAction: "lose", warningsMs: [], ...timer },
  });
  useGameStore.setState({ session: createSession(game), loadState: "loaded" });
}

const dispatch = (a: Input) => useGameStore.getState().dispatch(a);
const game = () => useGameStore.getState().session!.game;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  visibility = "visible";
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => visibility,
  });
  signals = [];
  offSignal = onTimerSignal((s) => signals.push(s));
});

afterEach(() => {
  stop?.();
  stop = null;
  offSignal?.();
  resetGameStore();
  vi.useRealTimers();
});

describe("timerScheduler", () => {
  it("dispatches TIMER_TIMEOUT at the exact moment and re-arms for the next holder", () => {
    load({ bankMs: 5 * SEC });
    stop = startTimerScheduler();
    dispatch({ type: "START_GAME" });
    vi.advanceTimersByTime(5 * SEC - 1);
    expect(game().seats[0]!.eliminated).toBe(false);
    vi.advanceTimersByTime(1);
    expect(game().seats[0]!.eliminated).toBe(true);
    expect(signals).toEqual([{ at: T0 + 5 * SEC, kind: "timeout", seatId: "s1" }]);
    expect(game().timer.holder).toBe("s2");
    vi.advanceTimersByTime(5 * SEC);
    expect(game().seats[1]!.eliminated).toBe(true);
    expect(game().timer.holder).toBe("s3");
  });

  it("re-arms after every action (pass turn moves the pending timeout)", () => {
    load({ bankMs: 5 * SEC });
    stop = startTimerScheduler();
    dispatch({ type: "START_GAME" });
    vi.advanceTimersByTime(3 * SEC);
    dispatch({ type: "PASS_TURN" });
    vi.advanceTimersByTime(4 * SEC);
    expect(game().seats.every((s) => !s.eliminated)).toBe(true);
    vi.advanceTimersByTime(SEC);
    expect(game().seats[1]!.eliminated).toBe(true);
  });

  it("emits warnings at each threshold and a match-end signal", () => {
    load({
      bankMs: 6 * MIN,
      warningsMs: [5 * MIN, MIN],
      match: { totalMs: 3 * MIN, extraTurns: 1 },
    });
    stop = startTimerScheduler();
    dispatch({ type: "START_GAME" });
    vi.advanceTimersByTime(6 * MIN - SEC);
    expect(signals.map((s) => [s.kind, s.at - T0, s.thresholdMs])).toEqual([
      ["warning", MIN, 5 * MIN],
      ["matchEnd", 3 * MIN, undefined],
      ["warning", 5 * MIN, MIN],
    ]);
  });

  it("grace: overtime then elimination", () => {
    load({ bankMs: SEC, timeoutAction: "grace", graceMs: 2 * SEC });
    stop = startTimerScheduler();
    dispatch({ type: "START_GAME" });
    vi.advanceTimersByTime(SEC);
    expect(game().timer.clocks.s1!.state).toBe("overtime");
    vi.advanceTimersByTime(2 * SEC);
    expect(game().seats[0]!.eliminated).toBe(true);
    expect(signals.map((s) => s.kind)).toEqual(["timeout", "graceEnd"]);
  });

  it("does nothing without a game or while paused; stop() disarms", () => {
    stop = startTimerScheduler();
    vi.advanceTimersByTime(MIN);
    load({ bankMs: SEC });
    dispatch({ type: "START_GAME" });
    dispatch({ type: "TIMER_PAUSE" });
    vi.advanceTimersByTime(MIN);
    expect(game().seats[0]!.eliminated).toBe(false);
    dispatch({ type: "TIMER_RESUME" });
    stop();
    stop = null;
    vi.advanceTimersByTime(MIN);
    expect(game().seats[0]!.eliminated).toBe(false);
  });

  it("starting again replaces the previous scheduler", () => {
    load({ bankMs: SEC, timeoutAction: "addOnce", addOnceMs: SEC });
    startTimerScheduler();
    stop = startTimerScheduler();
    dispatch({ type: "START_GAME" });
    vi.advanceTimersByTime(SEC);
    expect(signals).toHaveLength(1);
  });

  it("listener errors don't break the scheduler; unsubscribed listeners stop receiving", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const off = onTimerSignal(() => {
      throw new Error("boom");
    });
    load({ bankMs: SEC });
    stop = startTimerScheduler();
    dispatch({ type: "START_GAME" });
    vi.advanceTimersByTime(SEC);
    expect(game().seats[0]!.eliminated).toBe(true);
    expect(warn).toHaveBeenCalled();
    off();
    offSignal?.();
    offSignal = null;
    vi.advanceTimersByTime(MIN);
    expect(signals).toHaveLength(1);
    warn.mockRestore();
  });

  it("does not loop on a due timeout the engine ignores", () => {
    load({ bankMs: SEC });
    const real = useGameStore.getState().dispatch;
    const spy = vi.fn();
    useGameStore.setState({ dispatch: spy });
    stop = startTimerScheduler();
    real({ type: "START_GAME" });
    vi.advanceTimersByTime(5 * SEC);
    expect(spy).toHaveBeenCalledTimes(1);
    useGameStore.setState({ dispatch: real });
  });

  it("fires late timers immediately and never early", () => {
    load({ bankMs: 5 * SEC });
    let fakeNow = T0;
    stop = startTimerScheduler(useGameStore, { now: () => fakeNow });
    dispatch({ type: "START_GAME" });
    // The timer fires (fake timers) while our clock still reads earlier → re-arm, no dispatch.
    vi.advanceTimersByTime(5 * SEC);
    expect(game().seats[0]!.eliminated).toBe(false);
    fakeNow = T0 + 5 * SEC;
    vi.advanceTimersByTime(5 * SEC);
    expect(game().seats[0]!.eliminated).toBe(true);
  });
});

describe("background / foreground (TMR-021, Scenario 5)", () => {
  it("auto-pause on hide keeps the time at hide; no auto-resume on show", () => {
    load({ autoPauseBackground: true });
    stop = startTimerScheduler();
    dispatch({ type: "START_GAME" });
    vi.advanceTimersByTime(7 * SEC);
    setVisibility("hidden");
    expect(game().timer).toMatchObject({ status: "paused", pausedReason: "background" });
    vi.advanceTimersByTime(10 * MIN);
    setVisibility("visible");
    expect(game().timer.status).toBe("paused");
    expect(remaining(game(), "s1", Date.now())).toBe(10 * MIN - 7 * SEC);
  });

  it("without auto-pause time keeps elapsing; on show a missed timeout is dispatched", () => {
    load({ autoPauseBackground: false, bankMs: 30 * SEC });
    stop = startTimerScheduler();
    dispatch({ type: "START_GAME" });
    setVisibility("hidden");
    expect(game().timer.status).toBe("running");
    // Throttled tab: the wall clock moves but no timer callback ran.
    vi.setSystemTime(T0 + 40 * SEC);
    setVisibility("visible");
    vi.advanceTimersByTime(0);
    expect(game().seats[0]!.eliminated).toBe(true);
    // The 10 s of lateness go to the next holder, as if the timeout had fired on time.
    expect(remaining(game(), "s2", Date.now())).toBe(20 * SEC);
  });

  it("hide without a running clock does nothing", () => {
    load({});
    stop = startTimerScheduler();
    const g = game();
    setVisibility("hidden");
    expect(game()).toBe(g);
  });
});
