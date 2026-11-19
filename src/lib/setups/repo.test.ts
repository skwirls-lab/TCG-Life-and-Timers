// Saved setups ("Presets") repository on Dexie `setups` (DB v2). Nearest reqs: PROF-010, SET-012.
// @req PROF-010 @req SET-012
import { afterEach, describe, expect, it } from "vitest";
import { TcgDb } from "@/lib/db";
import {
  cleanSetupName,
  countSetups,
  createSetup,
  deleteSetup,
  fromSetupRow,
  getSetup,
  listSetups,
  markSetupUsed,
  moveSetup,
  renameProfilesInSetups,
  renameSetup,
  updateSetup,
} from "./repo";
import { SAVED_SETUP_SCHEMA_VERSION, type SetupDraft } from "./types";

let n = 0;
const open: TcgDb[] = [];
function freshDb(): TcgDb {
  const db = new TcgDb(`setups-test-${Date.now()}-${n++}`);
  open.push(db);
  return db;
}
afterEach(async () => {
  for (const db of open.splice(0)) {
    db.close();
    await db.delete();
  }
});

function sampleDraft(o: Partial<SetupDraft> = {}): SetupDraft {
  return {
    presetId: "mtg.commander",
    presetName: "MTG Commander",
    config: { startOverrides: { "mtg.life": 60 }, timer: { mode: "bank", seatExtraMs: {} } },
    seats: [
      { name: "Ann", color: "#f472b6", commanders: [], profileId: "p1", deckId: "d1" },
      { name: "Ben", color: "#60a5fa", commanders: ["Atraxa"], clockExtraMs: 60_000 },
    ],
    firstPlayerRule: "random",
    commanderArt: true,
    ...o,
  };
}

describe("setups repo", () => {
  it("creates, lists in order, reads and counts", async () => {
    const db = freshDb();
    const a = await createSetup("  Friday   pod ", sampleDraft(), { db, now: 10 });
    const b = await createSetup("Duel", sampleDraft({ seats: sampleDraft().seats.slice(0, 1) }), {
      db,
      now: 20,
    });
    expect(a).toMatchObject({ name: "Friday pod", order: 0, createdAt: 10, updatedAt: 10 });
    expect(b.order).toBe(1);
    expect((await listSetups(db)).map((s) => s.id)).toEqual([a.id, b.id]);
    expect(await getSetup(a.id, db)).toEqual(a);
    expect(await getSetup("nope", db)).toBeUndefined();
    expect(await countSetups(db)).toBe(2);
    const row = await db.setups.get(a.id);
    expect(row?.schemaVersion).toBe(SAVED_SETUP_SCHEMA_VERSION);
  });

  it("rejects empty names and invalid drafts", async () => {
    const db = freshDb();
    await expect(createSetup("   ", sampleDraft(), { db })).rejects.toThrow(/name/);
    await expect(createSetup("x", sampleDraft({ seats: [] }), { db })).rejects.toThrow();
    expect(cleanSetupName("x".repeat(80))).toHaveLength(60);
  });

  it("updates contents keeping id, order, createdAt and lastUsedAt", async () => {
    const db = freshDb();
    const a = await createSetup("Pod", sampleDraft(), { db, now: 10 });
    await markSetupUsed(a.id, { db, now: 15 });
    const u = await updateSetup(a.id, sampleDraft({ firstPlayerRule: "loser" }), { db, now: 30 });
    expect(u).toMatchObject({
      id: a.id,
      name: "Pod",
      order: 0,
      createdAt: 10,
      updatedAt: 30,
      lastUsedAt: 15,
      firstPlayerRule: "loser",
    });
    const renamed = await updateSetup(a.id, sampleDraft(), { db, name: "New pod" });
    expect(renamed.name).toBe("New pod");
    await expect(updateSetup("missing", sampleDraft(), { db })).rejects.toThrow(/Unknown/);
  });

  it("renames, marks used, deletes", async () => {
    const db = freshDb();
    const a = await createSetup("Pod", sampleDraft(), { db, now: 10 });
    expect((await renameSetup(a.id, " Weekly ", { db, now: 11 }))?.name).toBe("Weekly");
    await expect(renameSetup(a.id, "", { db })).rejects.toThrow();
    expect(await renameSetup("missing", "x", { db })).toBeUndefined();
    await markSetupUsed(a.id, { db, now: 12 });
    expect((await getSetup(a.id, db))?.lastUsedAt).toBe(12);
    await deleteSetup(a.id, db);
    expect(await listSetups(db)).toEqual([]);
  });

  it("moves setups up and down (renumbering orders)", async () => {
    const db = freshDb();
    const ids: string[] = [];
    for (const name of ["A", "B", "C"])
      ids.push((await createSetup(name, sampleDraft(), { db, now: 1 })).id);
    let list = await moveSetup(ids[2]!, -1, { db, now: 5 });
    expect(list.map((s) => s.name)).toEqual(["A", "C", "B"]);
    expect(list.map((s) => s.order)).toEqual([0, 1, 2]);
    list = await moveSetup(ids[0]!, -1, { db }); // already first: unchanged
    expect(list.map((s) => s.name)).toEqual(["A", "C", "B"]);
    list = await moveSetup(ids[0]!, 1, { db });
    expect((await listSetups(db)).map((s) => s.name)).toEqual(["C", "A", "B"]);
    expect(await moveSetup("missing", 1, { db })).toHaveLength(3);
  });

  it("skips invalid rows instead of crashing", async () => {
    const db = freshDb();
    await createSetup("Good", sampleDraft(), { db });
    await db.setups.put({ id: "bad", schemaVersion: 1, order: 5, updatedAt: 1, seats: "nope" });
    expect((await listSetups(db)).map((s) => s.name)).toEqual(["Good"]);
    expect(fromSetupRow(undefined)).toBeUndefined();
  });

  it("rewrites merged profile ids on seats", async () => {
    const db = freshDb();
    const a = await createSetup("Pod", sampleDraft(), { db });
    const other = await createSetup("Other", sampleDraft({ seats: [sampleDraft().seats[1]!] }), {
      db,
    });
    await renameProfilesInSetups(new Map([["p1", "cloud-p1"]]), db);
    expect((await getSetup(a.id, db))?.seats[0]!.profileId).toBe("cloud-p1");
    expect((await getSetup(other.id, db))?.seats[0]!.profileId).toBeUndefined();
  });
});
