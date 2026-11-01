// @vitest-environment node
import { describe, expect, it } from "vitest";
import { newGame, testPreset, T0 } from "../../tests/unit/helpers/engine";
import {
  activeDuration,
  aliveSeats,
  commanderDamageFrom,
  commanderDamageGrid,
  commanderSources,
  counterDef,
  counterKey,
  describeCause,
  enabledCounters,
  enumLabel,
  hasMeaningfulActivity,
  keyInvolvesSeat,
  parseCounterKey,
  primaryCounter,
  reduce,
  seatCounters,
  seededRng,
  standings,
  taxDisplay,
  value,
  visibleBadges,
  type Game,
  type GameAction,
} from "./index";

const rng = seededRng(11);
const step = (g: Game, ...a: GameAction[]) => a.reduce((acc, x) => reduce(acc, x, { rng }), g);

describe("counter keys", () => {
  it("round-trips keys", () => {
    expect(counterKey("life", "s1")).toBe("life|s1||");
    expect(parseCounterKey("cmd|s1|s2|1")).toEqual({
      counterId: "cmd",
      seatId: "s1",
      sourceSeatId: "s2",
      sourceIndex: 1,
    });
    expect(parseCounterKey("storm|||")).toEqual({ counterId: "storm" });
    expect(() => parseCounterKey("bad")).toThrow();
    expect(() => parseCounterKey("|a||")).toThrow();
    expect(() => parseCounterKey("x|a||-1")).toThrow();
    expect(keyInvolvesSeat("cmd|s1|s2|0", "s2")).toBe(true);
    expect(keyInvolvesSeat("cmd|s1|s2|0", "s3")).toBe(false);
  });
});

describe("selectors", () => {
  // @req CTR-001
  it("value / counterDef / enabledCounters / primaryCounter / enumLabel", () => {
    const g = newGame();
    expect(value(g, counterKey("life", "s1"))).toBe(20);
    expect(value(g, counterKey("energy", "s1"))).toBe(0); // not stored: start fallback
    expect(value(g, counterKey("nope", "s1"))).toBe(0);
    expect(counterDef(g, "poison")!.name).toBe("Poison");
    expect(enabledCounters(g).map((c) => c.id)).not.toContain("energy");
    expect(primaryCounter(g.preset).id).toBe("life");
    expect(() => primaryCounter({ ...testPreset(), counters: [], id: "x" })).toThrow();
    expect(enumLabel(counterDef(g, "daynight")!, 1)).toBe("day");
  });

  // @req SEAT-001 @req LIFE-002
  it("seatCounters and visibleBadges follow visibility rules", () => {
    let g = step(newGame(), { type: "SEAT_SET_COMMANDERS", seatId: "s1", commanders: ["A", "B"] });
    expect(seatCounters(g, "zz")).toEqual([]);
    const taxes = seatCounters(g, "s1").filter((v) => v.def.id === "tax");
    expect(taxes.map((t) => t.sourceIndex)).toEqual([0, 1]);
    // only showWhenDefault badges at start
    expect(visibleBadges(g, "s1").map((b) => b.def.id)).toEqual(["seen"]);
    g = step(
      g,
      { type: "COUNTER_ADD", counterId: "poison", seatId: "s1", delta: 2, now: T0 + 1 },
      { type: "TOKEN_GIVE", counterId: "monarch", seatId: "s1", now: T0 + 2 },
    );
    expect(visibleBadges(g, "s1").map((b) => b.def.id)).toEqual(["poison", "seen", "monarch"]);
    expect(visibleBadges(g, "s2").map((b) => b.def.id)).toEqual(["seen"]);
    expect(visibleBadges(g, "s2", "always").map((b) => b.def.id)).toContain("poison");
    expect(visibleBadges(g, "s2", "always").map((b) => b.def.id)).not.toContain("monarch");
    expect(visibleBadges(g, "s1", "hidden")).toEqual([]);
  });

  // @req CMD-002 @req CMD-010
  it("commander damage grid, sources and tax display", () => {
    let g = step(
      newGame(),
      { type: "SEAT_SET_COMMANDERS", seatId: "s3", commanders: ["A", "B"] },
      {
        type: "CMD_DAMAGE_ADD",
        targetSeatId: "s1",
        sourceSeatId: "s3",
        sourceIndex: 1,
        delta: 4,
        now: T0 + 1,
      },
      { type: "CMD_TAX_CAST", seatId: "s1", commanderIndex: 0, delta: 1, now: T0 + 5000 },
      { type: "CMD_TAX_CAST", seatId: "s1", commanderIndex: 0, delta: 1, now: T0 + 6000 },
    );
    const grid = commanderDamageGrid(g, "s1");
    expect(grid).toHaveLength(5);
    expect(grid.find((c) => c.sourceSeatId === "s3" && c.sourceIndex === 1)!.value).toBe(4);
    expect(grid.find((c) => c.sourceSeatId === "s1")!.self).toBe(true);
    expect(commanderDamageGrid(g, "zz")).toEqual([]);
    expect(commanderDamageFrom(g, "s1", "s3", 1)).toBe(4);
    expect(commanderDamageFrom(g, "s1", "s3", 1, "cmd")).toBe(4);
    expect(commanderSources(g, "s3")).toBe(2);
    expect(commanderSources(g, "zz")).toBe(0);
    expect(taxDisplay(g, "s1")).toEqual({ casts: 2, tax: 4 });
    expect(taxDisplay(g, "s1", 0, "tax")).toEqual({ casts: 2, tax: 4 });
    g = newGame({ enabledCounters: ["life"] });
    expect(commanderDamageFrom(g, "s1", "s2")).toBe(0);
    expect(commanderDamageGrid(g, "s1")).toEqual([]);
    expect(taxDisplay(g, "s1")).toEqual({ casts: 0, tax: 0 });
  });

  // @req HIST-010
  it("standings: winners first, alive by primary value, eliminated last (latest first)", () => {
    let g = step(
      newGame(),
      { type: "COUNTER_ADD", counterId: "life", seatId: "s2", delta: 5, now: T0 + 1 },
      { type: "ELIMINATE", seatId: "s3", now: T0 + 2 },
      { type: "ELIMINATE", seatId: "s4", now: T0 + 3 },
    );
    expect(standings(g).map((r) => r.seat.id)).toEqual(["s2", "s1", "s4", "s3"]);
    g = step(g, { type: "END_GAME", winners: ["s1"], now: T0 + 4 });
    expect(standings(g)[0]!.seat.id).toBe("s1");
    // win-threshold primary going down (prizes ≤ 0 win): lower is better
    const p = testPreset();
    const prizes = {
      ...p,
      counters: p.counters.map((c) =>
        c.id === "life"
          ? {
              ...c,
              start: 6,
              threshold: { comparator: "<=" as const, value: 0, outcome: "win" as const },
            }
          : c,
      ),
    };
    const pg = step(newGame({ preset: prizes }), {
      type: "COUNTER_ADD",
      counterId: "life",
      seatId: "s4",
      delta: -2,
      now: T0,
    });
    expect(standings(pg)[0]!.seat.id).toBe("s4");
    // no threshold: direction decides
    const noRule = {
      ...p,
      counters: p.counters.map((c) =>
        c.id === "life" ? { ...c, threshold: undefined, direction: "up" as const } : c,
      ),
    };
    const ng = step(newGame({ preset: noRule }), {
      type: "COUNTER_ADD",
      counterId: "life",
      seatId: "s3",
      delta: 2,
      now: T0,
    });
    expect(standings(ng)[0]!.seat.id).toBe("s3");
    const none = { ...p, counters: p.counters.filter((c) => c.id !== "life") };
    expect(standings(newGame({ preset: none })).map((r) => r.value)).toEqual([0, 0, 0, 0]);
  });

  it("describeCause covers every cause kind", () => {
    let g = step(newGame(), {
      type: "COUNTER_ADD",
      counterId: "poison",
      seatId: "s2",
      delta: 10,
      now: T0,
    });
    expect(describeCause(g, "s2", g.seats[1]!.eliminatedCause!)).toEqual({
      kind: "threshold",
      counterId: "poison",
      counterName: "Poison",
      value: 10,
    });
    expect(describeCause(g, "s2", { kind: "time" })).toEqual({ kind: "time" });
    expect(describeCause(g, "s2", { kind: "threshold", counterId: "gone" })).toEqual({
      kind: "threshold",
      counterId: "gone",
    });
    g = step(g, { type: "SET_OPTION", key: "commanderDamageLifeLoss", value: false });
    g = step(g, {
      type: "CMD_DAMAGE_ADD",
      targetSeatId: "s1",
      sourceSeatId: "s4",
      sourceIndex: 0,
      delta: 21,
      now: T0 + 5000,
    });
    const d = describeCause(g, "s1", g.seats[0]!.eliminatedCause!);
    expect(d).toMatchObject({ sourceName: "Josh", value: 21 });
    expect(d.commanderName).toBeUndefined();
    expect(
      describeCause(g, "s1", { kind: "threshold", counterId: "cmd", sourceSeatId: "zz" }),
    ).toMatchObject({ sourceSeatId: "zz" });
  });

  // @req HIST-030 @req HIST-031
  it("active duration excludes idle gaps; meaningful activity", () => {
    let g = newGame();
    expect(activeDuration({ ...g, activity: { changes: 0, lastAt: null, activeMs: 0 } }, T0)).toBe(
      0,
    );
    g = step(
      g,
      { type: "COUNTER_ADD", counterId: "life", seatId: "s1", delta: -1, now: T0 + 60_000 },
      { type: "COUNTER_ADD", counterId: "life", seatId: "s2", delta: -1, now: T0 + 2 * 3_600_000 },
    );
    expect(g.activity.activeMs).toBe(60_000);
    expect(activeDuration(g, T0 + 2 * 3_600_000 + 1000)).toBe(61_000);
    expect(activeDuration(g, T0 + 5 * 3_600_000)).toBe(60_000);
    expect(hasMeaningfulActivity(g, T0 + 2 * 3_600_000)).toBe(false);
    g = step(g, {
      type: "COUNTER_ADD",
      counterId: "life",
      seatId: "s3",
      delta: -1,
      now: T0 + 2 * 3_600_000 + 10,
    });
    expect(hasMeaningfulActivity(g, T0)).toBe(true);
    expect(aliveSeats(g)).toHaveLength(4);
  });
});
