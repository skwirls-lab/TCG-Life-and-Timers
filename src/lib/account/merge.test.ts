// @req AUTH-003 @req AUTH-004
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TcgDb } from "@/lib/db";
import type { SyncItem } from "@/lib/sync/types";
import {
  clearLocalAccountData,
  emptySnapshot,
  snapshotLocal,
  type DataSnapshot,
} from "./localData";
import { executeMerge, planMerge, renameInRecord, renameProfilesInGame } from "./merge";
import { createSession } from "@/engine";
import { newGame } from "../../../tests/unit/helpers/engine";
import { useGameStore } from "@/state/gameStore";
import { applyProfileRenamesToOpenGame } from "./cloud";

const prof = (id: string, name: string, updatedAt: number, deleted = false): SyncItem => ({
  id,
  updatedAt,
  deleted,
  data: { name, normalizedName: name.toLowerCase(), color: "#fff", contrast: false },
});
const snap = (over: Partial<DataSnapshot>): DataSnapshot => ({ ...emptySnapshot(), ...over });

describe("planMerge", () => {
  it("no prompt when either side is empty", () => {
    const onlyLocal = planMerge(snap({ profiles: [prof("a", "A", 1)] }), emptySnapshot());
    expect(onlyLocal).toMatchObject({ hasLocal: true, hasRemote: false, needsChoice: false });
    const onlyRemote = planMerge(
      snap({ settings: [{ id: "user", updatedAt: 1, deleted: false, data: { settings: {} } }] }),
      snap({ presets: [{ id: "c", updatedAt: 1, deleted: false, data: {} }] }),
    );
    expect(onlyRemote).toMatchObject({ hasLocal: false, hasRemote: true, needsChoice: false });
    expect(onlyRemote.outcomes).toContainEqual({
      collection: "presets",
      id: "c",
      reason: "remoteOnly",
      winner: "remote",
    });
  });

  // @req AUTH-003
  it("matches by id, then profiles by normalized name; newer updatedAt wins", () => {
    const local = snap({
      profiles: [
        prof("p1", "Same", 10),
        prof("l2", "Jean-Paul", 50),
        prof("l3", "Only Local", 1),
        prof("l4", "Ghost", 1),
      ],
      decks: [{ id: "d1", parent: "l2", updatedAt: 1, deleted: false, data: { name: "D" } }],
    });
    const remote = snap({
      profiles: [
        { ...prof("p1", "Same", 20), data: { ...prof("p1", "Same", 20).data, color: "#000" } },
        prof("r2", "jean-paul", 40),
        prof("r9", "Only Cloud", 1),
        prof("r8", "Ghost", 5, true), // tombstoned profiles are not name-matched
      ],
      decks: [{ id: "d1", parent: "l2", updatedAt: 1, deleted: false, data: { name: "D" } }],
    });
    const plan = planMerge(local, remote);
    expect(plan.needsChoice).toBe(true);
    expect(plan.profileRenames).toEqual([{ from: "l2", to: "r2" }]);
    expect(plan.outcomes).toEqual(
      expect.arrayContaining([
        { collection: "profiles", id: "p1", reason: "id", winner: "remote" },
        { collection: "profiles", id: "r2", localId: "l2", reason: "name", winner: "local" },
        { collection: "profiles", id: "l3", reason: "localOnly", winner: "local" },
        { collection: "profiles", id: "l4", reason: "localOnly", winner: "local" },
        { collection: "profiles", id: "r9", reason: "remoteOnly", winner: "remote" },
        { collection: "decks", id: "d1", reason: "id", winner: "same" },
      ]),
    );
    // No data loss: every live document from either side has an outcome.
    expect(plan.outcomes.filter((o) => o.collection === "profiles")).toHaveLength(5);
    expect(plan.counts).toEqual({ local: 5, remote: 4 });
  });
});

describe("executeMerge / clearLocalAccountData", () => {
  let db: TcgDb;
  let n = 0;
  beforeEach(async () => {
    db = new TcgDb(`merge-${++n}`);
    await db.open();
    await db.profiles.put({
      id: "l2",
      schemaVersion: 1,
      name: "Jean-Paul",
      normalizedName: "jean-paul",
      color: "#fff",
      contrast: false,
      updatedAt: 50,
    });
    await db.decks.put({
      id: "d1",
      schemaVersion: 1,
      profileId: "l2",
      name: "Deck",
      commanders: [],
      updatedAt: 1,
    });
    await db.presets.put({
      id: "c1",
      schemaVersion: 1,
      preset: { name: "P", game: "G" },
      updatedAt: 1,
    });
    await db.records.put({ id: "g1", schemaVersion: 1, endedAt: 1, presetId: "x" });
    await db.settings.put({ key: "app", value: { theme: "light", haptics: false }, updatedAt: 1 });
    await db.settings.put({ key: "presetDefaults:x", value: {}, updatedAt: 1 });
    await db.art.put({
      id: "a1",
      blob: new Blob([]),
      meta: { storagePath: "users/u/art/a1.webp" },
    });
    await db.art.put({ id: "a2", blob: new Blob([]), meta: {} });
    await db.games.put({ id: "game", schemaVersion: 1, updatedAt: 1, game: {} as never });
    await db.kv.put({ key: "activeGameId", value: "game" });
  });
  afterEach(async () => {
    db.close();
    await db.delete();
  });

  it("merge rewrites name-matched profile ids and re-parents their decks", async () => {
    const plan = planMerge(
      await snapshotLocal(db),
      snap({ profiles: [prof("r2", "jean-paul", 40)] }),
    );
    await executeMerge(plan, "merge", { includeRecords: true, db });
    expect(await db.profiles.get("l2")).toBeUndefined();
    expect(await db.profiles.get("r2")).toMatchObject({ name: "Jean-Paul", updatedAt: 50 });
    expect(await db.decks.get("d1")).toMatchObject({ profileId: "r2" });
    // Nothing to rename: no-op.
    await executeMerge(planMerge(emptySnapshot(), emptySnapshot()), "merge", {
      includeRecords: true,
      db,
    });
    await executeMerge({ ...plan, profileRenames: [{ from: "missing", to: "x" }] }, "merge", {
      includeRecords: true,
      db,
    });
    expect(await db.profiles.count()).toBe(1);
  });

  it("cloudOnly clears the synced tables but keeps the active game and device settings", async () => {
    const plan = planMerge(await snapshotLocal(db), snap({ profiles: [prof("r2", "x", 1)] }));
    await executeMerge(plan, "cloudOnly", { includeRecords: false, db });
    expect(await db.profiles.count()).toBe(0);
    expect(await db.decks.count()).toBe(0);
    expect(await db.presets.count()).toBe(0);
    expect(await db.records.count()).toBe(1); // history sync off → records are not account data
    expect((await db.settings.get("app"))?.value).toEqual({ haptics: false });
    expect(await db.settings.get("presetDefaults:x")).toBeUndefined();
    expect((await db.art.toArray()).map((a) => a.id)).toEqual(["a2"]);
    expect(await db.games.get("game")).toBeDefined();
    expect((await db.kv.get("activeGameId"))?.value).toBe("game");
  });

  // @req AUTH-004
  it("remove-from-device also clears records when history sync is on", async () => {
    await db.settings.delete("app");
    await clearLocalAccountData({ includeRecords: true, now: 5 }, db);
    expect(await db.records.count()).toBe(0);
    expect(await db.settings.get("app")).toBeUndefined();
    expect(await db.games.count()).toBe(1);
  });

  // @req AUTH-003 @req HIST-033
  it("B-7: records and stored games follow a name-matched profile id", async () => {
    await db.records.put({
      id: "g2",
      schemaVersion: 1,
      endedAt: 2,
      presetId: "x",
      seats: [
        { name: "Jean-Paul", profileId: "l2", winner: true },
        { name: "B", winner: false },
      ],
      players: [
        { seatId: "s1", name: "Jean-Paul", identity: "p:l2", profileId: "l2" },
        { seatId: "s2", name: "B", identity: "n:b" },
      ],
    } as never);
    const g = newGame();
    const stored = {
      ...g,
      seats: g.seats.map((x, i) => (i === 0 ? { ...x, profileId: "l2" } : x)),
    };
    await db.games.put({ id: "game", schemaVersion: 1, updatedAt: 1, game: stored });
    const plan = planMerge(
      await snapshotLocal(db),
      snap({ profiles: [prof("r2", "jean-paul", 40)] }),
    );
    await executeMerge(plan, "merge", { includeRecords: true, db });
    const r = (await db.records.get("g2")) as unknown as {
      seats: { profileId?: string }[];
      players: { profileId?: string; identity: string }[];
    };
    expect(r.seats.map((x) => x.profileId)).toEqual(["r2", undefined]);
    expect(r.players.map((p) => [p.profileId, p.identity])).toEqual([
      ["r2", "p:r2"],
      [undefined, "n:b"],
    ]);
    expect((await db.records.get("g1")) as unknown).toMatchObject({ id: "g1" }); // untouched
    expect((await db.games.get("game"))!.game.seats[0]!.profileId).toBe("r2");
  });

  it("B-7: pure helpers return the same object when nothing references the ids", () => {
    const renames = new Map([["a", "b"]]);
    const g = newGame();
    expect(renameProfilesInGame(g, renames)).toBe(g);
    expect(renameInRecord({ id: "x" }, renames)).toBeNull();
    expect(renameInRecord({ seats: [{ profileId: "z" }] }, renames)).toBeNull();
  });

  it("B-7: the open game and its undo snapshots follow the rename", () => {
    const g = newGame();
    const withP = { ...g, seats: g.seats.map((x, i) => (i === 1 ? { ...x, profileId: "l2" } : x)) };
    useGameStore.setState({ session: { ...createSession(withP), past: [withP] } });
    applyProfileRenamesToOpenGame({
      ...planMerge(emptySnapshot(), emptySnapshot()),
      profileRenames: [{ from: "l2", to: "r2" }],
    });
    const s = useGameStore.getState().session!;
    expect(s.game.seats[1]!.profileId).toBe("r2");
    expect(s.past[0]!.seats[1]!.profileId).toBe("r2");
    const same = useGameStore.getState().session;
    applyProfileRenamesToOpenGame({
      ...planMerge(emptySnapshot(), emptySnapshot()),
      profileRenames: [{ from: "l2", to: "r2" }],
    });
    expect(useGameStore.getState().session).toBe(same);
    applyProfileRenamesToOpenGame(planMerge(emptySnapshot(), emptySnapshot()));
    useGameStore.setState({ session: null });
    applyProfileRenamesToOpenGame({
      ...planMerge(emptySnapshot(), emptySnapshot()),
      profileRenames: [{ from: "l2", to: "r2" }],
    });
    expect(useGameStore.getState().session).toBeNull();
  });
});
