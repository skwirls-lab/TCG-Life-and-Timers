// @req SYNC-002 @req SEC-003
import { describe, expect, it } from "vitest";
import { FakeFirestore, SERVER_TS } from "../../../tests/sync/fakeFirestore";
import {
  fetchRemoteItems,
  remoteAdapters,
  timestampMs,
  type RemoteContext,
} from "./firestoreRemote";
import type { RemoteSnapshot } from "./types";

const ts = (seconds: number) => ({ seconds, nanoseconds: 0 });
const profileDoc = (name: string, extra: Record<string, unknown> = {}) => ({
  name,
  normalizedName: name.toLowerCase(),
  color: "#fff",
  contrast: false,
  updatedAt: ts(100),
  ...extra,
});

function setup() {
  const fake = new FakeFirestore();
  const logs: string[] = [];
  const ctx: RemoteContext = { fs: fake.api(), db: fake.db, uid: "u1", log: (m) => logs.push(m) };
  return { fake, ctx, logs };
}

function collect(
  subscribe: (n: (s: RemoteSnapshot) => void, e: (err: unknown) => void) => () => void,
) {
  const snaps: RemoteSnapshot[] = [];
  const errors: unknown[] = [];
  const unsub = subscribe(
    (s) => snaps.push(s),
    (e) => errors.push(e),
  );
  return { snaps, errors, unsub, last: () => snaps[snaps.length - 1]! };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("collectionRemote", () => {
  it("maps docs to items, skips invalid docs and reports cache vs server", async () => {
    const { fake, ctx, logs } = setup();
    fake.docs.set("users/u1/profiles/p1", profileDoc("Alice", { deleted: true }));
    fake.docs.set("users/u1/profiles/bad", { name: 5 });
    fake.fromCache = true;
    const r = remoteAdapters.profiles(ctx);
    const c = collect((n, e) => r.subscribe(n, e));
    await tick();
    expect(c.last()).toEqual({
      fromServer: false,
      items: [
        {
          id: "p1",
          parent: undefined,
          updatedAt: 100_000,
          deleted: true,
          data: { name: "Alice", normalizedName: "alice", color: "#fff", contrast: false },
        },
      ],
    });
    expect(logs[0]).toMatch(/invalid remote doc bad/);
    fake.fromCache = false;
    fake.emit();
    expect(c.last().fromServer).toBe(true);
    c.unsub();
  });

  it("writes validated data with a server timestamp and keeps pending docs visible", async () => {
    const { fake, ctx } = setup();
    const r = remoteAdapters.profiles(ctx);
    const c = collect((n, e) => r.subscribe(n, e));
    await tick();
    await r.write({
      id: "p1",
      updatedAt: 1,
      deleted: false,
      data: { name: "A", normalizedName: "a", color: "#000", contrast: true },
    });
    expect(fake.writes[0]).toEqual({
      path: "users/u1/profiles/p1",
      data: { name: "A", normalizedName: "a", color: "#000", contrast: true, updatedAt: SERVER_TS },
    });
    expect(c.last().items[0]?.data.name).toBe("A");
    fake.holdWrites = true;
    await r.write({
      id: "p1",
      updatedAt: 2,
      deleted: true,
      data: { name: "A", normalizedName: "a", color: "#000", contrast: true },
    });
    // Pending: the last server-confirmed version is reported.
    expect(c.last().items[0]?.deleted).toBe(false);
    fake.release();
    expect(c.last().items[0]?.deleted).toBe(true);
    // A brand-new pending doc is omitted until confirmed.
    await r.write({
      id: "p2",
      updatedAt: 3,
      deleted: false,
      data: { name: "B", normalizedName: "b", color: "#000", contrast: true },
    });
    expect(c.last().items.map((i) => i.id)).toEqual(["p1"]);
    fake.docs.delete("users/u1/profiles/p1");
    fake.release();
    expect(c.last().items.map((i) => i.id)).toEqual(["p2"]);
    await expect(
      r.write({ id: "p3", updatedAt: 1, deleted: false, data: { name: "" } }),
    ).rejects.toThrow();
    c.unsub();
  });

  it("covers presets, records and art collections", async () => {
    const { fake, ctx } = setup();
    await remoteAdapters.presets(ctx).write({
      id: "c1",
      updatedAt: 1,
      deleted: false,
      data: { name: "P", game: "G", payload: "{}", schemaVersion: 1 },
    });
    await remoteAdapters.records(ctx).write({
      id: "g1",
      updatedAt: 1,
      deleted: false,
      data: {
        schemaVersion: 1,
        presetId: "p",
        game: "G",
        startedAt: 1,
        endedAt: 2,
        durationMs: 1,
        seats: [{ name: "A", winner: true }],
      },
    });
    await remoteAdapters.art(ctx).write({
      id: "a1",
      updatedAt: 1,
      deleted: false,
      data: {
        storagePath: "users/u1/art/a1.webp",
        width: 1,
        height: 1,
        bytes: 1,
        contentType: "image/webp",
        name: "x",
      },
    });
    expect(fake.writes.map((w) => w.path)).toEqual([
      "users/u1/presets/c1",
      "users/u1/games/g1",
      "users/u1/art/a1",
    ]);
  });
});

describe("decksRemote", () => {
  it("listens to the decks of every profile and writes under the parent", async () => {
    const { fake, ctx } = setup();
    fake.docs.set("users/u1/profiles/p1", profileDoc("A"));
    fake.docs.set("users/u1/profiles/p1/decks/d1", {
      name: "D",
      presetId: "x",
      commanders: [],
      colorIdentity: ["W"],
      updatedAt: ts(5),
    });
    const r = remoteAdapters.decks(ctx);
    const c = collect((n, e) => r.subscribe(n, e));
    await tick();
    await tick();
    expect(c.last()).toMatchObject({
      fromServer: true,
      items: [{ id: "d1", parent: "p1", updatedAt: 5000 }],
    });

    await r.write({
      id: "d2",
      parent: "p1",
      updatedAt: 1,
      deleted: false,
      data: { name: "E", presetId: "x", commanders: [], colorIdentity: [] },
    });
    expect(fake.writes[0]?.path).toBe("users/u1/profiles/p1/decks/d2");
    await expect(r.write({ id: "d3", updatedAt: 1, deleted: false, data: {} })).rejects.toThrow(
      /without profile/,
    );

    // A profile disappearing drops its deck listener.
    fake.docs.delete("users/u1/profiles/p1");
    fake.emit();
    await tick();
    expect(c.last().items).toEqual([]);
    fake.fail(new Error("boom"));
    expect(c.errors.length).toBeGreaterThan(0);
    c.unsub();
    expect(fake.listeners.size).toBe(0);
  });
});

describe("userDocRemote", () => {
  it("creates the user doc with createdAt once and preserves it on updates", async () => {
    const { fake, ctx, logs } = setup();
    const r = remoteAdapters.settings(ctx, () => "Alice Example");
    const c = collect((n, e) => r.subscribe(n, e));
    await tick();
    expect(c.last()).toEqual({ items: [], fromServer: true });
    await r.write({
      id: "user",
      updatedAt: 1,
      deleted: false,
      data: { settings: { app: { theme: "light" } }, meProfileId: "p1" },
    });
    expect(fake.writes[0]?.data).toEqual({
      displayName: "Alice Example",
      settings: { app: { theme: "light" } },
      meProfileId: "p1",
      createdAt: SERVER_TS,
      updatedAt: SERVER_TS,
    });
    expect(c.last().items[0]).toMatchObject({
      id: "user",
      data: { settings: { app: { theme: "light" } }, meProfileId: "p1" },
    });
    const createdAt = fake.docs.get("users/u1")?.createdAt;
    fake.holdWrites = true;
    await r.write({ id: "user", updatedAt: 2, deleted: false, data: { settings: {} } });
    expect(fake.writes[1]?.data.createdAt).toBe(createdAt);
    expect(c.last().items[0]?.data.settings).toEqual({ app: { theme: "light" } }); // pending
    fake.release();
    expect(c.last().items[0]?.data).toEqual({ settings: {} });
    fake.docs.set("users/u1", { bogus: true });
    fake.emit();
    expect(logs.some((l) => l.includes("invalid user doc"))).toBe(true);
    c.unsub();
  });

  it("reads createdAt from the server when it hasn't seen a snapshot", async () => {
    const { fake, ctx } = setup();
    fake.docs.set("users/u1", { displayName: "", createdAt: ts(1), updatedAt: ts(1) });
    const r = remoteAdapters.settings(ctx, () => "");
    await r.write({ id: "user", updatedAt: 1, deleted: false, data: {} });
    expect(fake.writes[0]?.data.createdAt).toEqual(ts(1));
    const fresh = setup();
    await remoteAdapters
      .settings(fresh.ctx, () => "")
      .write({ id: "user", updatedAt: 1, deleted: false, data: {} });
    expect(fresh.fake.writes[0]?.data.createdAt).toBe(SERVER_TS);
  });
});

describe("fetchRemoteItems", () => {
  it("reads every synced collection once", async () => {
    const { fake, ctx } = setup();
    fake.docs.set("users/u1/profiles/p1", profileDoc("A"));
    fake.docs.set("users/u1/profiles/p1/decks/d1", {
      name: "D",
      presetId: "x",
      commanders: [],
      colorIdentity: [],
      updatedAt: ts(5),
    });
    fake.docs.set("users/u1/presets/c1", {
      name: "P",
      game: "G",
      payload: "{}",
      schemaVersion: 1,
      updatedAt: ts(6),
    });
    fake.docs.set("users/u1", {
      displayName: "",
      createdAt: ts(1),
      updatedAt: ts(7),
      settings: { app: {} },
    });
    const out = await fetchRemoteItems(ctx);
    expect(out.profiles.map((i) => i.id)).toEqual(["p1"]);
    expect(out.decks).toMatchObject([{ id: "d1", parent: "p1" }]);
    expect(out.presets).toHaveLength(1);
    expect(out.records).toEqual([]);
    expect(out.art).toEqual([]);
    expect(out.settings).toMatchObject([
      { id: "user", updatedAt: 7000, data: { settings: { app: {} } } },
    ]);
    fake.docs.delete("users/u1");
    expect((await fetchRemoteItems({ ...ctx, log: undefined })).settings).toEqual([]);
  });

  it("timestampMs converts seconds + nanoseconds", () => {
    expect(timestampMs({ seconds: 2, nanoseconds: 5_000_000 })).toBe(2005);
  });
});
