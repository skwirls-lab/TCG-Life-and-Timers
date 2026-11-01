import { describe, expect, it } from "vitest";
import { counterValue, createGame, seededRng } from "@/engine";
import { getBuiltInPreset } from "@/presets";
import {
  applyProfile,
  effectiveStart,
  moveSeat,
  playerChoices,
  resizeSeats,
  setPlayers,
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

  it("shows commander inputs only for presets with commander counters", () => {
    expect(usesCommanders(commander)).toBe(true);
    expect(usesCommanders(constructed)).toBe(false);
  });
});
