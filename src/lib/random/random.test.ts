// @req TOOL-001 @req TOOL-002 @req TOOL-003 @req TOOL-007 @req TOOL-008
import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { cryptoRng, seededRng, type Rng } from "@/engine";
import {
  ALL_DICE,
  clampDiceCount,
  clampDieSides,
  flipCoin,
  flipCoins,
  flipUntilTails,
  pickOpponent,
  pickPlayer,
  rollDice,
  rollDie,
} from "./random";

/** Rng that replays a fixed sequence of raw ints. */
function scripted(values: number[]): Rng {
  let i = 0;
  return { int: (max) => values[i++ % values.length]! % max };
}

describe("rollDie / rollDice", () => {
  it("rolls every standard die within 1..sides", () => {
    const rng = seededRng(1);
    for (const sides of ALL_DICE) {
      for (let i = 0; i < 500; i++) {
        const v = rollDie(rng, sides);
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(sides);
      }
    }
  });

  it("custom die accepts 2..1000 and rejects anything else", () => {
    const rng = seededRng(2);
    expect(rollDie(rng, 2)).toBeLessThanOrEqual(2);
    expect(rollDie(rng, 1000)).toBeLessThanOrEqual(1000);
    for (const bad of [1, 0, -5, 1001, 2.5, Number.NaN]) {
      expect(() => rollDie(rng, bad)).toThrow(RangeError);
    }
  });

  it("maps rng 0 → 1 and max-1 → sides", () => {
    expect(rollDie(scripted([0]), 6)).toBe(1);
    expect(rollDie(scripted([5]), 6)).toBe(6);
  });

  it("multi dice return each value and the sum", () => {
    const r = rollDice(scripted([2, 4, 5]), 3, 6);
    expect(r).toEqual({ sides: 6, values: [3, 5, 6], total: 14 });
    expect(() => rollDice(seededRng(1), 0, 6)).toThrow(RangeError);
    expect(() => rollDice(seededRng(1), 11, 6)).toThrow(RangeError);
    expect(() => rollDice(seededRng(1), 2, 1)).toThrow(RangeError);
  });

  it("d20 is uniform (chi-square, 20k seeded rolls, df=19, p>0.001)", () => {
    const rng = seededRng(20_2026);
    const n = 20_000;
    const counts = new Array<number>(20).fill(0);
    for (let i = 0; i < n; i++) counts[rollDie(rng, 20) - 1]!++;
    const expected = n / 20;
    const chi2 = counts.reduce((s, c) => s + (c - expected) ** 2 / expected, 0);
    expect(chi2).toBeLessThan(43.82);
  });

  it("works with the production crypto rng (TOOL-007)", () => {
    const spy = vi.spyOn(globalThis.crypto, "getRandomValues");
    const rng = cryptoRng();
    const r = rollDice(rng, 10, 20);
    expect(r.values).toHaveLength(10);
    expect(r.values.every((v) => v >= 1 && v <= 20)).toBe(true);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("clamp helpers", () => {
  it("clampDieSides keeps 2..1000 and falls back for non-numbers", () => {
    expect(clampDieSides(7)).toBe(7);
    expect(clampDieSides(1)).toBe(2);
    expect(clampDieSides(5000)).toBe(1000);
    expect(clampDieSides(6.6)).toBe(7);
    expect(clampDieSides(Number.NaN)).toBe(20);
    expect(clampDieSides(Number.NaN, 6)).toBe(6);
  });
  it("clampDiceCount keeps 1..10", () => {
    expect(clampDiceCount(0)).toBe(1);
    expect(clampDiceCount(3)).toBe(3);
    expect(clampDiceCount(99)).toBe(10);
    expect(clampDiceCount(Number.POSITIVE_INFINITY)).toBe(1);
  });
});

describe("coins", () => {
  it("flipCoin maps 0 → heads, 1 → tails", () => {
    expect(flipCoin(scripted([0]))).toBe("heads");
    expect(flipCoin(scripted([1]))).toBe("tails");
  });
  it("flipCoins counts heads", () => {
    expect(flipCoins(scripted([0, 1, 0]), 3)).toEqual({
      flips: ["heads", "tails", "heads"],
      heads: 2,
    });
    expect(flipCoins(seededRng(3), 0).flips).toHaveLength(1);
  });
  it("flipUntilTails stops at the first tails", () => {
    expect(flipUntilTails(scripted([0, 0, 0, 1, 0]))).toEqual({
      flips: ["heads", "heads", "heads", "tails"],
      heads: 3,
    });
    expect(flipUntilTails(scripted([1])).heads).toBe(0);
  });
  it("flipUntilTails is capped against a broken rng", () => {
    const r = flipUntilTails(scripted([0]), 50);
    expect(r.flips).toHaveLength(50);
    expect(r.heads).toBe(50);
  });
  it("a fair coin is roughly 50/50 (seeded)", () => {
    const r = seededRng(9);
    let heads = 0;
    for (let i = 0; i < 10_000; i++) if (flipCoin(r) === "heads") heads++;
    expect(heads).toBeGreaterThan(4800);
    expect(heads).toBeLessThan(5200);
  });
});

describe("randomizers", () => {
  it("pickPlayer returns one of the given seats and covers all of them", () => {
    const rng = seededRng(4);
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) seen.add(pickPlayer(rng, ["a", "b", "c", "d"]));
    expect([...seen].sort()).toEqual(["a", "b", "c", "d"]);
    expect(() => pickPlayer(rng, [])).toThrow(RangeError);
  });

  it("pickOpponent returns null without living opponents", () => {
    expect(pickOpponent(seededRng(1), "a", ["a"])).toBeNull();
    expect(pickOpponent(seededRng(1), "a", [])).toBeNull();
  });

  it("pickOpponent reaches every living opponent", () => {
    const rng = seededRng(5);
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) seen.add(pickOpponent(rng, "jp", ["c", "jp", "b"])!);
    expect([...seen].sort()).toEqual(["b", "c"]);
  });

  // PRD Appendix B Scenario 12: randomize opponent from JP's seat never returns JP or an
  // eliminated seat (property test, 10k runs).
  it("Scenario 12: never the chooser, never an eliminated seat (10k runs)", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.string({ minLength: 1, maxLength: 4 }), { minLength: 1, maxLength: 8 }),
        fc.nat(),
        fc.integer(),
        fc.func(fc.boolean()),
        (seats, chooserIdx, seed, isEliminated) => {
          const chooser = seats[chooserIdx % seats.length]!;
          const alive = seats.filter((s) => s === chooser || !isEliminated(s));
          const eliminated = new Set(seats.filter((s) => !alive.includes(s)));
          const got = pickOpponent(seededRng(seed), chooser, alive);
          if (alive.length <= 1) return got === null;
          return got !== null && got !== chooser && !eliminated.has(got) && alive.includes(got);
        },
      ),
      { numRuns: 10_000 },
    );
  });
});
