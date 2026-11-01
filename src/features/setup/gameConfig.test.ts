import { afterEach, describe, expect, it } from "vitest";
import { createGame, seededRng } from "@/engine";
import { deleteCustomPreset, duplicateBuiltIn } from "@/lib/customPresets";
import { TcgDb } from "@/lib/db";
import { getBuiltInPreset } from "@/presets";
import {
  LAST_CONFIG_KEY,
  configFromGame,
  fromStoredConfig,
  fromStoredConfigAsync,
  loadLastConfig,
  saveLastConfig,
  seatsFromGame,
  toStoredConfig,
} from "./gameConfig";

const commander = getBuiltInPreset("mtg.commander")!;
let dbs: TcgDb[] = [];
const freshDb = () => {
  const db = new TcgDb(`shell-config-${Math.random()}`);
  dbs.push(db);
  return db;
};

afterEach(async () => {
  for (const db of dbs) await db.delete();
  dbs = [];
});

describe("last game config", () => {
  // @req GAME-001
  it("round-trips a config without the preset snapshot", () => {
    const stored = toStoredConfig({
      id: "x",
      preset: commander,
      players: 3,
      seats: [{ id: "s9", name: "Conner", color: "#fff", commanders: [] }, { name: "JP" }, {}],
      startOverrides: { "mtg.life": 30 },
      firstSeatId: "s9",
    });
    expect(stored).toEqual({
      presetId: "mtg.commander",
      players: 3,
      seats: [{ name: "Conner", color: "#fff" }, { name: "JP" }, {}],
      startOverrides: { "mtg.life": 30 },
    });
    const back = fromStoredConfig(stored)!;
    expect(back.preset).toBe(commander);
    expect(back.players).toBe(3);
    expect(back.startOverrides).toEqual({ "mtg.life": 30 });
  });

  it("rejects invalid rows, unknown presets and out-of-range player counts", () => {
    expect(fromStoredConfig({ nope: 1 })).toBeNull();
    expect(fromStoredConfig({ presetId: "nope" })).toBeNull();
    expect(fromStoredConfig({ presetId: "mtg.limited", players: 4 })).toBeNull();
  });

  // @req GAME-001
  it("persists the last config in the kv table", async () => {
    const db = freshDb();
    expect(await loadLastConfig(db)).toBeNull();
    await saveLastConfig({ preset: commander, players: 4, seats: [{ name: "A" }] }, db);
    expect((await db.kv.get(LAST_CONFIG_KEY))?.value).toMatchObject({ presetId: "mtg.commander" });
    const c = await loadLastConfig(db);
    expect(c?.preset.id).toBe("mtg.commander");
    expect(c?.seats?.[0]?.name).toBe("A");
  });

  // @req GAME-001 @req CUS-001
  it("quick start resolves a custom preset from the same db (async lookup)", async () => {
    const db = freshDb();
    const custom = await duplicateBuiltIn("mtg.commander", { db });
    expect(custom.id.startsWith("custom.")).toBe(true);
    await saveLastConfig(
      {
        preset: custom,
        players: 3,
        seats: [{ name: "A" }],
        perSeatStart: { s2: { "mtg.life": 30 } },
      },
      db,
    );
    const c = await loadLastConfig(db);
    expect(c?.preset.id).toBe(custom.id);
    expect(c?.players).toBe(3);
    expect(c?.perSeatStart).toEqual({ s2: { "mtg.life": 30 } });
    // the sync built-in lookup can't see it
    expect(fromStoredConfig((await db.kv.get(LAST_CONFIG_KEY))!.value)).toBeNull();
    expect(
      await fromStoredConfigAsync({ presetId: "mtg.commander" }, () => Promise.resolve(commander)),
    ).toMatchObject({ players: 4 });
    expect(await fromStoredConfigAsync({ presetId: "x" }, () => Promise.reject(new Error()))).toBe(
      null,
    );
    expect(await fromStoredConfigAsync({ bad: true })).toBeNull();
    // a deleted custom preset → no quick start
    await deleteCustomPreset(custom.id, db);
    expect(await loadLastConfig(db)).toBeNull();
  });

  // @req GAME-010
  it("keeps seats (names, art, colors, commanders) when re-creating from a game", () => {
    const g = createGame(
      {
        preset: commander,
        players: 2,
        seats: [
          { name: "Conner", commanders: ["Atraxa"], art: { kind: "gradient", value: "g1" } },
          { name: "Josh", contrast: true },
        ],
        startOverrides: { "mtg.life": 30 },
      },
      seededRng(2),
      1,
    );
    const seats = seatsFromGame(g);
    expect(seats[0]).toMatchObject({ name: "Conner", commanders: ["Atraxa"], id: g.seats[0]!.id });
    expect(seats[0]!.art).toEqual({ kind: "gradient", value: "g1" });
    expect(seats[1]).toMatchObject({ name: "Josh", contrast: true });
    const cfg = configFromGame(g);
    expect(cfg.players).toBe(2);
    expect(cfg.startOverrides).toEqual({ "mtg.life": 30 });
    const again = createGame(cfg, seededRng(3), 2);
    expect(again.seats.map((s) => s.name)).toEqual(["Conner", "Josh"]);
  });
});
