// @vitest-environment node
/** Engine-level play-through of every built-in preset (PRE-010/011) and the per-game rules. */
import { describe, expect, it } from "vitest";
import {
  counterValue,
  createGame,
  globalValue,
  primaryCounter,
  reduce,
  seededRng,
  type Game,
  type GameAction,
  type Preset,
} from "@/engine";
import { BUILT_IN_PRESETS, getBuiltInPreset, listBuiltInPresets, perSeatChips } from "./index";
import { hasUnverifiedValues, presetVerifyItems, rulesToVerifyMarkdown } from "./verify";
import { PKM, pokemon } from "./pokemon/presets";
import { YGO, yugioh } from "./yugioh/presets";
import { FFTCG } from "./fftcg/presets";
import { DIGIMON } from "./digimon/presets";
import { FAB } from "./fab/presets";
import { SORCERY } from "./sorcery/presets";
import { SWU } from "./swu/presets";
import { OP } from "./onepiece/presets";

const rng = seededRng(3);
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type In = DistributiveOmit<GameAction, "now">;

function play(
  preset: Preset,
  actions: In[],
  config: Partial<Parameters<typeof createGame>[0]> = {},
) {
  let g: Game = createGame({ preset, players: 2, firstSeatId: "s1", ...config }, rng, 0);
  g = reduce(g, { type: "START_GAME", now: 1 }, { rng });
  let now = 10;
  for (const a of actions) {
    now += 5000;
    g = reduce(g, { ...a, now } as GameAction, { rng });
  }
  return g;
}

describe("every visible preset can be played to its threshold", () => {
  // @req PRE-010 @req PRE-011
  it.each(listBuiltInPresets().map((p) => [p.id, p] as const))("%s", (_id, p) => {
    const primary = primaryCounter(p);
    const rule = primary.threshold!;
    expect(rule).toBeDefined();
    const g = play(p, [
      { type: "COUNTER_SET", counterId: primary.id, seatId: "s1", value: rule.value },
    ]);
    expect(g.status).toBe("ended");
    expect(g.result?.winners).toEqual(rule.outcome === "win" ? ["s1"] : ["s2"]);
  });
});

describe("Pokémon", () => {
  // @req PRE-010
  it("taking six prizes wins; active damage steps by 10 and resets", () => {
    const take: In = { type: "COUNTER_ADD", counterId: PKM.prizes, seatId: "s1", delta: -1 };
    const g = play(pokemon, [take, take, take, take, take]);
    expect(counterValue(g, PKM.prizes, "s1")).toBe(1);
    expect(g.status).toBe("running");
    const won = reduce(g, { ...take, now: 99_999 } as GameAction, { rng });
    expect(won.result).toMatchObject({ winners: ["s1"], reason: "winThreshold" });

    const dmg = pokemon.counters.find((c) => c.id === PKM.activeDamage)!;
    expect([dmg.step, dmg.holdStep, dmg.category]).toEqual([10, 50, "damage"]);
    const hit: In = { type: "COUNTER_ADD", counterId: PKM.activeDamage, seatId: "s2", delta: 10 };
    const d = play(pokemon, [hit, hit, hit]);
    expect(counterValue(d, PKM.activeDamage, "s2")).toBe(30);
    const ko = reduce(
      d,
      { type: "COUNTER_SET", counterId: PKM.activeDamage, seatId: "s2", value: 0, now: 1e6 },
      { rng },
    );
    expect(counterValue(ko, PKM.activeDamage, "s2")).toBe(0);
  });

  it("bench damage is optional (5 slots, disabled by default)", () => {
    const bench = pokemon.counters.filter((c) => c.id.startsWith("pkm.bench"));
    expect(bench).toHaveLength(5);
    expect(bench.every((c) => !c.enabledByDefault && c.visibility === "panel")).toBe(true);
  });

  it("Asleep / Confused / Paralyzed are exclusive; Burned and Poisoned stack", () => {
    const on = (counterId: string): In => ({
      type: "BOOL_TOGGLE",
      counterId,
      seatId: "s1",
      value: true,
    });
    const g = play(pokemon, [on(PKM.asleep), on(PKM.burned), on(PKM.poisoned), on(PKM.confused)]);
    const v = (id: string) => counterValue(g, id, "s1");
    expect([
      v(PKM.asleep),
      v(PKM.confused),
      v(PKM.paralyzed),
      v(PKM.burned),
      v(PKM.poisoned),
    ]).toEqual([0, 1, 0, 1, 1]);
  });

  // @req CUS-008
  it("per-turn flags reset when the turn passes; VSTAR stays used", () => {
    const g = play(pokemon, [
      { type: "BOOL_TOGGLE", counterId: PKM.supporter, seatId: "s1" },
      { type: "BOOL_TOGGLE", counterId: PKM.energy, seatId: "s1" },
      { type: "BOOL_TOGGLE", counterId: PKM.retreated, seatId: "s1" },
      { type: "BOOL_TOGGLE", counterId: PKM.stadium, seatId: "s1" },
      { type: "BOOL_TOGGLE", counterId: PKM.vstar, seatId: "s1" },
      { type: "PASS_TURN" },
    ]);
    for (const id of [PKM.supporter, PKM.energy, PKM.retreated, PKM.stadium])
      expect(counterValue(g, id, "s1")).toBe(0);
    expect(counterValue(g, PKM.vstar, "s1")).toBe(1);
    expect(g.options.turnTracking).toBe(true);
  });

  it("declares the coin-flip, per-turn and first-turn capabilities and the match timer", () => {
    expect(pokemon.capabilities).toEqual([
      "coinFlipProminent",
      "perTurnFlags",
      "firstTurnReminder",
    ]);
    expect(pokemon.quickStartValues).toEqual([4, 6]);
    expect(pokemon.defaults.timer.match).toEqual({ totalMs: 50 * 60_000, extraTurns: 3 });
    expect(getBuiltInPreset("pokemon.pocket")).toMatchObject({ hidden: true, deferred: "P2" });
  });
});

describe("Yu-Gi-Oh!", () => {
  // @req TOOL-006 @req INP-007
  it("8000 LP, step 100, hold 1000, calculator on by default", () => {
    const lp = yugioh.counters.find((c) => c.id === YGO.lp)!;
    expect([lp.start, lp.step, lp.holdStep, lp.min]).toEqual([8000, 100, 1000, 0]);
    expect(yugioh.capabilities).toContain("calculator");
    expect(yugioh.quickStartValues).toEqual([4000, 8000]);
    expect(createGame({ preset: yugioh }, rng, 0).options.tapForCalculator).toBe(true);
    expect(yugioh.defaults.timer.match?.totalMs).toBe(40 * 60_000);
    expect(getBuiltInPreset("ygo.speed")!.counters[0]).toMatchObject({ start: 4000, verify: true });
    expect(getBuiltInPreset("ygo.rush")!.counters[0]).toMatchObject({ start: 8000 });
    expect(getBuiltInPreset("ygo.rush")!.game).not.toBe(yugioh.game);
  });
});

describe("other games", () => {
  it("FFTCG damage uses pips and loses at 7 (verify)", () => {
    const d = getBuiltInPreset("fftcg.standard")!.counters.find((c) => c.id === FFTCG.damage)!;
    expect(d).toMatchObject({ display: "pips", max: 7, verify: true, direction: "up" });
  });

  it("Digimon memory is one global counter clamped to −10..+10", () => {
    const p = getBuiltInPreset("digimon.standard")!;
    const def = p.counters.find((c) => c.id === DIGIMON.memory)!;
    expect(def).toMatchObject({ scope: "global", display: "track", min: -10, max: 10 });
    const g = play(p, [{ type: "COUNTER_ADD", counterId: DIGIMON.memory, delta: 25 }]);
    expect(globalValue(g, DIGIMON.memory)).toBe(10);
    const h = reduce(
      g,
      { type: "COUNTER_ADD", counterId: DIGIMON.memory, delta: -40, now: 1e6 },
      { rng },
    );
    expect(globalValue(h, DIGIMON.memory)).toBe(-10);
  });

  // @req CUS-008
  it("Flesh and Blood action points go back to 1 and resources clear on pass", () => {
    const p = getBuiltInPreset("fab.standard")!;
    const g = play(p, [
      { type: "COUNTER_ADD", counterId: FAB.ap, seatId: "s1", delta: -1 },
      { type: "COUNTER_ADD", counterId: FAB.resources, seatId: "s1", delta: 3 },
      { type: "PASS_TURN" },
    ]);
    expect(counterValue(g, FAB.ap, "s1")).toBe(1);
    expect(counterValue(g, FAB.resources, "s1")).toBe(0);
  });

  // @req PRE-013
  it("per-seat start (FaB hero life / One Piece leader life) and SWU per-seat base HP", () => {
    const fab = play(getBuiltInPreset("fab.standard")!, [], {
      perSeatStart: { s2: { [FAB.life]: 20 } },
    });
    expect([counterValue(fab, FAB.life, "s1"), counterValue(fab, FAB.life, "s2")]).toEqual([
      40, 20,
    ]);
    const swu = getBuiltInPreset("swu.premier")!;
    const g = play(
      swu,
      [{ type: "COUNTER_SET", counterId: SWU.baseDamage, seatId: "s2", value: 25 }],
      {
        perSeatThreshold: { s2: { [SWU.baseDamage]: 25 } },
      },
    );
    expect(g.result?.winners).toEqual(["s1"]);
    const h = play(
      swu,
      [{ type: "COUNTER_SET", counterId: SWU.baseDamage, seatId: "s1", value: 25 }],
      {
        perSeatThreshold: { s2: { [SWU.baseDamage]: 25 } },
      },
    );
    expect(h.status).toBe("running");
    expect(swu.capabilities).toEqual(["initiative"]);
    expect(perSeatChips(swu)).toEqual({ counterId: SWU.baseDamage, threshold: [25, 28, 30] });
    expect(perSeatChips(getBuiltInPreset("onepiece.standard")!)).toEqual({
      counterId: OP.life,
      start: [4, 5],
    });
    expect(perSeatChips(yugioh)).toBeUndefined();
  });

  it("Sorcery: 0 life is Death's Door, the next damage loses", () => {
    const p = getBuiltInPreset("sorcery.standard")!;
    const atDoor = play(p, [
      { type: "COUNTER_SET", counterId: SORCERY.life, seatId: "s1", value: 0 },
      { type: "BOOL_TOGGLE", counterId: SORCERY.deathsDoor, seatId: "s1" },
    ]);
    expect(atDoor.status).toBe("running");
    expect(counterValue(atDoor, SORCERY.deathsDoor, "s1")).toBe(1);
    const blow = reduce(
      atDoor,
      { type: "COUNTER_ADD", counterId: SORCERY.life, seatId: "s1", delta: -5, now: 1e6 },
      { rng },
    );
    expect(counterValue(blow, SORCERY.life, "s1")).toBe(-1);
    expect(blow.result?.winners).toEqual(["s2"]);
  });

  it("One Piece DON!! is capped at 10 and not reset on pass", () => {
    const p = getBuiltInPreset("onepiece.standard")!;
    const g = play(p, [
      { type: "COUNTER_ADD", counterId: OP.don, seatId: "s1", delta: 12 },
      { type: "PASS_TURN" },
    ]);
    expect(counterValue(g, OP.don, "s1")).toBe(10);
  });
});

describe("rules to verify", () => {
  // @req PRE-012
  it("lists every verify counter with a specific check, plus timer checks", () => {
    for (const p of BUILT_IN_PRESETS) {
      for (const item of presetVerifyItems(p)) {
        expect(item.check).not.toMatch(/^Confirm this value/);
        expect(item.value.length).toBeGreaterThan(0);
      }
    }
    expect(hasUnverifiedValues(getBuiltInPreset("generic.life")!)).toBe(false);
    expect(hasUnverifiedValues(pokemon)).toBe(true);
    expect(presetVerifyItems(pokemon).map((i) => i.target)).toEqual([
      "Match timer",
      "First-turn reminder",
    ]);
    const fft = presetVerifyItems(getBuiltInPreset("fftcg.standard")!)[0]!;
    expect(fft).toMatchObject({ counterId: FFTCG.damage, value: "start 0, ≥ 7 → lose, max 7" });
  });

  it("falls back to a generic check for unknown verify counters", () => {
    const p = getBuiltInPreset("generic.life")!;
    const custom = { ...p, counters: p.counters.map((c) => ({ ...c, verify: true })) };
    expect(presetVerifyItems(custom).map((i) => i.check)).toEqual([
      "Confirm this value against the official rules.",
      "Confirm this value against the official rules.",
    ]);
  });

  it("renders a markdown table with shared counters merged", () => {
    const md = rulesToVerifyMarkdown(BUILT_IN_PRESETS);
    expect(md).toContain("| Game | Preset(s) |");
    expect(md).toMatch(/Speed \(`mtg\.speed`\)/);
    expect(md.match(/`mtg\.speed`/g)).toHaveLength(1);
    expect(md).toContain("Archenemy (hidden)");
    expect(md).toContain("Yu-Gi-Oh! Trading Card Game (Speed Duel): https://");
    const genericOnly = rulesToVerifyMarkdown([getBuiltInPreset("generic.life")!]);
    expect(genericOnly).toContain("Items: 0");
  });

  it("escapes pipes in table cells and handles presets without a rules link", () => {
    const p = getBuiltInPreset("generic.life")!;
    const custom = {
      ...p,
      counters: p.counters.map((c) => (c.isPrimary ? { ...c, name: "A|B", verify: true } : c)),
    };
    const md = rulesToVerifyMarkdown([custom]);
    expect(md).toContain("A\\|B");
    expect(md).toContain("| — |");
  });
});

describe("per-seat chips", () => {
  // @req PRE-013
  it("fall back to the primary start / threshold value", () => {
    const p = getBuiltInPreset("generic.life")!;
    const custom: Preset = {
      ...p,
      quickStartValues: undefined,
      capabilities: ["perSeatStart"],
      counters: p.counters.map((c) =>
        c.isPrimary ? { ...c, threshold: { ...c.threshold!, perSeatOverride: true } } : c,
      ),
    };
    expect(perSeatChips(custom)).toEqual({
      counterId: "generic.life",
      start: [20],
      threshold: [0],
    });
    expect(
      perSeatChips({ ...p, counters: p.counters.filter((c) => !c.isPrimary) }),
    ).toBeUndefined();
  });
});
