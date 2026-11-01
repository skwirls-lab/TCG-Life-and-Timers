// @req PROF-001 @req PROF-002 @req PROF-010 @req PROF-011
import { afterEach, describe, expect, it } from "vitest";
import { TcgDb } from "@/lib/db";
import {
  cleanName,
  deleteDeck,
  deleteProfile,
  dismissProfileSuggestion,
  findProfilesByName,
  getDeck,
  getProfile,
  listDecks,
  listProfiles,
  listRecent,
  markUsed,
  nameUseCount,
  recordNameUse,
  saveDeck,
  saveProfile,
  shouldSuggestProfile,
} from "./repo";
import { PROFILE_SCHEMA_VERSION } from "./types";

let n = 0;
const open: TcgDb[] = [];
function freshDb(): TcgDb {
  const db = new TcgDb(`profiles-test-${Date.now()}-${n++}`);
  open.push(db);
  return db;
}

afterEach(async () => {
  for (const db of open.splice(0)) {
    db.close();
    await db.delete();
  }
});

describe("profiles", () => {
  // @req PROF-001
  it("creates, reads, updates and lists profiles with normalized names", async () => {
    const db = freshDb();
    const p = await saveProfile(
      { name: "  Declan   O ", color: "#f472b6", contrast: true },
      db,
      1000,
    );
    expect(p.name).toBe("Declan O");
    expect(p.updatedAt).toBe(1000);
    const row = await db.profiles.get(p.id);
    expect(row?.normalizedName).toBe("declan o");
    expect(row?.schemaVersion).toBe(PROFILE_SCHEMA_VERSION);
    expect(await getProfile(p.id, db)).toEqual(p);
    expect(await getProfile("missing", db)).toBeUndefined();

    const updated = await saveProfile({ ...p, name: "Declan" }, db, 2000);
    expect(updated.id).toBe(p.id);
    expect((await listProfiles(db)).map((x) => x.name)).toEqual(["Declan"]);
    expect((await findProfilesByName("DECLAN ", db)).map((x) => x.id)).toEqual([p.id]);
  });

  it("rejects empty names and caps names at 40 chars", async () => {
    const db = freshDb();
    await expect(
      saveProfile({ name: "   ", color: "#fff", contrast: false }, db),
    ).rejects.toThrow();
    expect(cleanName("x".repeat(50))).toHaveLength(40);
  });

  it("fills defaults for malformed stored rows", async () => {
    const db = freshDb();
    await db.profiles.put({ id: "raw", schemaVersion: 1, name: "Raw", normalizedName: "raw" });
    const p = await getProfile("raw", db);
    expect(p?.contrast).toBe(false);
    expect(typeof p?.color).toBe("string");
  });

  // @req PROF-002
  it("lists recently used profiles first", async () => {
    const db = freshDb();
    const a = await saveProfile({ name: "Alice", color: "#111", contrast: false }, db);
    const b = await saveProfile({ name: "Bob", color: "#222", contrast: false }, db);
    const c = await saveProfile({ name: "Cara", color: "#333", contrast: false }, db);
    await markUsed(c.id, undefined, db, 100);
    await markUsed(b.id, undefined, db, 200);
    expect((await listRecent(db)).map((p) => p.id)).toEqual([b.id, c.id, a.id]);
  });

  it("deleting a profile deletes its decks", async () => {
    const db = freshDb();
    const p = await saveProfile({ name: "JP", color: "#111", contrast: false }, db);
    const d = await saveDeck({ profileId: p.id, name: "Toxrill" }, db);
    await deleteProfile(p.id, db);
    expect(await getProfile(p.id, db)).toBeUndefined();
    expect(await getDeck(d.id, db)).toBeUndefined();
  });
});

describe("decks", () => {
  // @req PROF-010
  it("creates decks with commanders (max 2) and filters by preset", async () => {
    const db = freshDb();
    const p = await saveProfile({ name: "JP", color: "#111", contrast: false }, db);
    const d1 = await saveDeck(
      {
        profileId: p.id,
        name: "Toxrill",
        presetId: "mtg.commander",
        commanders: [" Toxrill, the Corrosive ", "", "x", "y"],
      },
      db,
      10,
    );
    expect(d1.commanders).toEqual(["Toxrill, the Corrosive", "x"]);
    const d2 = await saveDeck({ profileId: p.id, name: "Burn", presetId: "mtg.constructed" }, db);
    const d3 = await saveDeck({ profileId: p.id, name: "Any" }, db);
    expect(d2.commanders).toEqual([]);
    expect((await listDecks(p.id, "mtg.commander", db)).map((d) => d.id).sort()).toEqual(
      [d1.id, d3.id].sort(),
    );
    expect(await listDecks(p.id, undefined, db)).toHaveLength(3);

    await markUsed(p.id, d2.id, db, 500);
    expect((await listDecks(p.id, undefined, db))[0]?.id).toBe(d2.id);
    expect((await getProfile(p.id, db))?.lastUsedAt).toBe(500);

    await deleteDeck(d2.id, db);
    expect(await listDecks(p.id, undefined, db)).toHaveLength(2);
  });

  it("rejects decks without a name or an existing profile", async () => {
    const db = freshDb();
    await expect(saveDeck({ profileId: "nope", name: "X" }, db)).rejects.toThrow();
    const p = await saveProfile({ name: "JP", color: "#111", contrast: false }, db);
    await expect(saveDeck({ profileId: p.id, name: " " }, db)).rejects.toThrow();
  });

  it("normalizes malformed stored deck rows", async () => {
    const db = freshDb();
    await db.decks.put({ id: "d", schemaVersion: 1, profileId: "p", name: "D" });
    expect((await getDeck("d", db))?.commanders).toEqual([]);
  });
});

describe("PROF-011 name-only suggestion", () => {
  // @req PROF-011
  it("suggests after the name was used in 2 distinct games without a profile", async () => {
    const db = freshDb();
    expect(await recordNameUse("Declan", "g1", db)).toBe(1);
    expect(await recordNameUse(" declan ", "g1", db)).toBe(1);
    expect(await shouldSuggestProfile("Declan", db)).toBe(false);
    expect(await recordNameUse("DECLAN", "g2", db)).toBe(2);
    expect(await nameUseCount("Declan", db)).toBe(2);
    expect(await shouldSuggestProfile("Declan", db)).toBe(true);

    await saveProfile({ name: "Declan", color: "#111", contrast: false }, db);
    expect(await shouldSuggestProfile("declan", db)).toBe(false);
  });

  it("respects dismissal and ignores empty names", async () => {
    const db = freshDb();
    await recordNameUse("Sam", "g1", db);
    await recordNameUse("Sam", "g2", db);
    await dismissProfileSuggestion("Sam", db);
    expect(await shouldSuggestProfile("Sam", db)).toBe(false);
    expect(await recordNameUse("  ", "g1", db)).toBe(0);
    expect(await nameUseCount("", db)).toBe(0);
    expect(await shouldSuggestProfile("", db)).toBe(false);
    await dismissProfileSuggestion("", db);
  });

  it("keeps a capped list of game ids and tolerates corrupt kv rows", async () => {
    const db = freshDb();
    for (let i = 0; i < 25; i++) await recordNameUse("Pat", `g${i}`, db);
    expect(await nameUseCount("Pat", db)).toBe(20);
    await db.kv.put({ key: "nameUse:lee", value: "garbage" });
    expect(await nameUseCount("Lee", db)).toBe(0);
  });
});
