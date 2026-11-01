// @req HIST-003 @req HIST-007 @req HIST-034 @req HIST-035
import { afterEach, describe, expect, it } from "vitest";
import { TcgDb } from "@/lib/db";
import { MIN, Play, T0, names } from "../../../tests/unit/helpers/records";
import { buildRecord, createRecord } from "./build";
import { hydrateRecord } from "./hydrate";
import {
  applyEdit,
  countRecords,
  deleteRecord,
  enforceCap,
  enrichPartial,
  getRecord,
  importRecords,
  linkIdentityToProfile,
  listRecords,
  mergeIdentities,
  renameIdentity,
  saveRecord,
  updateRecord,
} from "./repo";
import type { GameRecord } from "./types";

let n = 0;
const open: TcgDb[] = [];
function freshDb(): TcgDb {
  const db = new TcgDb(`records-test-${Date.now()}-${n++}`);
  open.push(db);
  return db;
}

afterEach(async () => {
  for (const db of open.splice(0)) {
    db.close();
    await db.delete();
  }
});

/** A finished 3-player game at T0 + offset; `winner` seat index wins. */
function finished(offsetMin: number, seatNames = ["Ana", "Ben", "Cy"], winner = 0): GameRecord {
  const p = new Play(names(...seatNames));
  p.t = offsetMin * MIN;
  seatNames.forEach((_, i) => {
    if (i !== winner) p.wait(MIN).life(`s${i + 1}`, -40);
  });
  const r = buildRecord(p.g, { now: p.now });
  return { ...r, id: `g${offsetMin}` };
}

describe("records repo", () => {
  // @req HIST-003
  it("saves, gets, lists newest first and deletes", async () => {
    const db = freshDb();
    expect(await saveRecord(finished(0), { db })).toBe(true);
    expect(await saveRecord(finished(10), { db })).toBe(true);
    const list = await listRecords({ db });
    expect(list.map((r) => r.id)).toEqual(["g10", "g0"]);
    expect((await getRecord("g0", { db }))?.winners).toEqual(["s1"]);
    expect(await getRecord("nope", { db })).toBeUndefined();
    await deleteRecord("g0", { db });
    expect(await countRecords({ db })).toBe(1);
  });

  it("is write-once unless replace is set (keeps createdAt)", async () => {
    const db = freshDb();
    const r = finished(0);
    await saveRecord(r, { db });
    expect(await saveRecord({ ...r, presetName: "changed" }, { db })).toBe(false);
    expect((await getRecord(r.id, { db }))?.presetName).toBe("Commander");
    expect(
      await saveRecord({ ...r, presetName: "changed", createdAt: 99 }, { db, replace: true }),
    ).toBe(true);
    const got = await getRecord(r.id, { db });
    expect(got?.presetName).toBe("changed");
    expect(got?.createdAt).toBe(r.createdAt);
  });

  // @req HIST-007
  it("compacts the oldest records beyond the soft cap (log dropped, summary kept)", async () => {
    const db = freshDb();
    for (let i = 0; i < 5; i++) {
      const base = finished(i * 10);
      await saveRecord({ ...base, log: "{}" }, { db, cap: 3 });
    }
    const list = await listRecords({ db });
    expect(list).toHaveLength(5);
    const compacted = list.filter((r) => r.compacted).map((r) => r.id);
    expect(compacted.sort()).toEqual(["g0", "g10"]);
    expect(list.find((r) => r.id === "g0")?.log).toBeUndefined();
    expect(list.find((r) => r.id === "g40")?.log).toBe("{}");
    // Already compacted rows are not rewritten again.
    expect(await enforceCap({ db, cap: 3 })).toBe(0);
    expect(await enforceCap({ db })).toBe(0);
  });

  // @req HIST-035
  it("edits winner, names, deck and profile; bumps updatedAt", async () => {
    const db = freshDb();
    const r = finished(0);
    await saveRecord(r, { db });
    const edited = await updateRecord(
      r.id,
      {
        winners: ["s2"],
        names: { s3: "  Cyrus ", s1: "  " },
        decks: { s2: { deckId: "d9", deckName: "Elves" } },
        profiles: { s1: "prof-ana" },
      },
      { db, now: T0 + 999 },
    );
    expect(edited?.updatedAt).toBe(T0 + 999);
    expect(edited?.edited).toBe(true);
    expect(edited?.winners).toEqual(["s2"]);
    expect(edited?.outcome).toBe("win");
    expect(edited?.seats.map((s) => s.winner)).toEqual([false, true, false]);
    expect(edited?.players[2]).toMatchObject({ name: "Cyrus", identity: "n:cyrus" });
    expect(edited?.players[0]).toMatchObject({ name: "Ana", identity: "p:prof-ana" });
    expect(edited?.players[0]!.eliminatedOrder).toBeUndefined();
    expect(edited?.seats[1]).toMatchObject({ deckId: "d9", deckName: "Elves", place: 1 });
    // The former winner is not eliminated; Cy was eliminated second → place 3.
    expect(edited?.players.map((p) => p.place)).toEqual([2, 1, 2]);
    // Clear the deck, unlink the profile, mark as a draw.
    const again = applyEdit(
      edited!,
      { winners: [], outcome: "draw", decks: { s2: {} }, profiles: { s1: null } },
      T0 + 1000,
    );
    expect(again.outcome).toBe("draw");
    expect(again.players[1]!.deckName).toBeUndefined();
    expect(again.players[0]!.identity).toBe("n:ana");
    expect(applyEdit(again, { outcome: "none" }, 1).outcome).toBe("none");
    expect(await updateRecord("missing", {}, { db })).toBeUndefined();
  });

  // @req HIST-034
  it("merges two identities, and undo restores the records", async () => {
    const db = freshDb();
    await saveRecord(finished(0, ["Declan", "Ben", "Cy"]), { db });
    await saveRecord(finished(10, ["Dec", "Ben", "Cy"], 1), { db });
    const change = await mergeIdentities("n:dec", "n:declan", { db, name: "Declan" });
    expect(change.count).toBe(1);
    let list = await listRecords({ db });
    expect(list.flatMap((r) => r.players.filter((p) => p.identity === "n:declan"))).toHaveLength(2);
    expect(list[0]!.players[0]!.name).toBe("Declan");
    await change.undo();
    list = await listRecords({ db });
    expect(list[0]!.players[0]!.identity).toBe("n:dec");
    expect((await mergeIdentities("n:x", "n:x", { db })).count).toBe(0);
  });

  // @req HIST-034
  it("links a name-only identity to a profile and renames identities", async () => {
    const db = freshDb();
    await saveRecord(finished(0, ["Declan", "Ben", "Cy"]), { db });
    const link = await linkIdentityToProfile("n:declan", "prof-d", { db });
    expect(link.count).toBe(1);
    let r = (await listRecords({ db }))[0]!;
    expect(r.players[0]).toMatchObject({ identity: "p:prof-d", profileId: "prof-d" });
    expect(r.seats[0]!.profileId).toBe("prof-d");
    const ren = await renameIdentity("n:ben", "  Benjamin  ", { db });
    expect(ren.count).toBe(1);
    r = (await listRecords({ db }))[0]!;
    expect(r.players[1]).toMatchObject({ name: "Benjamin", identity: "n:benjamin" });
    await renameIdentity("p:prof-d", "Dec", { db });
    r = (await listRecords({ db }))[0]!;
    expect(r.players[0]).toMatchObject({ name: "Dec", identity: "p:prof-d" });
    expect((await renameIdentity("n:cy", "   ", { db })).count).toBe(0);
  });

  it("imports with dedupe by id", async () => {
    const db = freshDb();
    await saveRecord(finished(0), { db });
    const res = await importRecords([finished(0), finished(10), finished(20)], { db });
    expect(res).toEqual({ added: 2, skipped: 1 });
  });

  it("enriches records that arrived from another device from their snapshot log", async () => {
    const db = freshDb();
    const p = new Play(names("Ana", "Ben"));
    p.wait(MIN).life("s2", -40);
    const full = await createRecord(p.g, { now: p.now, encode: { plain: true } });
    // Only the D-013 sync fields (as fromItem stores them), winner edited to Ben remotely.
    const synced = {
      id: full.id,
      schemaVersion: 1,
      presetId: full.presetId,
      game: full.game,
      startedAt: full.startedAt,
      endedAt: full.endedAt,
      durationMs: 12345,
      seats: full.seats.map((s, i) => ({ ...s, winner: i === 1 })),
      log: full.log,
    };
    await db.records.put(synced);
    const partial = (await listRecords({ db }))[0]!;
    expect(partial.partial).toBe(true);
    expect(partial.players[1]!.winner).toBe(true);
    const rich = await enrichPartial(partial, { db });
    expect(rich.partial).toBeUndefined();
    expect(rich.presetName).toBe("Commander");
    expect(rich.winners).toEqual(["s2"]);
    expect(rich.durationMs).toBe(12345);
    expect((await getRecord(full.id, { db }))?.players[0]!.finals["mtg.life"]).toBe(40);
    // Nothing to do without a log or for full records.
    expect(await enrichPartial(rich, { db })).toBe(rich);
    const noLog = hydrateRecord({ ...synced, log: undefined });
    expect(await enrichPartial(noLog, { db })).toBe(noLog);
    const badLog = hydrateRecord({ ...synced, log: "nope" });
    expect(await enrichPartial(badLog, { db })).toBe(badLog);
    // No winner remotely → the snapshot's own result.
    const none = hydrateRecord({
      ...synced,
      seats: synced.seats.map((s) => ({ ...s, winner: false })),
    });
    expect((await enrichPartial(none, { db })).winners).toEqual(["s1"]);
  });
});

describe("hydrateRecord", () => {
  it("rebuilds a local view from sync-only rows and sanitizes seats", () => {
    const r = hydrateRecord({
      id: "x",
      schemaVersion: 1,
      presetId: "mtg.commander",
      game: "Magic",
      startedAt: 10,
      endedAt: 5,
      durationMs: 3,
      seats: [
        { name: "Ana", winner: true, place: 1, profileId: "p1", deckId: "d", deckName: "Deck" },
        { name: "Ben", winner: false },
        null,
      ],
    });
    expect(r.partial).toBe(true);
    expect(r.endedAt).toBe(10);
    expect(r.players).toHaveLength(2);
    expect(r.players[0]).toMatchObject({ identity: "p:p1", deckName: "Deck", place: 1 });
    expect(r.winners).toEqual(["s0"]);
    expect(r.outcome).toBe("win");
    const empty = hydrateRecord({ id: "y" });
    expect(empty.players).toEqual([]);
    expect(empty.outcome).toBe("none");
    expect(empty.schemaVersion).toBe(1);
  });

  it("fills missing arrays on full records", () => {
    const full = finished(0);
    const { eliminations: _e, commanderDamage: _c, winners: _w, ...rest } = full;
    const r = hydrateRecord({ ...rest, schemaVersion: "x" } as unknown as Record<string, unknown>);
    expect(r.eliminations).toEqual([]);
    expect(r.commanderDamage).toEqual([]);
    expect(r.winners).toEqual([]);
    expect(r.schemaVersion).toBe(1);
  });
});
