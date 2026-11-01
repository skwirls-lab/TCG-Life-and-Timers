// @req SYNC-002 @req PROF-003 @req SET-014
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TcgDb } from "@/lib/db";
import { dexieKv, localAdapters, settingsAdapter } from "./dexieLocal";

let db: TcgDb;
let n = 0;
beforeEach(async () => {
  db = new TcgDb(`sync-local-${++n}`);
  await db.open();
});
afterEach(async () => {
  db.close();
  await db.delete();
});

const until = async (cond: () => boolean) => {
  for (let i = 0; i < 100 && !cond(); i++) await new Promise((r) => setTimeout(r, 5));
};

describe("Dexie local adapters", () => {
  it("lists syncable rows, applies upserts/deletes and reports changes", async () => {
    await db.profiles.put({
      id: "p1",
      schemaVersion: 1,
      name: "A",
      normalizedName: "a",
      color: "#fff",
      contrast: false,
      updatedAt: 1,
    });
    await db.profiles.put({
      id: "bad",
      schemaVersion: 1,
      name: "",
      normalizedName: "",
      color: "#fff",
      contrast: false,
      updatedAt: 1,
    });
    const logs: string[] = [];
    const a = localAdapters.profiles(db, (m) => logs.push(m));
    expect((await a.list()).map((i) => i.id)).toEqual(["p1"]);
    expect(logs).toHaveLength(1);

    let changes = 0;
    const unsub = a.subscribe(() => changes++);
    await until(() => changes > 0);
    const before = changes;
    await a.apply({
      id: "p2",
      updatedAt: 5,
      deleted: false,
      data: { name: "B", normalizedName: "b", color: "#000", contrast: true },
    });
    expect(await db.profiles.get("p2")).toMatchObject({
      name: "B",
      schemaVersion: 1,
      updatedAt: 5,
    });
    await until(() => changes > before);
    expect(changes).toBeGreaterThan(before);
    await a.apply({ id: "p1", updatedAt: 6, deleted: true, data: {} });
    expect(await db.profiles.get("p1")).toBeUndefined();
    unsub();
  });

  it("covers decks, presets, records and art tables", async () => {
    await localAdapters.decks(db).apply({
      id: "d1",
      parent: "p1",
      updatedAt: 1,
      deleted: false,
      data: { name: "D", presetId: "_none", commanders: [], colorIdentity: [] },
    });
    expect(await db.decks.get("d1")).toMatchObject({ profileId: "p1", name: "D" });
    await localAdapters.presets(db).apply({
      id: "c1",
      updatedAt: 1,
      deleted: false,
      data: { name: "P", game: "G", payload: '{"name":"P"}', schemaVersion: 1 },
    });
    expect((await db.presets.get("c1"))?.preset).toEqual({ name: "P" });
    expect(await localAdapters.records(db).list()).toEqual([]);
    expect(await localAdapters.art(db).list()).toEqual([]);
  });

  it("settings adapter merges remote settings and the me profile", async () => {
    await db.settings.put({ key: "app", value: { theme: "dark", haptics: false }, updatedAt: 3 });
    await db.settings.put({ key: "presetDefaults:old", value: { players: 3 }, updatedAt: 4 });
    await db.profiles.put({
      id: "p1",
      schemaVersion: 1,
      name: "A",
      normalizedName: "a",
      color: "#fff",
      contrast: false,
      updatedAt: 1,
      isMe: true,
    });
    await db.profiles.put({
      id: "p2",
      schemaVersion: 1,
      name: "B",
      normalizedName: "",
      color: "#fff",
      contrast: false,
      updatedAt: 1,
    });
    let applied = 0;
    const s = settingsAdapter(db, { onApplied: () => applied++ });
    expect(await s.list()).toEqual([
      {
        id: "user",
        updatedAt: 4,
        deleted: false,
        data: {
          settings: { app: { theme: "dark" }, "presetDefaults:old": { players: 3 } },
          meProfileId: "p1",
        },
      },
    ]);
    await s.apply({
      id: "user",
      updatedAt: 9,
      deleted: false,
      data: {
        settings: { app: { theme: "light" }, "presetDefaults:new": { players: 2 } },
        meProfileId: "p2",
      },
    });
    expect((await db.settings.get("app"))?.value).toEqual({ theme: "light", haptics: false });
    expect(await db.settings.get("presetDefaults:old")).toBeUndefined();
    expect((await db.settings.get("presetDefaults:new"))?.value).toEqual({ players: 2 });
    expect((await db.profiles.get("p1"))?.isMe).toBeUndefined();
    expect(await db.profiles.get("p2")).toMatchObject({ isMe: true, normalizedName: "b" });
    expect(applied).toBe(1);
    await s.apply({ id: "user", updatedAt: 10, deleted: true, data: {} });
    expect(applied).toBe(1);
    let changes = 0;
    const unsub = s.subscribe(() => changes++);
    await until(() => changes > 0);
    unsub();
  });

  it("kv store reads, writes and deletes", async () => {
    const kv = dexieKv(db);
    expect(await kv.get("x")).toBeUndefined();
    await kv.set("x", { a: 1 });
    expect(await kv.get("x")).toEqual({ a: 1 });
    await kv.delete("x");
    expect(await kv.get("x")).toBeUndefined();
  });
});
