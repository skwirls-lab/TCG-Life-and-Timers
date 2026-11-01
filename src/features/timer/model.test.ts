import { describe, expect, it } from "vitest";
import {
  createGame,
  reduce,
  seededRng,
  type Game,
  type GameAction,
  type TimerConfig,
} from "@/engine";
import { tileMetrics } from "@/features/board/boardHelpers";
import { getBuiltInPreset } from "@/presets";
import {
  BUTTON_H,
  MIN,
  isStructurePatch,
  parseMinutesInput,
  parseTimerParams,
  responseElapsed,
  seatTimerView,
  shortDuration,
  timerBarActive,
  timerTileMetrics,
  warningPresetId,
} from "./model";

const T0 = 1_700_000_000_000;
const rng = seededRng(3);

type Input = GameAction extends infer A ? (A extends GameAction ? Omit<A, "now"> : never) : never;

function play(config: Partial<TimerConfig> | null, steps: [number, Input][] = []): Game {
  let g = createGame({ preset: getBuiltInPreset("mtg.commander")!, players: 4 }, rng, T0);
  if (config) g = reduce(g, { type: "TIMER_SET_CONFIG", config, now: T0 } as GameAction, { rng });
  for (const [at, a] of steps) g = reduce(g, { ...a, now: T0 + at } as GameAction, { rng });
  return g;
}

const ids = (g: Game) => {
  const a = g.seats.findIndex((s) => s.id === g.turn.activeSeat);
  return [0, 1, 2, 3].map((k) => g.seats[(a + k) % 4]!.id);
};

describe("seatTimerView", () => {
  // @req TURN-001 @req LIFE-006
  it("clocks off + turn tracking: only the active seat passes", () => {
    let g = play(null);
    expect(timerBarActive(g)).toBe(false);
    expect(seatTimerView(g, g.turn.activeSeat).show).toBe(false);
    g = reduce(g, { type: "SET_OPTION", key: "turnTracking", value: true, now: T0 }, { rng });
    const [p1, p2] = ids(g);
    expect(timerBarActive(g)).toBe(true);
    expect(seatTimerView(g, p1!)).toMatchObject({
      show: true,
      isTurn: true,
      canPass: true,
      clocks: false,
    });
    expect(seatTimerView(g, p2!)).toMatchObject({
      show: true,
      isTurn: false,
      canPass: false,
      canRespond: false,
    });
  });

  // @req TMR-001 @req TMR-005 @req TMR-006 @req TMR-007 @req TMR-008 @req TMR-009
  it("clocks: waiting → holder → respond / pass back / return flags", () => {
    let g = play({ mode: "bank", bankMs: 10 * MIN });
    const [p1, p2, p3] = ids(g);
    expect(seatTimerView(g, p1!)).toMatchObject({ waiting: true, canPass: false, holding: false });
    g = reduce(g, { type: "START_GAME", now: T0 + 1 }, { rng });
    expect(seatTimerView(g, p1!)).toMatchObject({
      holding: true,
      canPass: true,
      canRespond: false,
    });
    expect(seatTimerView(g, p2!)).toMatchObject({ holding: false, canRespond: true });
    g = reduce(g, { type: "TIMER_RESPOND", seatId: p3!, now: T0 + 2 }, { rng });
    expect(seatTimerView(g, p1!)).toMatchObject({
      canPass: false,
      canReturn: true,
      canRespond: true,
      depth: 1,
      responderName: g.seats.find((s) => s.id === p3)!.name,
    });
    expect(seatTimerView(g, p3!)).toMatchObject({ isTop: true, canPassBack: true, holding: true });
    g = reduce(g, { type: "TIMER_RESPOND", seatId: p1!, now: T0 + 3 }, { rng });
    // The turn holder on top of the stack may pass (the engine clears the stack).
    expect(seatTimerView(g, p1!)).toMatchObject({
      isTop: true,
      canPass: true,
      canReturn: false,
      depth: 2,
    });
    g = reduce(g, { type: "TIMER_PAUSE", reason: "user", now: T0 + 4 }, { rng });
    expect(seatTimerView(g, p2!).paused).toBe(true);
  });

  it("hides the bar for eliminated seats, ended games and disabled responses", () => {
    let g = play({ mode: "bank", responses: "disabled" }, [[1, { type: "START_GAME" }]]);
    const [, p2] = ids(g);
    expect(seatTimerView(g, p2!).canRespond).toBe(false);
    g = reduce(g, { type: "ELIMINATE", seatId: p2!, now: T0 + 5 }, { rng });
    expect(seatTimerView(g, p2!).show).toBe(false);
    expect(seatTimerView(g, "nope").show).toBe(false);
  });

  it("hold pass mode is reported for clocks only", () => {
    const g = play({ mode: "bank", passMode: "hold" });
    expect(seatTimerView(g, g.turn.activeSeat).passMode).toBe("hold");
  });
});

describe("timerTileMetrics", () => {
  const opts = { wide: true, details: true, big: false, chars: 2, gridRows: 2 };
  const metrics = (f: { w: number; h: number }) => tileMetrics(f, opts);

  // @req TMR-042
  it("tall tiles get a chip band; the holder time is ≥ 1/3 of the number", () => {
    const m = timerTileMetrics({ w: 354, h: 335 }, metrics);
    expect(m.mode).toBe("band");
    expect(m.clockPx * 3).toBeGreaterThanOrEqual(m.tile.fontPx);
    expect(m.chip.top).toBe(m.tile.numberTop + m.tile.numberH);
    expect(m.buttons.h).toBeGreaterThanOrEqual(BUTTON_H);
    expect(m.smallClockPx).toBeLessThan(m.clockPx);
  });

  // @req TMR-042
  it("short tiles put the bar in the bottom row and cap the number at 3× the time", () => {
    const m = timerTileMetrics({ w: 340, h: 170 }, metrics);
    expect(m.mode).toBe("row");
    expect(m.clockPx * 3).toBeGreaterThanOrEqual(m.tile.fontPx);
    expect(m.chip).toEqual(m.buttons);
    expect(m.chip.top + m.chip.h).toBeLessThanOrEqual(170);
  });
});

describe("responseElapsed", () => {
  // @req TMR-005
  it("is the responder's time since responding, minus pauses", () => {
    let g = play({ mode: "bank" }, [[0, { type: "START_GAME" }]]);
    const [, , p3] = ids(g);
    expect(responseElapsed(g, T0 + 1000)).toBe(0);
    g = reduce(g, { type: "TIMER_RESPOND", seatId: p3!, now: T0 + 10_000 }, { rng });
    expect(responseElapsed(g, T0 + 22_000)).toBe(12_000);
    g = reduce(g, { type: "TIMER_PAUSE", reason: "user", now: T0 + 15_000 }, { rng });
    expect(responseElapsed(g, T0 + 99_000)).toBe(5_000);
    g = reduce(g, { type: "TIMER_RESUME", now: T0 + 40_000 }, { rng });
    expect(responseElapsed(g, T0 + 43_000)).toBe(8_000);
  });
});

describe("parsing and labels", () => {
  it("parseTimerParams reads t.* params and drops invalid values", () => {
    const p = parseTimerParams(
      new URLSearchParams(
        "t.mode=bank&t.bankMs=600000&t.timeoutAction=grace&t.graceMs=10000&t.passMode=hold&t.responses=freeze&t.autoPauseMenus=0&t.showTenths=1&t.warnings=60000,300000&t.matchMs=3000000&t.extraTurns=5&t.finalAction=flag&t.incrementMs=-5&t.mode2=x",
      ),
    );
    expect(p).toEqual({
      mode: "bank",
      bankMs: 600000,
      timeoutAction: "grace",
      graceMs: 10000,
      passMode: "hold",
      responses: "freeze",
      autoPauseMenus: false,
      showTenths: true,
      warningsMs: [300000, 60000],
      match: { totalMs: 3000000, extraTurns: 5 },
      finalAction: "flag",
    });
    expect(parseTimerParams(new URLSearchParams("t.mode=nope&t.passMode=x"))).toEqual({});
  });

  it("warning presets, durations, keypad minutes, structure keys", () => {
    expect(warningPresetId([10_000, 60_000, 300_000])).toBe("standard");
    expect(warningPresetId([])).toBe("off");
    expect(warningPresetId([42])).toBe("custom");
    expect(shortDuration(30_000)).toBe("30s");
    expect(shortDuration(2 * MIN)).toBe("2m");
    expect(shortDuration(60 * MIN)).toBe("1h");
    expect(shortDuration(90 * MIN)).toBe("1h 30m");
    expect(parseMinutesInput("35")).toBe(35 * MIN);
    expect(parseMinutesInput("130")).toBe(90 * MIN);
    expect(parseMinutesInput("0")).toBeNull();
    expect(parseMinutesInput("abc")).toBeNull();
    expect(parseMinutesInput("9999")).toBeNull();
    expect(isStructurePatch({ mode: "bank" })).toBe(true);
    expect(isStructurePatch({ passMode: "hold" })).toBe(false);
  });
});
