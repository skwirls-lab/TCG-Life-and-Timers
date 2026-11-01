// @req CUS-001 @req CUS-005 @req CUS-006 @req CUS-007 @req PRE-002
import { Dexie } from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultTimerConfig, type CounterDefinition, type Preset } from "@/engine";
import { TcgDb } from "@/lib/db";
import { BUILT_IN_PRESETS, getBuiltInPreset, listBuiltInPresets } from "@/presets";
import {
  CUSTOM_PRESET_PREFIX,
  CUSTOM_PRESET_SCHEMA_VERSION,
  PRESET_EXPORT_FORMAT,
  PresetValidationError,
  copyPreset,
  countCustomPresets,
  deleteCustomPreset,
  deriveCapabilities,
  duplicateBuiltIn,
  duplicateCustomPreset,
  exportPreset,
  exportPresetBlob,
  getAnyPreset,
  getCustomPreset,
  importAndSave,
  importPresetJson,
  isCustomPresetId,
  listAllPresets,
  listCustomPresets,
  newCustomPresetId,
  presetFileName,
  saveCustomPreset,
  toCustom,
  validateCustomPreset,
} from "./index";

let db: TcgDb;
let n = 0;
beforeEach(() => {
  db = new TcgDb(`custom-presets-${n++}-${Math.random()}`);
});
afterEach(async () => {
  db.close();
  await Dexie.delete(db.name);
});

const counter = (over: Partial<CounterDefinition> = {}): CounterDefinition => ({
  id: "lore",
  name: "Lore",
  icon: "lore",
  kind: "number",
  scope: "player",
  category: "score",
  isPrimary: true,
  start: 0,
  min: 0,
  max: null,
  step: 1,
  holdStep: 5,
  direction: "up",
  threshold: { comparator: ">=", value: 20, outcome: "win", autoApply: "auto" },
  visibility: "board",
  enabledByDefault: true,
  ...over,
});

function loreRace(over: Partial<Preset> = {}): Preset {
  return {
    id: "custom.lore",
    version: 1,
    name: "Lore Race",
    game: "Lorcana-like",
    description: "",
    rulesSummary: "First to 20 lore wins.",
    minPlayers: 2,
    maxPlayers: 4,
    defaultPlayers: 2,
    counters: [
      counter(),
      counter({
        id: "ink",
        name: "Ink",
        icon: "droplet",
        category: "resource",
        isPrimary: false,
        threshold: undefined,
        visibility: "badge",
        resetOnTurnPass: true,
      }),
    ],
    capabilities: [],
    defaults: { timer: defaultTimerConfig(), firstPlayerRule: "random" },
    builtIn: false,
    ...over,
  };
}

describe("ids", () => {
  it("prefixes custom ids", () => {
    const id = newCustomPresetId();
    expect(id.startsWith(CUSTOM_PRESET_PREFIX)).toBe(true);
    expect(isCustomPresetId(id)).toBe(true);
    expect(isCustomPresetId("custom.")).toBe(false);
    expect(isCustomPresetId("mtg.commander")).toBe(false);
  });
});

describe("validation", () => {
  it("accepts a valid preset and derives capabilities", () => {
    const p = toCustom(loreRace());
    expect(p.capabilities).toEqual(["perTurnFlags"]);
    expect(validateCustomPreset(p).ok).toBe(true);
  });

  it("returns readable schema and semantic errors without id prefixes", () => {
    const schema = validateCustomPreset({ ...loreRace(), name: "" });
    expect(schema.ok).toBe(false);
    if (!schema.ok) expect(schema.errors.some((e) => e.startsWith("name:"))).toBe(true);
    const sem = validateCustomPreset(
      loreRace({ counters: [counter(), counter({ id: "two", name: "Two" })] }),
    );
    expect(sem.ok).toBe(false);
    if (!sem.ok) {
      expect(sem.errors).toContain("expected exactly one primary counter, found 2");
      expect(sem.errors.every((e) => !e.startsWith("custom.lore:"))).toBe(true);
    }
    const root = validateCustomPreset(null);
    expect(root.ok).toBe(false);
  });

  it("drops stale derived capabilities and keeps the others", () => {
    const p = loreRace({
      capabilities: ["commanderDamage", "partners", "calculator", "calculator"],
      counters: [counter()],
    });
    expect(deriveCapabilities(p)).toEqual(["calculator"]);
  });

  it("keeps partners when commander damage remains", () => {
    const commander = getBuiltInPreset("mtg.commander")!;
    const caps = deriveCapabilities(commander);
    expect(new Set(caps)).toEqual(new Set(commander.capabilities));
  });
});

describe("CRUD", () => {
  it("saves, lists, gets and deletes custom presets", async () => {
    const saved = await saveCustomPreset(loreRace(), { db, now: 1000 });
    expect(saved.builtIn).toBe(false);
    const row = await db.presets.get(saved.id);
    expect(row).toMatchObject({ schemaVersion: CUSTOM_PRESET_SCHEMA_VERSION, updatedAt: 1000 });
    expect(await getCustomPreset(saved.id, db)).toEqual(saved);
    expect(await countCustomPresets(db)).toBe(1);

    const second = await saveCustomPreset(loreRace({ id: "draft", name: "Second" }), {
      db,
      now: 2000,
    });
    expect(isCustomPresetId(second.id)).toBe(true);
    expect((await listCustomPresets(db)).map((p) => p.name)).toEqual(["Second", "Lore Race"]);

    await deleteCustomPreset(saved.id, db);
    expect(await getCustomPreset(saved.id, db)).toBeUndefined();
    expect(await countCustomPresets(db)).toBe(1);
  });

  it("bumps the version when an existing preset is saved again", async () => {
    const a = await saveCustomPreset(loreRace(), { db });
    const b = await saveCustomPreset({ ...a, name: "Renamed" }, { db });
    expect(b.id).toBe(a.id);
    expect(b.version).toBe(a.version + 1);
  });

  it("rejects invalid presets with readable errors", async () => {
    const bad = loreRace({ counters: [counter({ start: -5, min: 0 })] });
    await expect(saveCustomPreset(bad, { db })).rejects.toBeInstanceOf(PresetValidationError);
    try {
      await saveCustomPreset(bad, { db });
    } catch (e) {
      expect((e as PresetValidationError).errors).toContain(
        "counter lore: start outside [min,max]",
      );
    }
    expect(await countCustomPresets(db)).toBe(0);
  });

  it("ignores non-custom ids and corrupt rows", async () => {
    await db.presets.put({ id: "mtg.fake", schemaVersion: 1, preset: loreRace(), updatedAt: 1 });
    await db.presets.put({ id: "custom.broken", schemaVersion: 1, preset: { x: 1 }, updatedAt: 2 });
    expect(await listCustomPresets(db)).toEqual([]);
    expect(await getCustomPreset("mtg.fake", db)).toBeUndefined();
    expect(await getCustomPreset("custom.broken", db)).toBeUndefined();
    await deleteCustomPreset("mtg.fake", db);
    expect(await db.presets.get("mtg.fake")).toBeDefined();
  });
});

describe("duplicate (PRE-002)", () => {
  it("duplicates every built-in into a valid custom preset", async () => {
    for (const p of BUILT_IN_PRESETS) {
      const copy = copyPreset(p);
      expect(copy.id).not.toBe(p.id);
      expect(copy.name).toBe(`${p.name} (copy)`);
      expect(copy.builtIn).toBe(false);
      const r = validateCustomPreset(copy);
      expect(r.ok, `${p.id}: ${r.ok ? "" : r.errors.join(", ")}`).toBe(true);
    }
  });

  it("stores a duplicate and leaves the built-in untouched", async () => {
    const before = structuredClone(getBuiltInPreset("mtg.commander"));
    const copy = await duplicateBuiltIn("mtg.commander", { db });
    expect(copy.name).toBe("Commander (copy)");
    expect(isCustomPresetId(copy.id)).toBe(true);
    copy.counters[0]!.name = "Mutated";
    expect(getBuiltInPreset("mtg.commander")).toEqual(before);
    expect(await getCustomPreset(copy.id, db)).toBeDefined();
    await expect(duplicateBuiltIn("nope", { db })).rejects.toThrow(/Unknown/);
  });

  it("duplicates custom presets", async () => {
    const a = await saveCustomPreset(loreRace(), { db });
    const b = await duplicateCustomPreset(a.id, { db });
    expect(b.id).not.toBe(a.id);
    expect(b.name).toBe("Lore Race (copy)");
    await expect(duplicateCustomPreset("custom.missing", { db })).rejects.toThrow(/Unknown/);
  });
});

describe("merged lookups", () => {
  it("getAnyPreset finds built-ins and custom presets; listAllPresets merges them", async () => {
    const saved = await saveCustomPreset(loreRace(), { db });
    expect((await getAnyPreset("mtg.commander", db))?.builtIn).toBe(true);
    expect((await getAnyPreset(saved.id, db))?.name).toBe("Lore Race");
    expect(await getAnyPreset("custom.none", db)).toBeUndefined();
    const all = await listAllPresets(db);
    expect(all).toHaveLength(listBuiltInPresets().length + 1);
    expect(all.at(-1)?.id).toBe(saved.id);
  });
});

describe("export / import (CUS-007)", () => {
  it("round-trips through JSON with a fresh id", async () => {
    const saved = await saveCustomPreset(loreRace(), { db });
    const json = exportPreset(saved);
    expect(JSON.parse(json).format).toBe(PRESET_EXPORT_FORMAT);
    const r = importPresetJson(json);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.preset.id).not.toBe(saved.id);
    expect(isCustomPresetId(r.preset.id)).toBe(true);
    const { id: _a, ...restA } = r.preset;
    const { id: _b, ...restB } = saved;
    expect(restA).toEqual(restB);
  });

  it("imports a bare built-in preset as a custom copy", () => {
    const r = importPresetJson(JSON.stringify(getBuiltInPreset("mtg.commander")));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.preset.builtIn).toBe(false);
      expect(r.preset.premium).toBeUndefined();
    }
  });

  it("rejects invalid input with readable errors", () => {
    const cases: [string, RegExp][] = [
      ["{oops", /not valid JSON/],
      ["[1,2]", /does not contain a preset/],
      ['"text"', /does not contain a preset/],
      [JSON.stringify({ format: "other", version: 1, preset: {} }), /not a TCG Life/],
      [JSON.stringify({ format: PRESET_EXPORT_FORMAT, version: 99, preset: {} }), /newer version/],
      [JSON.stringify({ format: PRESET_EXPORT_FORMAT, version: 1, preset: 5 }), /does not contain/],
      [JSON.stringify({ ...loreRace(), counters: [] }), /counters/],
      [
        JSON.stringify(loreRace({ counters: [counter(), counter({ id: "b", name: "B" })] })),
        /exactly one primary/,
      ],
    ];
    for (const [text, re] of cases) {
      const r = importPresetJson(text);
      expect(r.ok, text).toBe(false);
      if (!r.ok) expect(r.errors.join(" "), text).toMatch(re);
    }
  });

  it("importAndSave stores valid imports only", async () => {
    const ok = await importAndSave(exportPreset(loreRace()), { db });
    expect(ok.ok).toBe(true);
    const bad = await importAndSave("nope", { db });
    expect(bad.ok).toBe(false);
    expect(await countCustomPresets(db)).toBe(1);
  });

  it("builds a blob and a file name", async () => {
    const p = loreRace();
    const blob = exportPresetBlob(p);
    expect(blob.type).toBe("application/json");
    expect(await blob.text()).toBe(exportPreset(p));
    expect(presetFileName(p)).toBe("lore-race.tcg-preset.json");
    expect(presetFileName({ ...p, name: "!!!" })).toBe("preset.tcg-preset.json");
  });
});
