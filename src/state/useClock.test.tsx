// @req TMR-040 @req TMR-041 @req TMR-031
import { Profiler } from "react";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSession, type TimerConfig } from "@/engine";
import { newGame, T0 } from "../../tests/unit/helpers/engine";
import type { Input } from "../../tests/unit/helpers/timer";
import { resetGameStore, useGameStore } from "./gameStore";
import { useClock } from "./useClock";

const SEC = 1000;
const MIN = 60_000;
let renders: Record<string, number> = {};
const count = (id: string) => {
  renders[id] = (renders[id] ?? 0) + 1;
};

/** Each chip sits in its own Profiler so commits are counted per seat. */
function Chip({ seatId }: { seatId: string }) {
  return (
    <Profiler id={seatId} onRender={count}>
      <ChipInner seatId={seatId} />
    </Profiler>
  );
}

function ChipInner({ seatId }: { seatId: string }) {
  const c = useClock(seatId);
  if (!c) return <span data-testid={seatId}>none</span>;
  return (
    <span
      data-testid={seatId}
      data-running={c.running}
      data-holder={c.isHolder}
      data-state={c.state}
    >
      {c.display}
    </span>
  );
}

function load(timer: Partial<TimerConfig>) {
  const game = newGame({
    timer: { mode: "bank", bankMs: 10 * MIN, timeoutAction: "flag", ...timer },
  });
  useGameStore.setState({ session: createSession(game), loadState: "loaded" });
}

const dispatch = (a: Input) => act(() => useGameStore.getState().dispatch(a));
const text = (id: string) => screen.getByTestId(id).textContent;

/** Advance in 50 ms steps so each tick commits its own render (act batches within a step). */
function advance(ms: number) {
  for (let t = 0; t < ms; t += 50) act(() => vi.advanceTimersByTime(50));
}

function board() {
  return render(
    <>
      <Chip seatId="s1" />
      <Chip seatId="s2" />
    </>,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  renders = {};
});

afterEach(() => {
  resetGameStore();
  vi.useRealTimers();
});

describe("useClock", () => {
  it("returns undefined without a game or seat", () => {
    render(<Chip seatId="s1" />);
    expect(text("s1")).toBe("none");
  });

  it("ticks only the holder at 4 Hz; other seats stay static", () => {
    load({});
    board();
    expect(text("s1")).toBe("10:00");
    dispatch({ type: "START_GAME" });
    const base = { ...renders };
    advance(10 * SEC);
    expect(text("s1")).toBe("9:50");
    expect(text("s2")).toBe("10:00");
    expect(renders.s1! - base.s1!).toBe(40);
    expect(renders.s2! - base.s2!).toBe(0);
    expect(screen.getByTestId("s1").dataset.running).toBe("true");
    expect(screen.getByTestId("s2").dataset.running).toBe("false");
  });

  it("ticks at 10 Hz under 10 s and shows tenths", () => {
    load({ bankMs: 12 * SEC });
    board();
    dispatch({ type: "START_GAME" });
    advance(3 * SEC);
    expect(text("s1")).toBe("9.0");
    const before = renders.s1!;
    advance(SEC);
    expect(renders.s1! - before).toBe(10);
    expect(text("s1")).toBe("8.0");
  });

  it("stops ticking when paused or when the clock moves on", () => {
    load({});
    board();
    dispatch({ type: "START_GAME" });
    advance(SEC);
    dispatch({ type: "TIMER_PAUSE" });
    expect(screen.getByTestId("s1").dataset.holder).toBe("true");
    expect(screen.getByTestId("s1").dataset.running).toBe("false");
    const paused = { ...renders };
    advance(5 * SEC);
    expect(renders).toEqual(paused);
    expect(text("s1")).toBe("9:59");
    dispatch({ type: "TIMER_RESUME" });
    dispatch({ type: "PASS_TURN" });
    const passed = { ...renders };
    advance(2 * SEC);
    expect(renders.s1).toBe(passed.s1);
    expect(renders.s2! - passed.s2!).toBe(8);
    expect(text("s2")).toBe("9:58");
  });

  it("shows flagged negative time and count-up used time", () => {
    load({ bankMs: SEC });
    board();
    dispatch({ type: "START_GAME" });
    advance(SEC);
    dispatch({ type: "TIMER_TIMEOUT", seatId: "s1" });
    advance(45 * SEC);
    expect(text("s1")).toBe("−0:45");
    expect(screen.getByTestId("s1").dataset.state).toBe("flagged");
    resetGameStore();
    load({ mode: "countup", showTenths: false });
    dispatch({ type: "START_GAME" });
    advance(65 * SEC);
    expect(text("s1")).toBe("1:05");
    expect(text("s2")).toBe("0:00");
  });
});
