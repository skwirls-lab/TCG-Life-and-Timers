// @vitest-environment node
import { describe, expect, it } from "vitest";
import { BUILT_IN_PRESETS, DEFAULT_PRESET_ID, getBuiltInPreset, listBuiltInPresets } from "./index";
import {
  semanticErrors,
  validateAllBuiltInPresets,
  validatePreset,
  validatePresets,
} from "./validate";
import { commander } from "./mtg/presets";
import {
  createGame,
  primaryCounter,
  seededRng,
  type CounterDefinition,
  type Preset,
} from "@/engine";

const withCounter = (p: Preset, id: string, o: Partial<CounterDefinition>): Preset => ({
  ...p,
  counters: p.counters.map((c) => (c.id === id ? { ...c, ...o } : c)),
});

describe("built-in presets", () => {
  // @req PRE-001
  it("all pass schema and semantic validation", () => {
    const r = validateAllBuiltInPresets();
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.count).toBe(BUILT_IN_PRESETS.length);
  });

  // @req PRE-010 @req PRE-012
  it("registry lists the MTG formats; P2 stubs are hidden", () => {
    expect(getBuiltInPreset(DEFAULT_PRESET_ID)?.name).toBe("Commander");
    expect(getBuiltInPreset("nope")).toBeUndefined();
    expect(listBuiltInPresets().map((p) => p.id)).toEqual([
      "mtg.commander",
      "mtg.constructed",
      "mtg.limited",
      "mtg.brawl",
      "mtg.oathbreaker",
    ]);
    const hidden = listBuiltInPresets({ includeHidden: true }).filter((p) => p.hidden);
    expect(hidden.map((p) => [p.id, p.deferred])).toEqual([
      ["mtg.2hg", "P2"],
      ["mtg.archenemy", "P2"],
    ]);
    for (const p of BUILT_IN_PRESETS) {
      expect(p.rulesSummary.length).toBeGreaterThan(10);
      expect(p.rulesUrl).toMatch(/^https:\/\//);
      expect(p.quickStartValues).toEqual([20, 25, 30, 40, 60]);
    }
  });

  it.each(BUILT_IN_PRESETS.map((p) => [p.id, p] as const))(
    "%s enabled-by-default counters (snapshot)",
    (_id, p) => {
      const game = createGame({ preset: p }, seededRng(1), 0);
      expect({
        primary: primaryCounter(p).id,
        start: primaryCounter(p).start,
        enabled: game.enabledCounters,
        capabilities: p.capabilities,
        players: [p.minPlayers, p.defaultPlayers, p.maxPlayers],
        timer: p.defaults.timer.mode,
      }).toMatchSnapshot();
    },
  );

  // @req CMD-004 @req CMD-005 @req CMD-010 @req TOK-001 @req TOK-003
  it("Commander has the PRD §10.2 rules", () => {
    const byId = Object.fromEntries(commander.counters.map((c) => [c.id, c]));
    expect(byId["mtg.life"]!.start).toBe(40);
    expect(byId["mtg.poison"]!.threshold).toMatchObject({ comparator: ">=", value: 10 });
    expect(byId["mtg.cmdDamage"]!.threshold).toMatchObject({ value: 21, perSource: true });
    expect(byId["mtg.cmdDamage"]!.linkedTo).toEqual({
      counterId: "mtg.life",
      factor: -1,
      optional: true,
    });
    expect(byId["mtg.tax"]).toMatchObject({ perCommander: true, taxMultiplier: 2 });
    expect(byId["mtg.monarch"]!.scope).toBe("token");
    expect(byId["mtg.dayNight"]).toMatchObject({ scope: "global", enumCycleFrom: 1 });
    expect(byId["mtg.speed"]).toMatchObject({ max: 4, verify: true });
    expect(byId["mtg.storm"]).toMatchObject({ scope: "global", resetOnTurnPass: true });
    const brawl = getBuiltInPreset("mtg.brawl")!;
    expect(brawl.counters.some((c) => c.scope === "playerVsOpponent")).toBe(false);
    expect(brawl.counters[0]).toMatchObject({ start: 25, verify: true });
    const oath = getBuiltInPreset("mtg.oathbreaker")!;
    expect(oath.counters.filter((c) => c.category === "tax").map((c) => c.id)).toEqual([
      "mtg.taxOathbreaker",
      "mtg.taxSignature",
    ]);
  });
});

describe("semantic validation catches broken presets", () => {
  const p = commander;
  // @req PRE-001
  it.each([
    ["two primaries", withCounter(p, "mtg.poison", { isPrimary: true }), "exactly one primary"],
    ["no primary", withCounter(p, "mtg.life", { isPrimary: false }), "exactly one primary"],
    [
      "primary not number",
      withCounter(p, "mtg.life", { kind: "boolean", start: 0, threshold: undefined }),
      "primary must be",
    ],
    [
      "primary disabled",
      withCounter(p, "mtg.life", { enabledByDefault: false }),
      "enabled by default",
    ],
    [
      "quick start out of range",
      { ...withCounter(p, "mtg.life", { min: 0, max: 50 }) },
      "quickStartValue 60",
    ],
    ["duplicate id", { ...p, counters: [...p.counters, p.counters[1]!] }, "duplicate counter id"],
    ["start outside", withCounter(p, "mtg.speed", { start: 9 }), "start outside"],
    ["min > max", withCounter(p, "mtg.speed", { min: 5 }), "min > max"],
    ["unreachable", withCounter(p, "mtg.poison", { max: 5 }), "unreachable"],
    ["met at start", withCounter(p, "mtg.poison", { start: 10 }), "already met"],
    ["unreachable <=", withCounter(p, "mtg.life", { min: 1 }), "unreachable"],
    ["defaultPlayers", { ...p, defaultPlayers: 9 }, "defaultPlayers"],
    [
      "min > max players",
      { ...p, minPlayers: 5, maxPlayers: 4, defaultPlayers: 4 },
      "minPlayers > maxPlayers",
    ],
    ["token mismatch", withCounter(p, "mtg.monarch", { scope: "player" }), "token kind and scope"],
    [
      "enum without values",
      withCounter(p, "mtg.dayNight", { enumValues: undefined }),
      "enum without enumValues",
    ],
    ["enum start", withCounter(p, "mtg.dayNight", { start: 3 }), "enum start out of range"],
    ["enum cycle", withCounter(p, "mtg.dayNight", { enumCycleFrom: 3 }), "enumCycleFrom"],
    ["enumValues on number", withCounter(p, "mtg.energy", { enumValues: ["a"] }), "non-enum"],
    ["boolean start", withCounter(p, "mtg.citysBlessing", { start: 2, max: 2 }), "boolean start"],
    [
      "threshold on enum",
      withCounter(p, "mtg.dayNight", { threshold: { comparator: ">=", value: 2, outcome: "win" } }),
      "thresholds need",
    ],
    [
      "perSource on player",
      withCounter(p, "mtg.poison", {
        threshold: { comparator: ">=", value: 10, outcome: "lose", perSource: true },
      }),
      "perSource",
    ],
    ["perCommander global", withCounter(p, "mtg.storm", { perCommander: true }), "perCommander"],
    [
      "exclusiveGroup number",
      withCounter(p, "mtg.energy", { exclusiveGroup: "g" }),
      "exclusiveGroup",
    ],
    [
      "link unknown",
      withCounter(p, "mtg.cmdDamage", { linkedTo: { counterId: "x", factor: -1, optional: true } }),
      "linkedTo unknown",
    ],
    [
      "link to token",
      withCounter(p, "mtg.cmdDamage", {
        linkedTo: { counterId: "mtg.monarch", factor: -1, optional: true },
      }),
      "linkedTo target",
    ],
    ["reset token", withCounter(p, "mtg.monarch", { resetOnTurnPass: true }), "resetOnTurnPass"],
    [
      "capability missing counter",
      {
        ...p,
        capabilities: [...p.capabilities, "calculator" as const],
        counters: p.counters.filter((c) => c.id !== "mtg.monarch"),
      },
      "capability monarch has no",
    ],
    [
      "counter missing capability",
      { ...p, capabilities: p.capabilities.filter((c) => c !== "commanderDamage") },
      "capability commanderDamage missing",
    ],
    [
      "partners without sources",
      {
        ...p,
        counters: p.counters.filter((c) => c.id !== "mtg.cmdDamage" && c.id !== "mtg.tax"),
        capabilities: p.capabilities.filter((c) => c !== "commanderDamage" && c !== "commanderTax"),
      },
      "partners needs",
    ],
    [
      "duplicate capability",
      { ...p, capabilities: [...p.capabilities, "partners" as const] },
      "duplicate capabilities",
    ],
  ])("%s", (_name, preset, msg) => {
    const errs = semanticErrors(preset as Preset);
    expect(errs.join("\n")).toContain(msg);
  });

  it("quickStartValues without a primary is reported", () => {
    const errs = semanticErrors(withCounter(p, "mtg.life", { isPrimary: false }));
    expect(errs.join("\n")).toContain("quickStartValues without a primary");
  });

  it("validatePreset reports schema errors with the preset id; validatePresets catches duplicates", () => {
    const r = validatePreset({ ...p, version: 0 });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/^mtg\.commander: version/);
    expect(validatePreset(null).errors[0]).toMatch(/^\(unknown\)/);
    const dup = validatePresets([p, p]);
    expect(dup.errors).toContain("duplicate preset id mtg.commander");
    expect(validatePresets([{ nope: 1 }]).ok).toBe(false);
  });
});
