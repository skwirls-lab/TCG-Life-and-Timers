// @vitest-environment node
import { describe, expect, it } from "vitest";
import { newGame, testPreset, T0 } from "../../tests/unit/helpers/engine";
import { commander } from "@/presets/mtg/presets";
import {
  ArtRefSchema,
  CounterDefinitionSchema,
  EliminationCauseSchema,
  GameActionSchema,
  GameEventSchema,
  GameOptionsSchema,
  GameSchema,
  GAME_SCHEMA_VERSION,
  ICON_IDS,
  NewGameConfigSchema,
  parseGame,
  parsePreset,
  PresetSchema,
  reduce,
  SeatSchema,
  seededRng,
  ThresholdRuleSchema,
  TimerConfigSchema,
  TimerStateSchema,
  defaultGameOptions,
  defaultTimerConfig,
  initialTimerState,
  type CounterDefinition,
} from "./index";

const life: CounterDefinition = commander.counters[0]!;

describe("schemas accept valid fixtures", () => {
  // @req PRE-001 @req CTR-001
  it.each([
    ["commander preset", PresetSchema, commander],
    ["test preset", PresetSchema, testPreset()],
    ["life counter", CounterDefinitionSchema, life],
    [
      "threshold",
      ThresholdRuleSchema,
      { comparator: ">=", value: 21, outcome: "lose", perSource: true },
    ],
    [
      "threshold with autoApply",
      ThresholdRuleSchema,
      { comparator: "<=", value: 0, outcome: "win", autoApply: "prompt" },
    ],
    ["timer config", TimerConfigSchema, defaultTimerConfig()],
    [
      "timer config with match",
      TimerConfigSchema,
      defaultTimerConfig({ match: { totalMs: 3_000_000, extraTurns: 5 } }),
    ],
    [
      "timer state",
      TimerStateSchema,
      initialTimerState(defaultTimerConfig({ match: { totalMs: 1, extraTurns: 0 } }), ["a"]),
    ],
    ["options", GameOptionsSchema, defaultGameOptions()],
    [
      "art",
      ArtRefSchema,
      {
        kind: "scryfall",
        value: "https://x/y.jpg",
        focal: { x: 0.5, y: 0.3, zoom: 1.2 },
        artist: "A",
      },
    ],
    [
      "cause threshold",
      EliminationCauseSchema,
      { kind: "threshold", counterId: "mtg.cmdDamage", sourceSeatId: "a", sourceIndex: 1 },
    ],
    ["cause concede", EliminationCauseSchema, { kind: "concede" }],
    [
      "seat",
      SeatSchema,
      {
        id: "a",
        name: "A",
        commanders: ["X", "Y"],
        color: "#fff",
        eliminated: false,
        contrast: false,
        rotationOverride: 270,
      },
    ],
    [
      "event",
      GameEventSchema,
      {
        id: "e1",
        at: 1,
        kind: "counter",
        counterId: "x",
        delta: -1,
        from: 2,
        to: 1,
        meta: { a: null },
      },
    ],
    ["fresh game", GameSchema, newGame()],
    [
      "new game config",
      NewGameConfigSchema,
      { preset: commander, players: 4, seats: [{ name: "A" }] },
    ],
    [
      "action counter add",
      GameActionSchema,
      { type: "COUNTER_ADD", counterId: "life", seatId: "s1", delta: -1, now: 1 },
    ],
    ["action set option", GameActionSchema, { type: "SET_OPTION", key: "autoKO", value: "prompt" }],
    ["action undo", GameActionSchema, { type: "UNDO" }],
    ["action timer", GameActionSchema, { type: "TIMER_PAUSE", reason: "background", now: 5 }],
  ])("%s", (_name, schema, value) => {
    expect(schema.safeParse(value).success).toBe(true);
  });

  it("a played and ended game round-trips through JSON + GameSchema", () => {
    const rng = seededRng(4);
    let g = newGame();
    g = reduce(g, { type: "START_GAME", now: T0 + 1 }, { rng });
    g = reduce(
      g,
      {
        type: "CMD_DAMAGE_ADD",
        targetSeatId: "s2",
        sourceSeatId: "s3",
        sourceIndex: 0,
        delta: 21,
        now: T0 + 2,
      },
      { rng },
    );
    g = reduce(g, { type: "TOKEN_GIVE", counterId: "monarch", seatId: "s1", now: T0 + 3 }, { rng });
    g = reduce(g, { type: "END_GAME", winners: ["s1"], now: T0 + 4 }, { rng });
    const back = parseGame(JSON.parse(JSON.stringify(g)));
    expect(back).toEqual(g);
    expect(back.schemaVersion).toBe(GAME_SCHEMA_VERSION);
  });

  it("parsePreset returns the preset", () => {
    expect(parsePreset(commander).id).toBe("mtg.commander");
    expect(ICON_IDS.length).toBeGreaterThanOrEqual(40);
  });
});

describe("schemas reject invalid fixtures", () => {
  const bad = (o: Partial<Record<keyof CounterDefinition, unknown>>) => ({ ...life, ...o });
  // @req PRE-001
  it.each([
    ["counter id with pipe", CounterDefinitionSchema, bad({ id: "a|b" })],
    ["empty counter id", CounterDefinitionSchema, bad({ id: "" })],
    ["unknown icon", CounterDefinitionSchema, bad({ icon: "unicorn" })],
    ["unknown kind", CounterDefinitionSchema, bad({ kind: "float" })],
    ["unknown scope", CounterDefinitionSchema, bad({ scope: "team" })],
    ["unknown category", CounterDefinitionSchema, bad({ category: "mana" })],
    ["zero step", CounterDefinitionSchema, bad({ step: 0 })],
    ["bad direction", CounterDefinitionSchema, bad({ direction: "sideways" })],
    ["bad visibility", CounterDefinitionSchema, bad({ visibility: "hidden" })],
    ["empty enumValues", CounterDefinitionSchema, bad({ enumValues: [] })],
    ["three sources", CounterDefinitionSchema, bad({ sourcesPerOpponent: 3 })],
    ["missing enabledByDefault", CounterDefinitionSchema, bad({ enabledByDefault: undefined })],
    ["bad comparator", ThresholdRuleSchema, { comparator: "<", value: 0, outcome: "lose" }],
    ["bad outcome", ThresholdRuleSchema, { comparator: "<=", value: 0, outcome: "draw" }],
    ["timer negative bank", TimerConfigSchema, { ...defaultTimerConfig(), bankMs: -1 }],
    ["timer bad mode", TimerConfigSchema, { ...defaultTimerConfig(), mode: "hourglass" }],
    ["timer bad timeout", TimerConfigSchema, { ...defaultTimerConfig(), timeoutAction: "explode" }],
    ["options bad autoKO", GameOptionsSchema, { ...defaultGameOptions(), autoKO: "yes" }],
    [
      "options missing field",
      GameOptionsSchema,
      { ...defaultGameOptions(), batchWindowMs: undefined },
    ],
    ["preset no counters", PresetSchema, { ...commander, counters: [] }],
    ["preset 9 players", PresetSchema, { ...commander, maxPlayers: 9 }],
    ["preset bad url", PresetSchema, { ...commander, rulesUrl: "not a url" }],
    ["preset bad capability", PresetSchema, { ...commander, capabilities: ["flying"] }],
    ["preset bad deferred", PresetSchema, { ...commander, deferred: "P3" }],
    ["preset version 0", PresetSchema, { ...commander, version: 0 }],
    ["art bad kind", ArtRefSchema, { kind: "video", value: "x" }],
    ["cause unknown kind", EliminationCauseSchema, { kind: "meteor" }],
    ["cause threshold without counter", EliminationCauseSchema, { kind: "threshold" }],
    [
      "seat three commanders",
      SeatSchema,
      {
        id: "a",
        name: "A",
        commanders: ["x", "y", "z"],
        color: "#fff",
        eliminated: false,
        contrast: false,
      },
    ],
    [
      "seat bad rotation",
      SeatSchema,
      {
        id: "a",
        name: "A",
        commanders: [],
        color: "#fff",
        eliminated: false,
        contrast: false,
        rotationOverride: 45,
      },
    ],
    ["event bad kind", GameEventSchema, { id: "e1", at: 1, kind: "explosion" }],
    [
      "event object meta",
      GameEventSchema,
      { id: "e1", at: 1, kind: "note", meta: { a: { b: 1 } } },
    ],
    ["game with no seats", GameSchema, { ...newGame(), seats: [] }],
    ["game turn 0", GameSchema, { ...newGame(), turn: { ...newGame().turn, turnNumber: 0 } }],
    ["game bad status", GameSchema, { ...newGame(), status: "lost" }],
    ["game string value", GameSchema, { ...newGame(), values: { "life|s1||": "20" } }],
    ["config 0 players", NewGameConfigSchema, { preset: commander, players: 0 }],
    ["action unknown type", GameActionSchema, { type: "FLY", now: 1 }],
    [
      "action missing now",
      GameActionSchema,
      { type: "COUNTER_ADD", counterId: "life", seatId: "s1", delta: 1 },
    ],
    [
      "action option wrong value type",
      GameActionSchema,
      { type: "SET_OPTION", key: "autoRevive", value: "yes" },
    ],
  ])("%s", (_name, schema, value) => {
    expect(schema.safeParse(value).success).toBe(false);
  });

  it("parseGame throws on corrupt data", () => {
    expect(() => parseGame({ id: "x" })).toThrow();
  });
});
