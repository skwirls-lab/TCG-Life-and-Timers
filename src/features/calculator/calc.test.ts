// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { createGame, reduce, seededRng, type Game } from "@/engine";
import { parseKeypad } from "@/components/ui/Keypad";
import { getBuiltInPreset } from "@/presets";
import { commander } from "@/presets/mtg/presets";
import {
  applyCalc,
  calcTape,
  clearRememberedCalcs,
  rememberCalc,
  shouldOpenCalculator,
  tapeText,
} from "./calc";

const rng = seededRng(1);
const ygo = getBuiltInPreset("ygo.advanced")!;

afterEach(() => clearRememberedCalcs());

describe("applyCalc", () => {
  // @req INP-007 @req TOOL-006
  it("adds, subtracts, sets and halves (rounding up)", () => {
    expect(applyCalc(8000, { op: "sub", value: 2300 })).toBe(5700);
    expect(applyCalc(5700, { op: "half", value: 2 })).toBe(2850);
    expect(applyCalc(2850, { op: "add", value: 800 })).toBe(3650);
    expect(applyCalc(2850, { op: "set", value: 4000 })).toBe(4000);
    expect(applyCalc(8001, { op: "half", value: 2 })).toBe(4001);
    expect(applyCalc(1, { op: "half", value: 2 })).toBe(1);
    expect(applyCalc(0, { op: "half", value: 2 })).toBe(0);
  });

  // @req INP-007
  it("never goes below min 0 (or above max)", () => {
    expect(applyCalc(1000, { op: "sub", value: 2300 }, { min: 0 })).toBe(0);
    expect(applyCalc(1000, { op: "sub", value: 2300 }, { min: null })).toBe(-1300);
    expect(applyCalc(5, { op: "add", value: 9 }, { min: 0, max: 7 })).toBe(7);
    expect(applyCalc(5, { op: "set", value: -4 }, { min: 0, max: 7 })).toBe(0);
  });

  it("works with parsed keypad input", () => {
    const r = parseKeypad("-2300", "calc")!;
    expect(applyCalc(8000, r, { min: 0 })).toBe(5700);
    expect(applyCalc(5700, parseKeypad("/2", "calc")!, { min: 0 })).toBe(2850);
  });
});

describe("shouldOpenCalculator", () => {
  // @req INP-007
  it("follows the game option, else the preset capability", () => {
    expect(shouldOpenCalculator(ygo)).toBe(true);
    expect(shouldOpenCalculator(commander)).toBe(false);
    expect(shouldOpenCalculator(commander, { tapForCalculator: true })).toBe(true);
    expect(shouldOpenCalculator(ygo, { tapForCalculator: false })).toBe(false);
    expect(shouldOpenCalculator(ygo, {})).toBe(true);
    const g = createGame({ preset: ygo }, rng, 0);
    expect(shouldOpenCalculator(g.preset, g.options)).toBe(true);
    const m = createGame({ preset: commander }, rng, 0);
    expect(shouldOpenCalculator(m.preset, m.options)).toBe(false);
  });
});

describe("calcTape", () => {
  function scenario9(): Game {
    let g = createGame({ preset: ygo, players: 2, firstSeatId: "s1" }, rng, 0);
    g = reduce(
      g,
      { type: "COUNTER_SET", counterId: "ygo.lp", seatId: "s1", value: 5700, now: 10 },
      { rng },
    );
    rememberCalc(g.id, g.log[g.log.length - 1]!.id, { op: "sub", value: 2300 });
    // Within the INP-006 batch window: COUNTER_SET never merges, so this is its own entry.
    g = reduce(
      g,
      { type: "COUNTER_SET", counterId: "ygo.lp", seatId: "s1", value: 2850, now: 20 },
      { rng },
    );
    rememberCalc(g.id, g.log[g.log.length - 1]!.id, { op: "half", value: 2 });
    return g;
  }

  // @req TOOL-006 @req INP-007
  it("Scenario 9: shows the arithmetic for the seat", () => {
    const g = scenario9();
    expect(calcTape(g, "s1", "ygo.lp").map(tapeText)).toEqual([
      "8000 − 2300 = 5700",
      "5700 ÷ 2 = 2850",
    ]);
    expect(calcTape(g, "s2", "ygo.lp")).toEqual([]);
  });

  it("falls back to the delta for taps and unknown entries, and keeps the last N", () => {
    let g = scenario9();
    g = reduce(
      g,
      { type: "COUNTER_ADD", counterId: "ygo.lp", seatId: "s1", delta: 100, now: 5000 },
      { rng },
    );
    g = reduce(
      g,
      { type: "COUNTER_SET", counterId: "ygo.lp", seatId: "s1", value: 0, now: 9000 },
      { rng },
    );
    rememberCalc(g.id, g.log.find((e) => e.to === 0)!.id, { op: "sub", value: 9999 });
    const tape = calcTape(g, "s1", "ygo.lp");
    expect(tape.map(tapeText)).toEqual([
      "8000 − 2300 = 5700",
      "5700 ÷ 2 = 2850",
      "2850 + 100 = 2950",
      "2950 − 9999 = 0",
    ]);
    expect(calcTape(g, "s1", "ygo.lp", 2).map((r) => r.to)).toEqual([2950, 0]);
    clearRememberedCalcs();
    expect(tapeText(calcTape(g, "s1", "ygo.lp", 1)[0]!)).toBe("2950 − 2950 = 0");
  });

  it("formats set entries and bounds its memory", () => {
    expect(tapeText({ from: 2850, to: 4000, op: "set", operand: 4000 })).toBe("2850 → 4000");
    for (let i = 0; i < 205; i++) rememberCalc("g", `e${i}`, { op: "add", value: i });
    const g = {
      id: "g",
      log: [
        { id: "e0", at: 0, kind: "counter" as const, counterId: "c", seatId: "s", from: 0, to: 5 },
      ],
    };
    // e0 was evicted: the row shows the delta.
    expect(calcTape(g, "s", "c")[0]).toMatchObject({ op: "add", operand: 5 });
  });
});
