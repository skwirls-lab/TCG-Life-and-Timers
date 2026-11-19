import { describe, expect, it } from "vitest";
import { counterValue, createGame, reduce, seededRng } from "@/engine";
import { getBuiltInPreset } from "@/presets";
import {
  applyProfile,
  effectiveStart,
  moveSeat,
  perSeatMaps,
  playerChoices,
  removeSeat,
  resizeSeats,
  seatStart,
  seatThreshold,
  setPerSeatValue,
  setPlayers,
  setTimer,
  stateForPreset,
  toNewGameConfig,
  toggleCounter,
  updateSeat,
  usesCommanders,
} from "./setupModel";

const commander = getBuiltInPreset("mtg.commander")!;
const limited = getBuiltInPreset("mtg.limited")!;
const constructed = getBuiltInPreset("mtg.constructed")!;

describe("setup wizard model", () => {
  // @req GAME-001
  it("starts from the preset defaults (Commander: 4 players, random first player)", () => {
    const s = stateForPreset(commander, undefined);
    expect(s.players).toBe(4);
    expect(s.seats).toHaveLength(4);
    expect(new Set(s.seats.map((x) => x.color)).size).toBe(4);
    expect(s.firstPlayerRule).toBe("random");
    expect(s.layoutId).toBe("sides");
    expect(effectiveStart(s, commander)).toBe(40);
  });

  // @req SET-012
  it("applies stored preset defaults", () => {
    const s = stateForPreset(commander, {
      players: 3,
      startOverrides: { "mtg.life": 30 },
      enabledCounters: ["mtg.life"],
      options: { firstPlayerRule: "choose" },
    });
    expect(s.players).toBe(3);
    expect(effectiveStart(s, commander)).toBe(30);
    expect(s.enabledCounters).toEqual(["mtg.life"]);
    expect(s.firstPlayerRule).toBe("choose");
    const cfg = toNewGameConfig(s, commander);
    expect(cfg.startOverrides).toEqual({ "mtg.life": 30 });
    expect(cfg.options?.firstPlayerRule).toBe("choose");
  });

  it("clamps player counts to the preset and keeps seats by index", () => {
    let s = stateForPreset(commander, undefined);
    s = updateSeat(s, 0, { name: "Conner" });
    s = setPlayers(s, commander, 2);
    expect(s.seats.map((x) => x.name)).toEqual(["Conner", ""]);
    s = setPlayers(s, commander, 99);
    expect(s.players).toBe(8);
    expect(setPlayers(stateForPreset(limited, undefined), limited, 4).players).toBe(2);
    expect(resizeSeats([], 3)).toHaveLength(3);
  });

  // @req LAY-001
  it("offers 2–6 players free and 7–8 as Pro", () => {
    expect(playerChoices(commander)).toEqual([
      { value: 2, pro: false },
      { value: 3, pro: false },
      { value: 4, pro: false },
      { value: 5, pro: false },
      { value: 6, pro: false },
      { value: 7, pro: true },
      { value: 8, pro: true },
    ]);
    expect(playerChoices(limited)).toEqual([{ value: 2, pro: false }]);
  });

  // @req LAY-005
  it("reorders seats with up/down moves", () => {
    let s = stateForPreset(commander, undefined);
    s = { ...s, seats: s.seats.map((x, i) => ({ ...x, name: `P${i}` })) };
    s = moveSeat(s, 0, 1);
    expect(s.seats.map((x) => x.name)).toEqual(["P1", "P0", "P2", "P3"]);
    expect(moveSeat(s, 0, -1)).toBe(s);
    expect(moveSeat(s, 3, 1)).toBe(s);
  });

  // @req LAY-005
  it("removes one seat (later seats move up), never below the minimum", () => {
    let s = stateForPreset(commander, undefined);
    s = { ...s, seats: s.seats.map((x, i) => ({ ...x, name: `P${i}` })) };
    s = removeSeat(s, commander, 1);
    expect(s.players).toBe(3);
    expect(s.seats.map((x) => x.name)).toEqual(["P0", "P2", "P3"]);
    expect(toNewGameConfig(s, commander).seats?.map((x) => x.id)).toEqual(["s1", "s2", "s3"]);
    expect(removeSeat(s, commander, 7)).toBe(s);
    const two = stateForPreset(limited, undefined);
    expect(removeSeat(two, limited, 0)).toBe(two);
  });

  // @req PROF-002
  it("loads a profile and deck into a seat", () => {
    let s = stateForPreset(commander, undefined);
    s = applyProfile(s, 1, {
      profile: { id: "p1", name: "Declan", color: "#123456", contrast: true, updatedAt: 1 },
      deck: {
        id: "d1",
        profileId: "p1",
        name: "Toxrill",
        commanders: ["Toxrill, the Corrosive"],
        updatedAt: 1,
      },
    });
    expect(s.seats[1]).toMatchObject({
      name: "Declan",
      color: "#123456",
      profileId: "p1",
      deckId: "d1",
      deckName: "Toxrill",
      commanders: ["Toxrill, the Corrosive"],
    });
    s = applyProfile(s, 1, {
      profile: { id: "p2", name: "Josh", color: "#654321", contrast: false, updatedAt: 1 },
    });
    expect(s.seats[1]!.deckId).toBeUndefined();
  });

  // @req GAME-013 @req CTR-001
  it("builds an engine config with names, start override and enabled counters", () => {
    let s = stateForPreset(commander, undefined);
    ["Conner", "Josh", "JP", "Bethany"].forEach((name, i) => (s = updateSeat(s, i, { name })));
    s = updateSeat(s, 0, { commanders: ["Atraxa", " "] });
    s = { ...s, startValue: 30 };
    s = toggleCounter(s, "mtg.energy", true);
    expect(toggleCounter(s, "mtg.energy", true)).toBe(s);
    const game = createGame(toNewGameConfig(s, commander), seededRng(5), 1);
    expect(game.seats.map((x) => x.name)).toEqual(["Conner", "Josh", "JP", "Bethany"]);
    expect(game.seats[0]!.commanders).toEqual(["Atraxa"]);
    expect(counterValue(game, "mtg.life", game.seats[2]!.id)).toBe(30);
    expect(game.enabledCounters).toContain("mtg.energy");
    s = toggleCounter(s, "mtg.energy", false);
    expect(s.enabledCounters).not.toContain("mtg.energy");
  });

  // @req GAME-001 @req SET-012 @req TMR-001
  it("sets the clock for the new game; stored preset defaults pre-fill it", () => {
    let s = stateForPreset(commander, undefined);
    expect(s.timer).toEqual(commander.defaults.timer);
    s = setTimer(s, { mode: "bank", bankMs: 20 * 60_000 });
    const game = createGame(toNewGameConfig(s, commander), seededRng(5), 1);
    expect(game.timer.mode).toBe("bank");
    expect(game.timer.clocks[game.seats[0]!.id]!.bankMs).toBe(20 * 60_000);
    expect(game.options.turnTracking).toBe(true);
    const saved = stateForPreset(commander, {
      timer: { mode: "bankIncrement", incrementMs: 5000 },
    });
    expect(saved.timer).toMatchObject({ mode: "bankIncrement", incrementMs: 5000 });
    expect(toNewGameConfig(saved, commander).timer).toMatchObject({ mode: "bankIncrement" });
    // Clocks off: turn tracking follows the preset (not forced on).
    expect(toNewGameConfig(stateForPreset(commander, undefined), commander).options).toEqual({
      firstPlayerRule: "random",
    });
  });

  it("shows commander inputs only for presets with commander counters", () => {
    expect(usesCommanders(commander)).toBe(true);
    expect(usesCommanders(constructed)).toBe(false);
  });
});

describe("per-seat overrides in setup (T3.4)", () => {
  const swu = getBuiltInPreset("swu.premier")!;
  const onePiece = getBuiltInPreset("onepiece.standard")!;
  const rng = seededRng(1);

  // @req PRE-013 @req GAME-013
  it("SWU seats lose at their own base HP threshold", () => {
    let s = stateForPreset(swu, undefined);
    s = updateSeat(s, 0, { name: "Rey", threshold: 25 });
    s = updateSeat(s, 1, { name: "Kylo", threshold: 30 });
    expect(seatThreshold(s, swu, 0)).toBe(25);
    expect(seatThreshold(s, swu, 1)).toBe(30);
    const config = toNewGameConfig(s, swu);
    // 30 is the preset default, so only the first seat is stored
    expect(config.perSeatThreshold).toEqual({ s1: { "swu.baseDamage": 25 } });
    expect(config.perSeatStart).toBeUndefined();
    let game = createGame(config, rng, 1);
    expect(game.seats.map((x) => x.id)).toEqual(["s1", "s2"]);
    for (const seatId of ["s1", "s2"]) {
      game = reduce(
        game,
        { type: "COUNTER_SET", counterId: "swu.baseDamage", seatId, value: 25, now: 2 },
        { rng },
      );
    }
    expect(game.seats.map((x) => x.eliminated)).toEqual([true, false]);
  });

  // @req PRE-013
  it("One Piece seats start at their own leader life and follow seat reordering", () => {
    let s = stateForPreset(onePiece, undefined);
    s = updateSeat(s, 1, { start: 4 });
    expect(seatStart(s, onePiece, 0)).toBe(5);
    expect(seatStart(s, onePiece, 1)).toBe(4);
    s = moveSeat(s, 1, -1);
    expect(seatStart(s, onePiece, 0)).toBe(4);
    const game = createGame(toNewGameConfig(s, onePiece), rng, 1);
    expect(counterValue(game, "op.life", "s1")).toBe(4);
    expect(counterValue(game, "op.life", "s2")).toBe(5);
    // a value equal to the game-wide start is not stored
    expect(perSeatMaps(updateSeat(s, 0, { start: 5 }), onePiece)).toEqual({});
  });

  // @req PRE-013
  it("switching preset clears per-seat values", () => {
    const s = updateSeat(stateForPreset(swu, undefined), 0, { threshold: 25 });
    const next = stateForPreset(commander, undefined, s);
    expect(next.seats[0]!.threshold).toBeUndefined();
  });

  // @req PRE-013
  it("setPerSeatValue adds, replaces and removes per-seat entries", () => {
    let m: Record<string, Record<string, number>> = setPerSeatValue({}, "s1", "c", 25, 30);
    expect(m).toEqual({ s1: { c: 25 } });
    m = setPerSeatValue(m, "s2", "c", 28, 30);
    expect(m).toEqual({ s1: { c: 25 }, s2: { c: 28 } });
    m = setPerSeatValue(m, "s1", "c", 30, 30);
    expect(m).toEqual({ s2: { c: 28 } });
  });
});
