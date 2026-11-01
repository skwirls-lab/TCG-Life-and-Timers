// @vitest-environment node
import { describe, expect, it } from "vitest";
import { newGame, testPreset, T0 } from "../../tests/unit/helpers/engine";
import { createGame, cryptoRng, pick, pickFirstSeat, randomId, seededRng, type Rng } from "./index";

/** Chi-square statistic for observed counts vs a uniform expectation. */
function chiSquare(counts: number[]): number {
  const total = counts.reduce((a, b) => a + b, 0);
  const expected = total / counts.length;
  return counts.reduce((s, c) => s + (c - expected) ** 2 / expected, 0);
}

describe("rng", () => {
  it("seededRng is deterministic and in range", () => {
    const a = seededRng(123);
    const b = seededRng(123);
    const xs = Array.from({ length: 50 }, () => a.int(6));
    expect(xs).toEqual(Array.from({ length: 50 }, () => b.int(6)));
    expect(xs.every((x) => x >= 0 && x < 6)).toBe(true);
  });

  it("cryptoRng uses rejection sampling within range and is roughly uniform", () => {
    const r = cryptoRng();
    const counts = [0, 0, 0];
    for (let i = 0; i < 3000; i++) counts[r.int(3)]!++;
    expect(chiSquare(counts)).toBeLessThan(13.8); // df=2, p=0.001
    expect(r.int(1)).toBe(0);
  });

  it("cryptoRng rejects values above the unbiased limit", () => {
    const orig = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
    const queue = [2 ** 32 - 1, 5];
    const spy = (arr: Uint32Array) => {
      arr[0] = queue.shift() ?? 0;
      return arr;
    };
    Object.defineProperty(globalThis.crypto, "getRandomValues", { value: spy, configurable: true });
    try {
      expect(cryptoRng().int(3)).toBe(2); // first draw rejected (≥ limit), second 5 % 3
    } finally {
      Object.defineProperty(globalThis.crypto, "getRandomValues", {
        value: orig,
        configurable: true,
      });
    }
  });

  it("validates bounds", () => {
    expect(() => seededRng(1).int(0)).toThrow(RangeError);
    expect(() => cryptoRng().int(1.5)).toThrow(RangeError);
    expect(() => pick(seededRng(1), [])).toThrow(RangeError);
  });

  it("randomId and pick", () => {
    expect(randomId(seededRng(5))).toMatch(/^[0-9a-z]{12}$/);
    expect(randomId(seededRng(5), 4)).toHaveLength(4);
    expect(["a", "b"]).toContain(pick(seededRng(9), ["a", "b"]));
  });
});

describe("first player", () => {
  // @req GAME-011
  it("random first player is uniform over 4 seats (chi-square, 10k seeded runs)", () => {
    const rng = seededRng(2026);
    const counts = [0, 0, 0, 0];
    const seats = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
    for (let i = 0; i < 10_000; i++) {
      const fp = pickFirstSeat(seats, "random", rng);
      counts[seats.findIndex((s) => s.id === fp.firstSeat)]!++;
    }
    expect(chiSquare(counts)).toBeLessThan(16.27); // df=3, p=0.001
  });

  // @req GAME-011
  it("createGame's random first player is uniform too", () => {
    const rng = seededRng(77);
    const counts: Record<string, number> = {};
    for (let i = 0; i < 4000; i++) {
      const g = createGame({ preset: testPreset(), players: 4 }, rng, T0);
      counts[g.turn.firstSeat] = (counts[g.turn.firstSeat] ?? 0) + 1;
    }
    expect(Object.keys(counts).sort()).toEqual(["s1", "s2", "s3", "s4"]);
    expect(chiSquare(Object.values(counts))).toBeLessThan(16.27);
  });

  // @req GAME-012
  it("supports choose / loser / winner / roll-off rules with random fallback", () => {
    const seats = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const rng = seededRng(3);
    expect(pickFirstSeat(seats, "choose", rng)).toEqual({
      firstSeat: "a",
      awaitingFirstPlayer: true,
    });
    expect(
      pickFirstSeat(seats, "loser", rng, { winners: ["a"], firstEliminated: "c" }).firstSeat,
    ).toBe("c");
    expect(pickFirstSeat(seats, "winner", rng, { winners: ["zz", "b"] }).firstSeat).toBe("b");
    expect(seats.map((s) => s.id)).toContain(pickFirstSeat(seats, "loser", rng).firstSeat);
    expect(seats.map((s) => s.id)).toContain(
      pickFirstSeat(seats, "winner", rng, { winners: [] }).firstSeat,
    );
    expect(() => pickFirstSeat([], "random", rng)).toThrow(RangeError);
  });

  // @req GAME-012
  it("roll-off rerolls ties until one seat has the highest d20", () => {
    const rolls = [20, 20, 3, 7, 15]; // a=20, b=20, c=3 → tie a/b → a=7, b=15 → b
    const scripted: Rng = { int: () => rolls.shift()! - 1 };
    const fp = pickFirstSeat([{ id: "a" }, { id: "b" }, { id: "c" }], "rolloff", scripted);
    expect(fp.firstSeat).toBe("b");
    expect(fp.rolloff).toEqual({ a: [20, 7], b: [20, 15], c: [3] });
    const g = newGame({ options: { firstPlayerRule: "rolloff" }, firstSeatId: undefined });
    expect(g.turn.rolloff).toBeDefined();
  });
});
