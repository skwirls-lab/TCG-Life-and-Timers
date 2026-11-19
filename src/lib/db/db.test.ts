// @req ARCH-006 @req REL-001 @req GAME-016
import { afterEach, describe, expect, it } from "vitest";
import { createSession, reduceSession, seededRng, type GameSession } from "@/engine";
import { newGame, T0 } from "../../../tests/unit/helpers/engine";
import {
  ACTIVE_GAME_KEY,
  applyVersions,
  clearActive,
  CORRUPT_BACKUP_PREFIX,
  DB_VERSIONS,
  deleteSetting,
  getDb,
  getSetting,
  loadActive,
  migrateEntity,
  migrateGame,
  MigrationError,
  normalizeName,
  parseStoredGame,
  saveActive,
  setDbForTests,
  setSetting,
  TcgDb,
  type DbVersion,
} from "./index";
import { z } from "zod";
import { Dexie } from "dexie";

let n = 0;
const open: Dexie[] = [];
function freshDb(versions?: readonly DbVersion[]): TcgDb {
  const db = new TcgDb(`test-db-${n++}-${Math.random()}`, versions);
  open.push(db);
  return db;
}

afterEach(async () => {
  for (const db of open.splice(0)) {
    db.close();
    await Dexie.delete(db.name);
  }
  setDbForTests(null);
});

function played(): GameSession {
  const rng = seededRng(3);
  let s = createSession(newGame());
  s = reduceSession(s, { type: "START_GAME", now: T0 + 1 }, { rng });
  s = reduceSession(
    s,
    { type: "COUNTER_ADD", counterId: "life", seatId: "s2", delta: -7, now: T0 + 2 },
    { rng },
  );
  s = reduceSession(
    s,
    {
      type: "CMD_DAMAGE_ADD",
      targetSeatId: "s1",
      sourceSeatId: "s3",
      sourceIndex: 0,
      delta: 4,
      now: T0 + 5000,
    },
    { rng },
  );
  return s;
}

describe("database schema", () => {
  it("creates every table (v1 tables + v2 setups)", async () => {
    const db = freshDb();
    await db.open();
    expect(db.tables.map((t) => t.name).sort()).toEqual(
      [
        "art",
        "decks",
        "games",
        "kv",
        "presets",
        "profiles",
        "records",
        "settings",
        "setups",
      ].sort(),
    );
    expect(db.verno).toBe(2);
  });

  it("upgrades a v1 database to v2 keeping its rows and adding setups", async () => {
    const name = `v1-to-v2-${Math.random()}`;
    const v1 = new TcgDb(name, DB_VERSIONS.slice(0, 1));
    await v1.profiles.put({ id: "p1", schemaVersion: 1, name: "Ann", normalizedName: "ann" });
    v1.close();
    const db = new TcgDb(name);
    open.push(db);
    expect((await db.profiles.get("p1"))?.name).toBe("Ann");
    await db.setups.put({ id: "s1", schemaVersion: 1, order: 0, updatedAt: 1 });
    expect(await db.setups.orderBy("order").primaryKeys()).toEqual(["s1"]);
    expect(db.verno).toBe(2);
  });

  it("getDb returns a shared instance and setDbForTests swaps it", () => {
    const a = getDb();
    expect(getDb()).toBe(a);
    const b = freshDb();
    setDbForTests(b);
    expect(getDb()).toBe(b);
  });

  it("normalizes identity names", () => {
    expect(normalizeName("  Declan   O'Neil ")).toBe("declan o'neil");
  });
});

describe("migrations", () => {
  it("runs a sample Dexie upgrade (next version) that rewrites rows and adds an index", async () => {
    const name = `migrate-${Math.random()}`;
    const v1 = new TcgDb(name);
    await v1.profiles.put({ id: "p1", schemaVersion: 1, name: " Declan ", normalizedName: "" });
    v1.close();
    const v2: DbVersion = {
      version: 3,
      stores: { profiles: "id, normalizedName, createdAt" },
      upgrade: async (tx) => {
        await tx
          .table("profiles")
          .toCollection()
          .modify((p: { name: string; normalizedName: string; createdAt?: number }) => {
            p.normalizedName = normalizeName(p.name);
            p.createdAt = 0;
          });
      },
    };
    const db = new TcgDb(name, [...DB_VERSIONS, v2]);
    open.push(db);
    const p = await db.profiles.get("p1");
    expect(p).toMatchObject({ normalizedName: "declan", createdAt: 0 });
    expect(db.verno).toBe(3);
    expect(await db.profiles.where("createdAt").equals(0).count()).toBe(1);
  });

  it("applyVersions registers versions without upgrade functions", () => {
    const db = new Dexie(`apply-${Math.random()}`);
    applyVersions(db, [{ version: 1, stores: { kv: "key" } }]);
    expect(db.verno).toBe(1);
  });

  it("migrates entities through a version chain", () => {
    const migrations = {
      1: (v: Record<string, unknown>) => ({ ...v, renamed: v.old, old: undefined }),
      2: (v: Record<string, unknown>) => ({ ...v, added: true }),
    };
    expect(migrateEntity({ schemaVersion: 1, old: 5 }, 3, migrations)).toEqual({
      schemaVersion: 3,
      renamed: 5,
      old: undefined,
      added: true,
    });
    expect(migrateEntity({ schemaVersion: 3 }, 3, migrations)).toEqual({ schemaVersion: 3 });
    expect(() => migrateEntity(null, 3, migrations)).toThrow(MigrationError);
    expect(() => migrateEntity({}, 3, migrations)).toThrow("missing schemaVersion");
    expect(() => migrateEntity({ schemaVersion: 4 }, 3, migrations)).toThrow("newer");
    expect(() => migrateEntity({ schemaVersion: 1 }, 3, {})).toThrow("no migration from v1");
    const g = newGame();
    expect(migrateGame(g)).toEqual(g);
  });
});

describe("gameRepo", () => {
  it("save → load returns an equal game", async () => {
    const db = freshDb();
    const s = played();
    await saveActive(s, db);
    const r = await loadActive(db);
    expect(r.corrupt).toBe(false);
    expect(r.session?.game).toEqual(s.game);
    expect(r.session?.past).toEqual([]);
    expect(parseStoredGame(s.game)).toEqual(s.game);
  });

  it("saving a new game id replaces the previous active row", async () => {
    const db = freshDb();
    await saveActive(played(), db);
    const reset = reduceSession(
      played(),
      { type: "RESET_GAME", now: T0 + 9 },
      { rng: seededRng(5) },
    );
    await saveActive(reset, db);
    expect(await db.games.count()).toBe(1);
    expect((await loadActive(db)).session?.game.id).toBe(reset.game.id);
  });

  it("returns null when nothing is saved or the pointer is dangling", async () => {
    const db = freshDb();
    expect(await loadActive(db)).toEqual({ session: null, corrupt: false });
    await db.kv.put({ key: ACTIVE_GAME_KEY, value: "missing" });
    expect(await loadActive(db)).toEqual({ session: null, corrupt: false });
    expect(await db.kv.get(ACTIVE_GAME_KEY)).toBeUndefined();
  });

  it("corrupt state is backed up, cleared and reported", async () => {
    const db = freshDb();
    const s = played();
    await saveActive(s, db);
    await db.games.update(s.game.id, { game: { ...s.game, seats: "broken" } as never });
    const r = await loadActive(db, 12345);
    expect(r).toEqual({ session: null, corrupt: true, backupKey: `${CORRUPT_BACKUP_PREFIX}12345` });
    const backup = await db.kv.get(`${CORRUPT_BACKUP_PREFIX}12345`);
    expect((backup?.value as { id: string }).id).toBe(s.game.id);
    expect(await db.games.count()).toBe(0);
    // recovered: the app can start fresh
    expect(await loadActive(db)).toEqual({ session: null, corrupt: false });
  });

  it("clearActive removes the active game", async () => {
    const db = freshDb();
    await saveActive(played(), db);
    await clearActive(db);
    expect(await db.games.count()).toBe(0);
    expect(await loadActive(db)).toEqual({ session: null, corrupt: false });
    await clearActive(db);
  });
});

describe("settingsRepo", () => {
  it("gets, sets and deletes validated settings", async () => {
    const db = freshDb();
    const schema = z.object({ a: z.number() });
    expect(await getSetting("x", schema, db)).toBeUndefined();
    await setSetting("x", { a: 1 }, db, 5);
    expect(await getSetting("x", schema, db)).toEqual({ a: 1 });
    await setSetting("x", { a: "no" }, db);
    expect(await getSetting("x", schema, db)).toBeUndefined();
    await deleteSetting("x", db);
    expect(await db.settings.count()).toBe(0);
  });
});
