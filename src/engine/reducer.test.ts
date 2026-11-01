// @vitest-environment node
import { describe, expect, it } from "vitest";
import { newGame, T0, testPreset } from "../../tests/unit/helpers/engine";
import {
  counterKey,
  counterValue,
  globalValue,
  reduce,
  seededRng,
  tokenHolder,
  type Game,
  type GameAction,
} from "./index";

const rng = seededRng(7);
const step = (g: Game, ...actions: GameAction[]) =>
  actions.reduce((acc, a) => reduce(acc, a, { rng }), g);
const life = (g: Game, seat: string) => counterValue(g, "life", seat);

describe("COUNTER_ADD / COUNTER_SET", () => {
  // @req CTR-002
  it("adds, clamps to [min,max] and ignores invalid targets", () => {
    let g = newGame();
    g = step(g, { type: "COUNTER_ADD", counterId: "life", seatId: "s1", delta: -3, now: T0 + 1 });
    expect(life(g, "s1")).toBe(17);
    g = step(g, { type: "COUNTER_ADD", counterId: "poison", seatId: "s1", delta: -5, now: T0 + 2 });
    expect(counterValue(g, "poison", "s1")).toBe(0);
    const same = step(g, {
      type: "COUNTER_ADD",
      counterId: "poison",
      seatId: "s1",
      delta: -1,
      now: T0 + 3,
    });
    expect(same).toBe(g);
    expect(
      step(g, { type: "COUNTER_ADD", counterId: "nope", seatId: "s1", delta: 1, now: T0 }),
    ).toBe(g);
    expect(
      step(g, { type: "COUNTER_ADD", counterId: "life", seatId: "zz", delta: 1, now: T0 }),
    ).toBe(g);
    expect(
      step(g, { type: "COUNTER_ADD", counterId: "energy", seatId: "s1", delta: 1, now: T0 }),
    ).toBe(g);
    expect(
      step(g, { type: "COUNTER_ADD", counterId: "flag", seatId: "s1", delta: 1, now: T0 }),
    ).toBe(g);
    expect(
      step(g, { type: "COUNTER_ADD", counterId: "monarch", seatId: "s1", delta: 1, now: T0 }),
    ).toBe(g);
    expect(
      step(g, { type: "COUNTER_ADD", counterId: "life", seatId: "s1", delta: Number.NaN, now: T0 }),
    ).toBe(g);
  });

  // @req CTR-002
  it("COUNTER_SET sets exact values (clamped) and global counters ignore seatId", () => {
    let g = newGame({ enabledCounters: ["life", "energy", "storm"] });
    g = step(g, { type: "COUNTER_SET", counterId: "energy", seatId: "s2", value: 99, now: T0 + 1 });
    expect(counterValue(g, "energy", "s2")).toBe(5);
    g = step(g, { type: "COUNTER_ADD", counterId: "storm", seatId: "s2", delta: 3, now: T0 + 2 });
    expect(globalValue(g, "storm")).toBe(3);
    expect(g.values[counterKey("storm")]).toBe(3);
  });

  // @req HIST-012
  it("logs one event per change with from/to/delta", () => {
    const g = step(newGame(), {
      type: "COUNTER_ADD",
      counterId: "life",
      seatId: "s2",
      delta: -4,
      now: T0 + 10,
    });
    const ev = g.log.at(-1)!;
    expect(ev).toMatchObject({
      kind: "counter",
      counterId: "life",
      seatId: "s2",
      from: 20,
      to: 16,
      delta: -4,
    });
    expect(g.activity.changes).toBe(1);
  });
});

describe("commander damage and tax", () => {
  // @req CMD-001 @req CMD-004 @req CTR-005
  it("CMD_DAMAGE_ADD changes the matrix cell and life together, as two linked events", () => {
    const g = step(newGame(), {
      type: "CMD_DAMAGE_ADD",
      targetSeatId: "s2",
      sourceSeatId: "s3",
      sourceIndex: 0,
      delta: 5,
      now: T0 + 1,
    });
    expect(counterValue(g, "cmd", "s2", "s3", 0)).toBe(5);
    expect(life(g, "s2")).toBe(15);
    const [a, b] = g.log.slice(-2);
    expect(a).toMatchObject({
      counterId: "cmd",
      seatId: "s2",
      sourceSeatId: "s3",
      sourceIndex: 0,
      delta: 5,
    });
    expect(b).toMatchObject({ counterId: "life", seatId: "s2", delta: -5, linkedTo: a!.id });
    // removing damage restores life
    const g2 = step(g, {
      type: "CMD_DAMAGE_ADD",
      targetSeatId: "s2",
      sourceSeatId: "s3",
      sourceIndex: 0,
      delta: -2,
      now: T0 + 9000,
    });
    expect(life(g2, "s2")).toBe(17);
  });

  // @req CMD-004
  it("life link can be disabled with the commanderDamageLifeLoss option", () => {
    let g = step(newGame(), { type: "SET_OPTION", key: "commanderDamageLifeLoss", value: false });
    g = step(g, {
      type: "CMD_DAMAGE_ADD",
      targetSeatId: "s2",
      sourceSeatId: "s3",
      sourceIndex: 0,
      delta: 5,
      now: T0 + 1,
    });
    expect(life(g, "s2")).toBe(20);
    expect(g.log.at(-1)!.linkedTo).toBeUndefined();
  });

  // @req CMD-003
  it("partners get a second source index; out-of-range indexes are ignored", () => {
    let g = newGame();
    const bad = step(g, {
      type: "CMD_DAMAGE_ADD",
      targetSeatId: "s2",
      sourceSeatId: "s3",
      sourceIndex: 1,
      delta: 1,
      now: T0,
    });
    expect(bad).toBe(g);
    g = step(g, { type: "SEAT_SET_COMMANDERS", seatId: "s3", commanders: ["A", "B", "C"] });
    expect(g.seats[2]!.commanders).toEqual(["A", "B"]);
    g = step(g, {
      type: "CMD_DAMAGE_ADD",
      targetSeatId: "s2",
      sourceSeatId: "s3",
      sourceIndex: 1,
      delta: 2,
      now: T0 + 1,
    });
    expect(counterValue(g, "cmd", "s2", "s3", 1)).toBe(2);
    const noPartners = step(g, { type: "SET_OPTION", key: "partnersAllowed", value: false });
    expect(
      step(noPartners, {
        type: "CMD_DAMAGE_ADD",
        targetSeatId: "s2",
        sourceSeatId: "s3",
        sourceIndex: 1,
        delta: 1,
        now: T0 + 5000,
      }),
    ).toBe(noPartners);
  });

  it("CMD_DAMAGE_ADD is a no-op without a matrix counter", () => {
    const g = newGame({ enabledCounters: ["life"] });
    expect(
      step(g, {
        type: "CMD_DAMAGE_ADD",
        targetSeatId: "s2",
        sourceSeatId: "s3",
        sourceIndex: 0,
        delta: 1,
        now: T0,
      }),
    ).toBe(g);
    expect(
      step(g, {
        type: "CMD_DAMAGE_ADD",
        counterId: "cmd",
        targetSeatId: "s2",
        sourceSeatId: "s3",
        sourceIndex: 0,
        delta: 1,
        now: T0,
      }),
    ).toBe(g);
  });

  // @req CMD-010
  it("CMD_TAX_CAST counts casts per commander", () => {
    let g = step(newGame(), { type: "SEAT_SET_COMMANDERS", seatId: "s1", commanders: ["A", "B"] });
    g = step(
      g,
      { type: "CMD_TAX_CAST", seatId: "s1", commanderIndex: 0, delta: 1, now: T0 + 1 },
      { type: "CMD_TAX_CAST", seatId: "s1", commanderIndex: 1, delta: 1, now: T0 + 5000 },
      {
        type: "CMD_TAX_CAST",
        counterId: "tax",
        seatId: "s1",
        commanderIndex: 1,
        delta: 1,
        now: T0 + 10000,
      },
    );
    expect(counterValue(g, "tax", "s1", undefined, 0)).toBe(1);
    expect(counterValue(g, "tax", "s1", undefined, 1)).toBe(2);
    expect(
      step(g, { type: "CMD_TAX_CAST", seatId: "s1", commanderIndex: 2, delta: 1, now: T0 }),
    ).toBe(g);
  });

  // @req CMD-011
  it("CMD_TAX_CAST on a non-perCommander tax counter ignores the index", () => {
    const p = testPreset();
    const preset = {
      ...p,
      counters: p.counters.map((c) => (c.id === "tax" ? { ...c, perCommander: false } : c)),
    };
    const g = step(newGame({ preset }), {
      type: "CMD_TAX_CAST",
      seatId: "s1",
      commanderIndex: 3,
      delta: 1,
      now: T0,
    });
    expect(counterValue(g, "tax", "s1")).toBe(1);
  });
});

describe("booleans, enums, tokens", () => {
  // @req TOK-004
  it("BOOL_TOGGLE toggles or sets explicitly", () => {
    let g = step(newGame(), { type: "BOOL_TOGGLE", counterId: "flag", seatId: "s1", now: T0 + 1 });
    expect(counterValue(g, "flag", "s1")).toBe(1);
    expect(
      step(g, { type: "BOOL_TOGGLE", counterId: "flag", seatId: "s1", value: true, now: T0 + 2 }),
    ).toBe(g);
    g = step(g, { type: "BOOL_TOGGLE", counterId: "flag", seatId: "s1", now: T0 + 3 });
    expect(counterValue(g, "flag", "s1")).toBe(0);
    expect(step(g, { type: "BOOL_TOGGLE", counterId: "life", seatId: "s1", now: T0 })).toBe(g);
    expect(step(g, { type: "BOOL_TOGGLE", counterId: "flag", seatId: "zz", now: T0 })).toBe(g);
  });

  it("BOOL_TOGGLE respects exclusiveGroup (linked events)", () => {
    let g = step(newGame(), {
      type: "BOOL_TOGGLE",
      counterId: "asleep",
      seatId: "s1",
      now: T0 + 1,
    });
    g = step(g, { type: "BOOL_TOGGLE", counterId: "confused", seatId: "s1", now: T0 + 2 });
    expect(counterValue(g, "asleep", "s1")).toBe(0);
    expect(counterValue(g, "confused", "s1")).toBe(1);
    const [main, cleared] = g.log.slice(-2);
    expect(main!.counterId).toBe("confused");
    expect(cleared).toMatchObject({ counterId: "asleep", to: 0, linkedTo: main!.id });
    // another seat is independent
    g = step(g, { type: "BOOL_TOGGLE", counterId: "asleep", seatId: "s2", now: T0 + 3 });
    expect(counterValue(g, "confused", "s1")).toBe(1);
  });

  // @req TOK-003
  it("ENUM_NEXT cycles day/night without returning to Neither; ENUM_SET clamps", () => {
    let g = newGame();
    const next = (x: Game) => step(x, { type: "ENUM_NEXT", counterId: "daynight", now: T0 + 1 });
    g = next(g);
    expect(globalValue(g, "daynight")).toBe(1);
    g = next(g);
    expect(globalValue(g, "daynight")).toBe(2);
    g = next(g);
    expect(globalValue(g, "daynight")).toBe(1);
    g = step(g, { type: "ENUM_SET", counterId: "daynight", index: 0, now: T0 + 2 });
    expect(globalValue(g, "daynight")).toBe(0);
    g = step(g, { type: "ENUM_SET", counterId: "daynight", index: 9, now: T0 + 3 });
    expect(globalValue(g, "daynight")).toBe(2);
    expect(step(g, { type: "ENUM_SET", counterId: "daynight", index: 1.5, now: T0 })).toBe(g);
    // per-seat enum with default cycle (wraps to 0)
    g = step(
      g,
      { type: "ENUM_NEXT", counterId: "mode", seatId: "s1", now: T0 + 4 },
      { type: "ENUM_NEXT", counterId: "mode", seatId: "s1", now: T0 + 5 },
    );
    expect(counterValue(g, "mode", "s1")).toBe(0);
    expect(step(g, { type: "ENUM_NEXT", counterId: "life", seatId: "s1", now: T0 })).toBe(g);
    expect(step(g, { type: "ENUM_NEXT", counterId: "mode", seatId: "zz", now: T0 })).toBe(g);
  });

  // @req TOK-001
  it("TOKEN_GIVE transfers an exclusive token; TOKEN_CLEAR removes it", () => {
    let g = step(newGame(), {
      type: "TOKEN_GIVE",
      counterId: "monarch",
      seatId: "s1",
      now: T0 + 1,
    });
    expect(tokenHolder(g, "monarch")).toBe("s1");
    g = step(g, { type: "TOKEN_GIVE", counterId: "monarch", seatId: "s3", now: T0 + 2 });
    expect(tokenHolder(g, "monarch")).toBe("s3");
    expect(g.log.at(-1)).toMatchObject({
      kind: "token",
      seatId: "s3",
      meta: { from: "s1", to: "s3" },
    });
    expect(step(g, { type: "TOKEN_GIVE", counterId: "monarch", seatId: "s3", now: T0 })).toBe(g);
    expect(step(g, { type: "TOKEN_GIVE", counterId: "monarch", seatId: "zz", now: T0 })).toBe(g);
    expect(step(g, { type: "TOKEN_GIVE", counterId: "life", seatId: "s1", now: T0 })).toBe(g);
    expect(step(g, { type: "TOKEN_GIVE", counterId: "init", seatId: "s1", now: T0 })).toBe(g);
    g = step(g, { type: "TOKEN_CLEAR", counterId: "monarch", now: T0 + 3 });
    expect(tokenHolder(g, "monarch")).toBeNull();
    expect(g.log.at(-1)!.seatId).toBeUndefined();
  });

  it("COUNTER_ENABLE toggles optional counters but never the primary", () => {
    let g = newGame();
    g = step(g, { type: "COUNTER_ENABLE", counterId: "energy", enabled: true });
    g = step(g, { type: "COUNTER_ADD", counterId: "energy", seatId: "s1", delta: 2, now: T0 + 1 });
    expect(counterValue(g, "energy", "s1")).toBe(2);
    expect(step(g, { type: "COUNTER_ENABLE", counterId: "energy", enabled: true })).toBe(g);
    expect(step(g, { type: "COUNTER_ENABLE", counterId: "life", enabled: false })).toBe(g);
    expect(step(g, { type: "COUNTER_ENABLE", counterId: "nope", enabled: true })).toBe(g);
    g = step(g, { type: "COUNTER_ENABLE", counterId: "init", enabled: true });
    expect(g.tokens.init).toBeNull();
    g = step(g, { type: "COUNTER_ENABLE", counterId: "poison", enabled: false });
    expect(g.enabledCounters).not.toContain("poison");
  });
});

describe("thresholds, elimination, game end", () => {
  // @req CTR-003 @req CTR-004
  it("auto-KO eliminates at the threshold and auto-revives when crossing back", () => {
    let g = step(newGame(), {
      type: "COUNTER_ADD",
      counterId: "life",
      seatId: "s2",
      delta: -20,
      now: T0 + 1,
    });
    expect(g.seats[1]!.eliminated).toBe(true);
    expect(g.seats[1]!.eliminatedCause).toEqual({ kind: "threshold", counterId: "life" });
    expect(g.log.at(-1)).toMatchObject({
      kind: "eliminate",
      seatId: "s2",
      meta: { cause: "threshold", counterId: "life" },
    });
    expect(g.eliminations).toHaveLength(1);
    g = step(g, { type: "COUNTER_ADD", counterId: "life", seatId: "s2", delta: 1, now: T0 + 5000 });
    expect(g.seats[1]!.eliminated).toBe(false);
    expect(g.eliminations).toHaveLength(0);
    expect(g.log.at(-1)!.kind).toBe("revive");
  });

  // @req CTR-004
  it("autoRevive off keeps the seat eliminated", () => {
    let g = step(newGame(), { type: "SET_OPTION", key: "autoRevive", value: false });
    g = step(g, { type: "COUNTER_ADD", counterId: "poison", seatId: "s2", delta: 10, now: T0 + 1 });
    g = step(g, {
      type: "COUNTER_ADD",
      counterId: "poison",
      seatId: "s2",
      delta: -1,
      now: T0 + 5000,
    });
    expect(g.seats[1]!.eliminated).toBe(true);
  });

  // @req CTR-003
  it("autoKO off ignores thresholds; prompt mode asks first", () => {
    let off = step(newGame(), { type: "SET_OPTION", key: "autoKO", value: "off" });
    off = step(off, {
      type: "COUNTER_ADD",
      counterId: "life",
      seatId: "s2",
      delta: -25,
      now: T0 + 1,
    });
    expect(off.seats[1]!.eliminated).toBe(false);

    let g = step(newGame(), { type: "SET_OPTION", key: "autoKO", value: "prompt" });
    g = step(g, { type: "COUNTER_ADD", counterId: "life", seatId: "s2", delta: -25, now: T0 + 1 });
    expect(g.seats[1]!.eliminated).toBe(false);
    expect(g.pendingPrompts).toHaveLength(1);
    const prompt = g.pendingPrompts[0]!;
    expect(prompt).toMatchObject({ kind: "eliminate", seatId: "s2" });
    // a second trigger on the same seat does not stack prompts
    g = step(g, { type: "COUNTER_ADD", counterId: "poison", seatId: "s2", delta: 10, now: T0 + 2 });
    expect(g.pendingPrompts).toHaveLength(1);
    // decline → suppressed until the condition clears
    const declined = step(g, {
      type: "RESOLVE_PROMPT",
      promptId: prompt.id,
      accept: false,
      now: T0 + 3,
    });
    expect(declined.seats[1]!.eliminated).toBe(false);
    expect(declined.suppressedTriggers).toContain(prompt.trigger);
    // accept → eliminated
    const accepted = step(g, {
      type: "RESOLVE_PROMPT",
      promptId: prompt.id,
      accept: true,
      now: T0 + 3,
    });
    expect(accepted.seats[1]!.eliminated).toBe(true);
    expect(step(g, { type: "RESOLVE_PROMPT", promptId: "nope", accept: true, now: T0 })).toBe(g);
    // prompt disappears when the value moves back
    const healed = step(g, {
      type: "COUNTER_SET",
      counterId: "life",
      seatId: "s2",
      value: 5,
      now: T0 + 4,
    });
    const healed2 = step(healed, {
      type: "COUNTER_SET",
      counterId: "poison",
      seatId: "s2",
      value: 0,
      now: T0 + 5,
    });
    expect(healed2.pendingPrompts).toHaveLength(0);
  });

  it("per-rule autoApply overrides the game option", () => {
    const p = testPreset();
    const preset = {
      ...p,
      counters: p.counters.map((c) =>
        c.id === "poison" ? { ...c, threshold: { ...c.threshold!, autoApply: "off" as const } } : c,
      ),
    };
    const g = step(newGame({ preset }), {
      type: "COUNTER_ADD",
      counterId: "poison",
      seatId: "s2",
      delta: 12,
      now: T0,
    });
    expect(g.seats[1]!.eliminated).toBe(false);
  });

  // @req GAME-013 @req CMD-005
  it("threshold overrides: per game, per seat, and null disables", () => {
    let g = newGame({
      thresholdOverrides: { poison: 15 },
      perSeatThreshold: { s2: { poison: null }, s3: { poison: 3 } },
    });
    g = step(
      g,
      { type: "COUNTER_ADD", counterId: "poison", seatId: "s1", delta: 12, now: T0 + 1 },
      { type: "COUNTER_ADD", counterId: "poison", seatId: "s2", delta: 50, now: T0 + 2 },
      { type: "COUNTER_ADD", counterId: "poison", seatId: "s3", delta: 3, now: T0 + 3 },
    );
    expect(g.seats.map((s) => s.eliminated)).toEqual([false, false, true, false]);
    const disabled = newGame({ thresholdOverrides: { life: null } });
    expect(
      step(disabled, { type: "COUNTER_ADD", counterId: "life", seatId: "s1", delta: -30, now: T0 })
        .seats[0]!.eliminated,
    ).toBe(false);
  });

  // @req GAME-014
  it("ends the game when one seat remains and reopens on a misclick fix", () => {
    let g = step(
      newGame(),
      { type: "ELIMINATE", seatId: "s2", now: T0 + 1 },
      { type: "CONCEDE", seatId: "s3", now: T0 + 2 },
    );
    expect(g.status).toBe("ready");
    g = step(g, { type: "COUNTER_ADD", counterId: "life", seatId: "s4", delta: -20, now: T0 + 3 });
    expect(g.status).toBe("ended");
    expect(g.result).toMatchObject({ winners: ["s1"], reason: "lastStanding" });
    expect(g.result!.eliminated.map((e) => e.seatId)).toEqual(["s2", "s3", "s4"]);
    expect(g.result!.eliminated[1]!.cause).toEqual({ kind: "concede" });
    expect(g.log.some((e) => e.kind === "concede")).toBe(true);
    g = step(g, { type: "COUNTER_ADD", counterId: "life", seatId: "s4", delta: 3, now: T0 + 5000 });
    expect(g.status).toBe("ready");
    expect(g.result).toBeUndefined();
  });

  it("refreshes result.eliminated when eliminations change after the end", () => {
    let g = step(
      newGame({ players: 3, seats: undefined }),
      { type: "START_GAME", now: T0 },
      { type: "END_GAME", winners: ["s1", "zz"], now: T0 + 1 },
    );
    expect(g.result).toMatchObject({ winners: ["s1"], reason: "manual" });
    expect(g.status).toBe("ended");
    g = step(g, { type: "ELIMINATE", seatId: "s2", cause: { kind: "time" }, now: T0 + 2 });
    expect(g.status).toBe("ended");
    expect(g.result!.eliminated).toHaveLength(1);
    expect(step(g, { type: "END_GAME", winners: [], now: T0 + 3 })).toBe(g);
  });

  // @req CTR-003
  it("win thresholds end the game with that winner; prompt mode asks", () => {
    let g = step(newGame(), {
      type: "COUNTER_ADD",
      counterId: "lore",
      seatId: "s3",
      delta: 20,
      now: T0 + 1,
    });
    expect(g.status).toBe("ended");
    expect(g.result).toMatchObject({ winners: ["s3"], reason: "winThreshold" });
    g = step(g, {
      type: "COUNTER_ADD",
      counterId: "lore",
      seatId: "s3",
      delta: -1,
      now: T0 + 5000,
    });
    expect(g.status).toBe("ready");

    let p = step(newGame(), { type: "SET_OPTION", key: "autoKO", value: "prompt" });
    p = step(p, { type: "COUNTER_ADD", counterId: "lore", seatId: "s3", delta: 20, now: T0 + 1 });
    expect(p.pendingPrompts[0]).toMatchObject({ kind: "win", seatId: "s3" });
    p = step(p, {
      type: "RESOLVE_PROMPT",
      promptId: p.pendingPrompts[0]!.id,
      accept: true,
      now: T0 + 2,
    });
    expect(p.result).toMatchObject({ winners: ["s3"] });
  });

  it("manual REVIVE suppresses auto re-KO until the condition clears", () => {
    let g = step(newGame(), {
      type: "COUNTER_ADD",
      counterId: "life",
      seatId: "s2",
      delta: -20,
      now: T0 + 1,
    });
    g = step(g, { type: "REVIVE", seatId: "s2", now: T0 + 2 });
    expect(g.seats[1]!.eliminated).toBe(false);
    g = step(g, { type: "COUNTER_ADD", counterId: "life", seatId: "s2", delta: -1, now: T0 + 3 });
    expect(g.seats[1]!.eliminated).toBe(false);
    expect(step(g, { type: "REVIVE", seatId: "s2", now: T0 })).toBe(g);
    // condition clears → suppression forgotten → next KO applies again
    g = step(g, { type: "COUNTER_SET", counterId: "life", seatId: "s2", value: 4, now: T0 + 4 });
    expect(g.suppressedTriggers).toHaveLength(0);
    g = step(g, {
      type: "COUNTER_ADD",
      counterId: "life",
      seatId: "s2",
      delta: -4,
      now: T0 + 9000,
    });
    expect(g.seats[1]!.eliminated).toBe(true);
  });

  it("ELIMINATE on an unknown or already-eliminated seat is a no-op", () => {
    const g = step(newGame(), { type: "ELIMINATE", seatId: "s2", now: T0 + 1 });
    expect(step(g, { type: "ELIMINATE", seatId: "s2", now: T0 + 2 })).toBe(g);
    expect(step(g, { type: "ELIMINATE", seatId: "zz", now: T0 + 2 })).toBe(g);
  });

  it("one-seat games end only when the seat is eliminated", () => {
    let g = newGame({ players: 1, seats: undefined, firstSeatId: undefined });
    g = step(g, { type: "COUNTER_ADD", counterId: "life", seatId: "s1", delta: -5, now: T0 });
    expect(g.status).toBe("ready");
    g = step(g, {
      type: "COUNTER_ADD",
      counterId: "life",
      seatId: "s1",
      delta: -15,
      now: T0 + 5000,
    });
    expect(g.status).toBe("ended");
    expect(g.result!.winners).toEqual([]);
  });
});

describe("turns", () => {
  // @req TURN-001 @req TMR-003
  it("START_GAME then PASS_TURN advances clockwise, counting turns and rounds", () => {
    let g = newGame({ firstSeatId: "s2" });
    g = step(g, { type: "START_GAME", now: T0 + 1 });
    expect(g.status).toBe("running");
    expect(g.startedAt).toBe(T0 + 1);
    expect(step(g, { type: "START_GAME", now: T0 + 2 })).toBe(g);
    const seq: string[] = [];
    for (let i = 0; i < 4; i++) {
      g = step(g, { type: "PASS_TURN", now: T0 + 10 + i });
      seq.push(g.turn.activeSeat);
    }
    expect(seq).toEqual(["s3", "s4", "s1", "s2"]);
    expect(g.turn.turnNumber).toBe(5);
    expect(g.turn.round).toBe(2);
    expect(g.turn.turnsTaken.s2).toBe(2);
    expect(g.log.at(-1)).toMatchObject({
      kind: "turn",
      seatId: "s2",
      meta: { from: "s1", turnNumber: 5, round: 2 },
    });
  });

  it("counterclockwise reverses the order; PASS_TURN from ready starts the game", () => {
    let g = step(newGame(), { type: "SET_OPTION", key: "turnOrder", value: "counterclockwise" });
    expect(g.turn.order).toEqual(["s4", "s3", "s2", "s1"]);
    g = step(g, { type: "PASS_TURN", now: T0 + 1 });
    expect(g.status).toBe("running");
    expect(g.turn.activeSeat).toBe("s4");
  });

  // @req TMR-003
  it("skips eliminated seats and never stops on them", () => {
    let g = step(
      newGame(),
      { type: "START_GAME", now: T0 },
      { type: "ELIMINATE", seatId: "s2", now: T0 + 1 },
    );
    g = step(g, { type: "PASS_TURN", now: T0 + 2 });
    expect(g.turn.activeSeat).toBe("s3");
  });

  // @req TMR-023
  it("eliminating the active seat passes the turn when turn tracking is on", () => {
    let g = step(newGame({ options: { turnTracking: true } }), { type: "START_GAME", now: T0 });
    g = step(g, { type: "CONCEDE", seatId: "s1", now: T0 + 1 });
    expect(g.turn.activeSeat).toBe("s2");
    const off = step(
      newGame(),
      { type: "START_GAME", now: T0 },
      { type: "CONCEDE", seatId: "s1", now: T0 + 1 },
    );
    expect(off.turn.activeSeat).toBe("s1");
  });

  // @req CUS-008
  it("resets per-turn counters: player ones for the seat that passed, globals always", () => {
    const g = step(
      newGame(),
      { type: "START_GAME", now: T0 },
      { type: "BOOL_TOGGLE", counterId: "flag", seatId: "s1", now: T0 + 1 },
      { type: "BOOL_TOGGLE", counterId: "flag", seatId: "s2", now: T0 + 2 },
      { type: "COUNTER_ADD", counterId: "storm", delta: 4, now: T0 + 3 },
      { type: "PASS_TURN", now: T0 + 4 },
    );
    expect(counterValue(g, "flag", "s1")).toBe(0);
    expect(counterValue(g, "flag", "s2")).toBe(1);
    expect(globalValue(g, "storm")).toBe(0);
    let keep = step(newGame({ options: { resetPerTurnFlags: false } }), {
      type: "COUNTER_ADD",
      counterId: "storm",
      delta: 4,
      now: T0,
    });
    keep = step(keep, { type: "PASS_TURN", now: T0 + 1 });
    expect(globalValue(keep, "storm")).toBe(4);
  });

  it("PASS_TURN is ignored once the game ended", () => {
    const g = step(newGame(), { type: "END_GAME", winners: ["s1"], now: T0 });
    expect(step(g, { type: "PASS_TURN", now: T0 + 1 })).toBe(g);
  });

  // @req GAME-012
  it("SET_FIRST_PLAYER moves the starter before the game starts", () => {
    let g = newGame({ options: { firstPlayerRule: "choose" }, firstSeatId: undefined });
    expect(g.turn.awaitingFirstPlayer).toBe(true);
    g = step(g, { type: "SET_FIRST_PLAYER", seatId: "s3", now: T0 + 1 });
    expect(g.turn).toMatchObject({ firstSeat: "s3", activeSeat: "s3", awaitingFirstPlayer: false });
    expect(step(g, { type: "SET_FIRST_PLAYER", seatId: "zz", now: T0 })).toBe(g);
    g = step(g, { type: "START_GAME", now: T0 + 2 }, { type: "PASS_TURN", now: T0 + 3 });
    g = step(g, { type: "SET_FIRST_PLAYER", seatId: "s1", now: T0 + 4 });
    expect(g.turn).toMatchObject({ firstSeat: "s1", activeSeat: "s4" });
  });
});

describe("reset and seats", () => {
  // @req GAME-010 @req GAME-011
  it("RESET_GAME keeps seats/options/enabled counters and resets everything else", () => {
    let g = step(
      newGame({ options: { turnTracking: true }, startOverrides: { life: 30 } }),
      { type: "SEAT_SET_ART", seatId: "s1", art: { kind: "solid", value: "#123" } },
      { type: "COUNTER_ENABLE", counterId: "energy", enabled: true },
      { type: "START_GAME", now: T0 + 1 },
      { type: "COUNTER_ADD", counterId: "life", seatId: "s2", delta: -30, now: T0 + 2 },
      { type: "TOKEN_GIVE", counterId: "monarch", seatId: "s3", now: T0 + 3 },
      { type: "PASS_TURN", now: T0 + 4 },
    );
    const before = g;
    g = step(g, { type: "RESET_GAME", now: T0 + 100 });
    expect(g.id).not.toBe(before.id);
    expect(g.status).toBe("ready");
    expect(g.startedAt).toBeUndefined();
    expect(g.seats.map((s) => s.name)).toEqual(before.seats.map((s) => s.name));
    expect(g.seats[0]!.art).toEqual({ kind: "solid", value: "#123" });
    expect(g.seats.every((s) => !s.eliminated)).toBe(true);
    expect(life(g, "s2")).toBe(30);
    expect(g.enabledCounters).toContain("energy");
    expect(tokenHolder(g, "monarch")).toBeNull();
    expect(g.turn.turnNumber).toBe(1);
    expect(g.log.map((e) => e.kind)).toEqual(["reset", "firstPlayer"]);
    expect(g.previous).toEqual({ winners: [], firstEliminated: "s2" });
    expect(g.options).toEqual(before.options);
  });

  // @req LAY-005
  it("SEAT_REORDER changes the turn order; invalid orders are ignored", () => {
    let g = newGame();
    expect(step(g, { type: "SEAT_REORDER", order: ["s1", "s2"], now: T0 })).toBe(g);
    expect(step(g, { type: "SEAT_REORDER", order: ["s1", "s2", "s3", "s4"], now: T0 })).toBe(g);
    expect(step(g, { type: "SEAT_REORDER", order: ["s1", "s1", "s3", "s4"], now: T0 })).toBe(g);
    g = step(g, { type: "SEAT_REORDER", order: ["s4", "s3", "s2", "s1"], now: T0 + 1 });
    expect(g.seats.map((s) => s.id)).toEqual(["s4", "s3", "s2", "s1"]);
    expect(g.turn.order).toEqual(["s4", "s3", "s2", "s1"]);
  });

  // @req LAY-009
  it("SEAT_ADD inserts a seat with start values and a clock", () => {
    let g = step(newGame({ startOverrides: { life: 25 } }), {
      type: "SEAT_ADD",
      seat: { name: "Late" },
      index: 1,
      now: T0 + 1,
    });
    expect(g.seats.map((s) => s.name)).toEqual(["Bethany", "Late", "JP", "Conner", "Josh"]);
    const late = g.seats[1]!;
    expect(late.id).toBe("s5");
    expect(life(g, late.id)).toBe(25);
    expect(counterValue(g, "cmd", "s1", late.id, 0)).toBe(0);
    expect(g.values[counterKey("cmd", late.id, "s2", 0)]).toBe(0);
    expect(g.timer.clocks[late.id]).toBeDefined();
    expect(g.turn.order[1]).toBe(late.id);
    expect(g.log.at(-1)!.kind).toBe("seatAdd");
    for (let i = 0; i < 3; i++) g = step(g, { type: "SEAT_ADD", now: T0 + 2 + i });
    expect(g.seats).toHaveLength(8);
    expect(step(g, { type: "SEAT_ADD", now: T0 + 9 })).toBe(g);
    expect(new Set(g.seats.map((s) => s.color)).size).toBe(8);
  });

  // @req LAY-009
  it("SEAT_REMOVE removes the seat, its values and tokens, and records a concession", () => {
    const g = step(
      newGame(),
      { type: "START_GAME", now: T0 },
      { type: "TOKEN_GIVE", counterId: "monarch", seatId: "s1", now: T0 + 1 },
      {
        type: "CMD_DAMAGE_ADD",
        targetSeatId: "s2",
        sourceSeatId: "s1",
        sourceIndex: 0,
        delta: 3,
        now: T0 + 2,
      },
      { type: "SEAT_REMOVE", seatId: "s1", now: T0 + 3 },
    );
    expect(g.seats.map((s) => s.id)).toEqual(["s2", "s3", "s4"]);
    expect(Object.keys(g.values).some((k) => k.includes("|s1|"))).toBe(false);
    expect(tokenHolder(g, "monarch")).toBeNull();
    expect(g.turn.activeSeat).toBe("s2");
    expect(g.turn.firstSeat).toBe("s2");
    expect(g.eliminations[0]).toMatchObject({
      seatId: "s1",
      name: "Bethany",
      removed: true,
      cause: { kind: "concede" },
    });
    expect(g.timer.clocks.s1).toBeUndefined();
    expect(g.log.at(-1)!.kind).toBe("seatRemove");
    expect(step(g, { type: "SEAT_REMOVE", seatId: "zz", now: T0 })).toBe(g);
  });

  it("removing a seat from a 2-player game ends it; removing an eliminated seat keeps its record", () => {
    const two = newGame({ players: 2, seats: undefined, firstSeatId: undefined });
    const g = step(two, { type: "SEAT_REMOVE", seatId: "s2", now: T0 + 1 });
    expect(g.status).toBe("ended");
    expect(g.result!.winners).toEqual(["s1"]);
    expect(step(g, { type: "SEAT_REMOVE", seatId: "s1", now: T0 + 2 })).toBe(g);
    let h = step(
      newGame(),
      { type: "ELIMINATE", seatId: "s3", now: T0 + 1 },
      { type: "SEAT_REMOVE", seatId: "s3", now: T0 + 2 },
    );
    expect(h.eliminations).toEqual([
      expect.objectContaining({ seatId: "s3", removed: true, cause: { kind: "manual" } }),
    ]);
    h = step(h, { type: "REVIVE", seatId: "s3", now: T0 + 3 });
    expect(h.eliminations).toHaveLength(1);
  });

  it("seat cosmetics: rename, art, color, profile, rotation, contrast", () => {
    let g = newGame();
    g = step(
      g,
      { type: "SEAT_RENAME", seatId: "s1", name: "  Beth " },
      { type: "SEAT_SET_COLOR", seatId: "s1", color: "#fff" },
      {
        type: "SEAT_SET_PROFILE",
        seatId: "s1",
        profileId: "p1",
        deckId: "d1",
        deckName: "Toxrill",
        name: "B",
      },
      { type: "SEAT_SET_ROTATION", seatId: "s1", rotation: 90 },
      { type: "SEAT_SET_CONTRAST", seatId: "s1", contrast: true },
      { type: "SEAT_SET_ART", seatId: "s1", art: { kind: "gradient", value: "g1" } },
    );
    expect(g.seats[0]).toMatchObject({
      name: "B",
      color: "#fff",
      profileId: "p1",
      deckId: "d1",
      deckName: "Toxrill",
      rotationOverride: 90,
      contrast: true,
      art: { kind: "gradient", value: "g1" },
    });
    expect(step(g, { type: "SEAT_RENAME", seatId: "s1", name: "   " })).toBe(g);
    expect(step(g, { type: "SEAT_RENAME", seatId: "zz", name: "x" })).toBe(g);
    g = step(
      g,
      { type: "SEAT_SET_ART", seatId: "s1" },
      { type: "SEAT_SET_ROTATION", seatId: "s1" },
      { type: "SEAT_SET_PROFILE", seatId: "s1" },
    );
    expect(g.seats[0]!.art).toBeUndefined();
    expect(g.seats[0]!.rotationOverride).toBeUndefined();
    expect(g.seats[0]!.profileId).toBeUndefined();
    expect(g.seats[0]!.name).toBe("B");
  });

  it("SET_OPTION with the same value is a no-op; LOG_NOTE appends tool results", () => {
    const g = newGame();
    expect(step(g, { type: "SET_OPTION", key: "autoKO", value: "auto" })).toBe(g);
    const n = step(
      g,
      {
        type: "LOG_NOTE",
        kind: "dice",
        text: "d20: 17",
        seatId: "s2",
        meta: { sides: 20, result: 17 },
        now: T0 + 1,
      },
      { type: "LOG_NOTE", kind: "coin", seatId: "zz", now: T0 + 2 },
    );
    expect(n.log.at(-2)).toMatchObject({
      kind: "dice",
      seatId: "s2",
      meta: { text: "d20: 17", sides: 20, result: 17 },
    });
    expect(n.log.at(-1)!.seatId).toBeUndefined();
  });

  it("history and timer actions do not change the game in reduce()", () => {
    const g = newGame();
    expect(step(g, { type: "UNDO" }, { type: "REDO" }, { type: "UNDO_TO", eventId: "e0" })).toBe(g);
    expect(step(g, { type: "TIMER_PAUSE", now: T0 }, { type: "TIMER_RESUME", now: T0 })).toBe(g);
  });
});
