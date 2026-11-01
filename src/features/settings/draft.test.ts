import { describe, expect, it } from "vitest";
import { counterValue, createGame, seededRng } from "@/engine";
import { getBuiltInPreset } from "@/presets";
import {
  changedOptions,
  configFromDraft,
  draftForPreset,
  draftFromDefaults,
  draftFromGame,
  isStructuralChange,
  presetDefaultsFromDraft,
  seatsForPlayers,
  setOrOmit,
} from "./draft";
import { seatsFromGame } from "@/features/setup/gameConfig";

const commander = getBuiltInPreset("mtg.commander")!;
const constructed = getBuiltInPreset("mtg.constructed")!;

function game() {
  return createGame(
    {
      preset: commander,
      players: 4,
      seats: ["Conner", "Josh", "JP", "Bethany"].map((name) => ({ name })),
    },
    seededRng(9),
    1,
  );
}

describe("settings draft", () => {
  // @req SET-011
  it("detects structural changes (preset, players, start, thresholds, counters)", () => {
    const d = draftFromGame(game());
    expect(isStructuralChange(d, { ...d })).toBe(false);
    expect(isStructuralChange(d, { ...d, players: 3 })).toBe(true);
    expect(isStructuralChange(d, { ...d, presetId: "mtg.constructed" })).toBe(true);
    expect(isStructuralChange(d, { ...d, startOverrides: { "mtg.life": 30 } })).toBe(true);
    expect(isStructuralChange(d, { ...d, thresholdOverrides: { "mtg.poison": 15 } })).toBe(true);
    expect(isStructuralChange(d, { ...d, perSeatStart: { s1: { "mtg.life": 20 } } })).toBe(true);
    expect(isStructuralChange(d, { ...d, enabledCounters: [...d.enabledCounters, "x"] })).toBe(
      true,
    );
    expect(isStructuralChange(d, { ...d, enabledCounters: [...d.enabledCounters].reverse() })).toBe(
      false,
    );
  });

  // @req SET-011
  it("treats options and the layout variant as live (non-structural) changes", () => {
    const d = draftFromGame(game());
    const next = { ...d, layoutId: "rows", options: { ...d.options, autoKO: "prompt" as const } };
    expect(isStructuralChange(d, next)).toBe(false);
    expect(changedOptions(d, next)).toEqual(["autoKO"]);
  });

  // @req SET-011 @req GAME-010
  it("re-creates a game keeping names and art by index", () => {
    const g = game();
    const d = { ...draftFromGame(g), players: 3, startOverrides: { "mtg.life": 30 } };
    const cfg = configFromDraft(d, commander, seatsFromGame(g), g.timer.config);
    const again = createGame(cfg, seededRng(1), 2);
    expect(again.seats.map((s) => s.name)).toEqual(["Conner", "Josh", "JP"]);
    expect(counterValue(again, "mtg.life", again.seats[0]!.id)).toBe(30);
    expect(seatsForPlayers([{ name: "A" }], 3)).toEqual([{ name: "A" }, {}, {}]);
  });

  // @req SET-012
  it("builds next-game drafts from preset defaults and back", () => {
    const d = draftFromDefaults(commander, { players: 3, startOverrides: { "mtg.life": 30 } });
    expect(d.players).toBe(3);
    expect(d.startOverrides).toEqual({ "mtg.life": 30 });
    expect(d.options.commanderDamageLifeLoss).toBe(true);
    // Same options createGame would produce for the preset.
    const g = createGame({ preset: commander }, seededRng(1), 1);
    expect(draftFromDefaults(commander, undefined).options).toEqual(g.options);
    expect(draftFromDefaults(commander, undefined).enabledCounters.sort()).toEqual(
      [...g.enabledCounters].sort(),
    );
    const saved = presetDefaultsFromDraft(d);
    expect(saved).toMatchObject({ players: 3, startOverrides: { "mtg.life": 30 } });
  });

  it("switches preset, keeping the player count when the new preset allows it", () => {
    expect(draftForPreset(constructed, undefined, 4).players).toBe(4);
    expect(draftForPreset(constructed, undefined, 6).players).toBe(4);
    expect(draftForPreset(constructed, { players: 2 }, 4).players).toBe(2);
    expect(draftForPreset(constructed, undefined).players).toBe(2);
  });

  it("sets or omits record keys", () => {
    expect(setOrOmit({ a: 1, b: 2 }, "a", 5, 5)).toEqual({ b: 2 });
    expect(setOrOmit({ b: 2 }, "a", 3, 5)).toEqual({ b: 2, a: 3 });
  });
});
