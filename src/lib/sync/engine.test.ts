// @req ARCH-007 @req SYNC-002 @req SYNC-003 @req SYNC-004
import { describe, expect, it } from "vitest";
import { createSyncEngine, isTransientError, kvKeys, type SyncEngine } from "./engine";
import { MemoryKv, MemoryLocal, MemoryNetwork, MemoryRemote } from "./memory";
import { describeSyncStatus } from "./status";
import type { SyncStatus } from "./types";

interface Device {
  local: MemoryLocal;
  kv: MemoryKv;
  net: MemoryNetwork;
  engine: SyncEngine;
  statuses: SyncStatus[];
  logs: string[];
}

function device(
  remote: MemoryRemote,
  opts: {
    writeOnce?: boolean;
    noDeletes?: boolean;
    kv?: MemoryKv;
    local?: MemoryLocal;
    net?: MemoryNetwork;
  } = {},
): Device {
  const local = opts.local ?? new MemoryLocal();
  const kv = opts.kv ?? new MemoryKv();
  const net = opts.net ?? new MemoryNetwork();
  const statuses: SyncStatus[] = [];
  const logs: string[] = [];
  const engine = createSyncEngine({
    scope: "u1",
    collections: [
      { name: "profiles", local, remote, writeOnce: opts.writeOnce, noDeletes: opts.noDeletes },
    ],
    kv,
    network: net,
    debounceMs: 0,
    backoff: { baseMs: 5, maxMs: 20 },
    now: () => 5_000_000,
    onStatus: (s) => statuses.push(s),
    log: (m) => logs.push(m),
  });
  return { local, kv, net, engine, statuses, logs };
}

const item = (id: string, name: string, updatedAt: number) => ({
  id,
  updatedAt,
  data: { name },
});

describe("sync engine", () => {
  // @req SYNC-002
  it("pushes local-only docs and pulls remote-only docs on start", async () => {
    const remote = new MemoryRemote();
    remote.serverWrite({ id: "r1", deleted: false, data: { name: "Remote" } });
    const a = device(remote);
    a.local.put(item("l1", "Local", 10));
    await a.engine.start();
    await a.engine.whenIdle();
    expect(remote.docs.get("l1")?.data).toEqual({ name: "Local" });
    expect(a.local.rows.get("r1")?.data).toEqual({ name: "Remote" });
    expect(a.engine.status()).toMatchObject({ state: "idle", pending: 0 });
    expect(a.engine.status().lastSyncedAt).toBe(5_000_000);
    a.engine.stop();
  });

  // @req ARCH-007
  it("propagates a create, an edit and a delete from device A to device B", async () => {
    const remote = new MemoryRemote();
    const a = device(remote);
    const b = device(remote);
    await a.engine.start();
    await b.engine.start();
    a.local.put(item("p1", "Alice", 10));
    await a.engine.whenIdle();
    await b.engine.whenIdle();
    expect(b.local.rows.get("p1")?.data).toEqual({ name: "Alice" });

    b.local.put(item("p1", "Alicia", 20));
    await b.engine.whenIdle();
    await a.engine.whenIdle();
    expect(a.local.rows.get("p1")?.data).toEqual({ name: "Alicia" });

    a.local.remove("p1");
    await a.engine.whenIdle();
    await b.engine.whenIdle();
    expect(remote.docs.get("p1")).toMatchObject({ deleted: true, data: { name: "Alicia" } });
    expect(b.local.rows.has("p1")).toBe(false);
    // No echo loops: A wrote exactly create + tombstone, B wrote one edit.
    expect(remote.writes.map((w) => w.data.name)).toEqual(["Alice", "Alicia", "Alicia"]);
    a.engine.stop();
    b.engine.stop();
  });

  // @req SYNC-002
  it("conflict: the newer remote write wins over an older offline local edit", async () => {
    const remote = new MemoryRemote();
    const a = device(remote);
    await a.engine.start();
    a.local.put(item("p1", "v1", 10));
    await a.engine.whenIdle();
    a.net.set(false);
    a.local.put(item("p1", "local-edit", 1_002_000)); // older than the next server write
    await a.engine.whenIdle();
    expect(a.engine.status()).toMatchObject({ state: "offline", pending: 1 });
    remote.serverWrite({
      id: "p1",
      deleted: false,
      data: { name: "remote-edit" },
      updatedAt: 1_500_000,
    });
    await a.engine.whenIdle();
    a.net.set(true);
    await a.engine.whenIdle();
    expect(a.local.rows.get("p1")?.data).toEqual({ name: "remote-edit" });
    expect(remote.docs.get("p1")?.data).toEqual({ name: "remote-edit" });
    expect(a.engine.status().pending).toBe(0);
    a.engine.stop();
  });

  // @req SYNC-002
  it("conflict: a newer local edit wins over an older remote write", async () => {
    const remote = new MemoryRemote();
    const a = device(remote);
    await a.engine.start();
    a.local.put(item("p1", "v1", 10));
    await a.engine.whenIdle();
    a.net.set(false);
    remote.serverWrite({
      id: "p1",
      deleted: false,
      data: { name: "remote-edit" },
      updatedAt: 1_500_000,
    });
    a.local.put(item("p1", "local-edit", 2_000_000));
    await a.engine.whenIdle();
    a.net.set(true);
    await a.engine.whenIdle();
    expect(remote.docs.get("p1")?.data).toEqual({ name: "local-edit" });
    expect(a.local.rows.get("p1")?.data).toEqual({ name: "local-edit" });
    a.engine.stop();
  });

  it("first sync with the same id on both sides: newer updatedAt wins, equal data is adopted", async () => {
    const remote = new MemoryRemote();
    remote.serverWrite({
      id: "old",
      deleted: false,
      data: { name: "cloud" },
      updatedAt: 2_000_000,
    });
    remote.serverWrite({ id: "same", deleted: false, data: { name: "x" }, updatedAt: 2_100_000 });
    remote.serverWrite({ id: "tomb", deleted: true, data: { name: "t" }, updatedAt: 2_200_000 });
    const a = device(remote);
    a.local.put(item("old", "device", 3_000_000));
    a.local.put(item("same", "x", 1));
    a.local.put(item("tomb", "t2", 1));
    const writesBefore = remote.writes.length;
    await a.engine.start();
    await a.engine.whenIdle();
    expect(remote.docs.get("old")?.data).toEqual({ name: "device" });
    expect(a.local.rows.has("tomb")).toBe(false); // remote tombstone is newer
    expect(remote.writes.length - writesBefore).toBe(1); // only "old" was pushed
    a.engine.stop();
  });

  // @req SYNC-002
  it("remote hard deletes and tombstones remove local rows", async () => {
    const remote = new MemoryRemote();
    const a = device(remote);
    await a.engine.start();
    a.local.put(item("p1", "A", 1));
    a.local.put(item("p2", "B", 1));
    await a.engine.whenIdle();
    remote.hardDelete("p1");
    remote.serverWrite({ id: "p2", deleted: true, data: { name: "B" } });
    await a.engine.whenIdle();
    expect([...a.local.rows.keys()]).toEqual([]);
    const shadow = (await a.kv.get(kvKeys.shadow("u1", "profiles"))) as Record<string, unknown>;
    expect(Object.keys(shadow)).toEqual(["p2"]);
    a.engine.stop();
  });

  // @req SYNC-004
  it("offline queue is persisted and flushed after a restart once online", async () => {
    const remote = new MemoryRemote();
    const kv = new MemoryKv();
    const local = new MemoryLocal();
    const net = new MemoryNetwork();
    net.online = false;
    const a = device(remote, { kv, local, net });
    await a.engine.start();
    local.put(item("p1", "offline", 10));
    await a.engine.whenIdle();
    expect(a.engine.status()).toMatchObject({ state: "offline", pending: 1 });
    expect(describeSyncStatus({ ...a.engine.status(), active: true }).key).toBe(
      "account.sync.offline",
    );
    expect(((await kv.get(kvKeys.queue("u1"))) as unknown[]).length).toBe(1);
    a.engine.stop();
    expect(remote.docs.size).toBe(0);

    const b = device(remote, { kv, local, net });
    await b.engine.start();
    await b.engine.whenIdle();
    expect(b.engine.status().pending).toBe(1);
    net.set(true);
    await b.engine.whenIdle();
    expect(remote.docs.get("p1")?.data).toEqual({ name: "offline" });
    expect(b.engine.status()).toMatchObject({ state: "idle", pending: 0 });
    b.engine.stop();
  });

  it("drops a queued create when the row is deleted before it was pushed", async () => {
    const remote = new MemoryRemote();
    const a = device(remote);
    a.net.online = false;
    await a.engine.start();
    a.local.put(item("p1", "x", 1));
    await a.engine.whenIdle();
    expect(a.engine.status().pending).toBe(1);
    a.local.remove("p1");
    await a.engine.whenIdle();
    expect(a.engine.status().pending).toBe(0);
    a.engine.stop();
  });

  it("retries transient failures with backoff", async () => {
    const remote = new MemoryRemote();
    remote.failWith = Object.assign(new Error("offline-ish"), { code: "unavailable" });
    remote.failCount = 2;
    const a = device(remote);
    await a.engine.start();
    a.local.put(item("p1", "x", 1));
    await a.engine.whenIdle();
    expect(a.statuses.some((s) => s.state === "error")).toBe(true);
    for (let i = 0; i < 50 && remote.docs.size === 0; i++)
      await new Promise((r) => setTimeout(r, 5));
    await a.engine.whenIdle();
    expect(remote.docs.get("p1")?.data).toEqual({ name: "x" });
    expect(a.engine.status()).toMatchObject({ state: "idle", error: null });
    expect(a.logs.some((l) => l.includes("will retry"))).toBe(true);
    a.engine.stop();
  });

  it("drops permanently rejected writes and does not retry them", async () => {
    const remote = new MemoryRemote();
    remote.failWith = Object.assign(new Error("Missing or insufficient permissions."), {
      code: "permission-denied",
    });
    const a = device(remote);
    await a.engine.start();
    a.local.put(item("p1", "bad", 1));
    await a.engine.whenIdle();
    expect(a.engine.status()).toMatchObject({ state: "error", pending: 0 });
    const tries = a.logs.filter((l) => l.includes("rejected")).length;
    await a.engine.reconcileAll();
    await a.engine.whenIdle();
    expect(a.logs.filter((l) => l.includes("rejected")).length).toBe(tries);
    // A later different edit is attempted again (and succeeds once healed).
    remote.failWith = null;
    a.local.put(item("p1", "good", 2));
    await a.engine.whenIdle();
    expect(remote.docs.get("p1")?.data).toEqual({ name: "good" });
    a.engine.stop();
  });

  it("waits for a server-confirmed snapshot before reconciling", async () => {
    const remote = new MemoryRemote();
    remote.fromServer = false;
    const a = device(remote);
    a.local.put(item("p1", "x", 1));
    await a.engine.start();
    await a.engine.whenIdle();
    expect(remote.docs.size).toBe(0);
    expect(a.engine.status().state).toBe("syncing");
    remote.fromServer = true;
    remote.emit();
    await a.engine.whenIdle();
    expect(remote.docs.size).toBe(1);
    a.engine.stop();
  });

  it("resubscribes after a listener error", async () => {
    const remote = new MemoryRemote();
    const a = device(remote);
    await a.engine.start();
    await a.engine.whenIdle();
    remote.fail(new Error("listen failed"));
    expect(a.engine.status()).toMatchObject({ state: "error", error: "listen failed" });
    for (let i = 0; i < 50 && remote.listenerCount === 0; i++)
      await new Promise((r) => setTimeout(r, 5));
    await a.engine.whenIdle();
    expect(remote.listenerCount).toBe(1);
    expect(a.engine.status().error).toBeNull();
    a.engine.stop();
    expect(remote.listenerCount).toBe(0);
    expect(a.engine.status().state).toBe("idle");
  });

  it("ignores local apply failures without corrupting the shadow", async () => {
    const remote = new MemoryRemote();
    remote.serverWrite({ id: "r1", deleted: false, data: { name: "R" } });
    const a = device(remote);
    a.local.apply = () => Promise.reject(new Error("disk full"));
    await a.engine.start();
    await a.engine.whenIdle();
    expect(a.logs.some((l) => l.includes("could not apply"))).toBe(true);
    expect(await a.kv.get(kvKeys.shadow("u1", "profiles"))).toBeUndefined();
    a.engine.stop();
  });

  // @req SYNC-003
  it("write-once collections push creates and tombstones but never updates", async () => {
    const remote = new MemoryRemote();
    const a = device(remote, { writeOnce: true });
    await a.engine.start();
    a.local.put(item("g1", "game", 1));
    await a.engine.whenIdle();
    expect(remote.writes).toHaveLength(1);
    a.local.put(item("g1", "edited", 2));
    await a.engine.whenIdle();
    expect(remote.writes).toHaveLength(1);
    a.local.remove("g1");
    await a.engine.whenIdle();
    expect(remote.docs.get("g1")).toMatchObject({ deleted: true, data: { name: "game" } });

    // A differing local copy of a remote record is replaced by the immutable remote one.
    remote.serverWrite({ id: "g2", deleted: false, data: { name: "cloud" } });
    await a.engine.whenIdle();
    a.engine.stop();
    const b = device(remote, { writeOnce: true });
    b.local.put(item("g2", "local", 9_999_999_999));
    await b.engine.start();
    await b.engine.whenIdle();
    expect(b.local.rows.get("g2")?.data).toEqual({ name: "cloud" });
    b.engine.stop();
  });

  it("noDeletes collections never push tombstones for missing local items", async () => {
    const remote = new MemoryRemote();
    const a = device(remote, { noDeletes: true });
    await a.engine.start();
    a.local.put(item("user", "x", 1));
    await a.engine.whenIdle();
    expect(remote.writes).toHaveLength(1);
    a.local.remove("user");
    await a.engine.whenIdle();
    expect(remote.writes).toHaveLength(1);
    remote.serverWrite({ id: "user", deleted: false, data: { name: "y" } });
    await a.engine.whenIdle();
    expect(a.local.rows.get("user")?.data).toEqual({ name: "y" });
    a.engine.stop();
  });

  it("start is idempotent and flush is a no-op when stopped", async () => {
    const remote = new MemoryRemote();
    const a = device(remote);
    await a.engine.start();
    await a.engine.start();
    expect(remote.listenerCount).toBe(1);
    a.engine.stop();
    await a.engine.flush();
    expect(a.engine.status().state).toBe("idle");
  });
});

describe("isTransientError", () => {
  it("classifies Firestore codes and network errors", () => {
    expect(isTransientError({ code: "unavailable" })).toBe(true);
    expect(isTransientError({ code: "firestore/deadline-exceeded" })).toBe(true);
    expect(isTransientError({ code: "permission-denied" })).toBe(false);
    expect(isTransientError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isTransientError(new Error("nope"))).toBe(false);
    expect(isTransientError("x")).toBe(false);
  });
});

describe("describeSyncStatus", () => {
  const base = { state: "idle" as const, lastSyncedAt: 0, pending: 0, error: null, active: true };
  it("maps engine status to the SYNC-004 line", () => {
    expect(describeSyncStatus({ ...base, active: false }).key).toBe("account.sync.off");
    expect(describeSyncStatus({ ...base, state: "error", error: "x" })).toEqual({
      key: "account.sync.error",
      error: "x",
    });
    expect(describeSyncStatus({ ...base, state: "error" })).toEqual({
      key: "account.sync.error",
      error: "",
    });
    expect(describeSyncStatus({ ...base, state: "syncing", pending: 2 })).toEqual({
      key: "account.sync.syncing",
      pending: 2,
    });
    expect(describeSyncStatus({ ...base, lastSyncedAt: null }).key).toBe("account.sync.syncing");
    expect(describeSyncStatus(base, 30_000).key).toBe("account.sync.syncedNow");
    expect(describeSyncStatus(base, 150_000)).toEqual({ key: "account.sync.synced", minutes: 2 });
  });
});
