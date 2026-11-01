// @req AUTH-003 @req AUTH-004 @req AUTH-005 @req SYNC-004 @req ARCH-007
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAuthForTests, signInForTests, signOut, useAuth } from "@/lib/auth/store";
import type { AuthDriver, AuthUser } from "@/lib/auth/types";
import { TcgDb } from "@/lib/db";
import { useSyncStatus } from "@/lib/sync/status";
import { FakeFirestore } from "../../../tests/sync/fakeFirestore";
import {
  deleteMyAccount,
  LINKED_UID_KEY,
  resetCloudForTests,
  resolveMerge,
  startCloud,
  useCloud,
} from "./cloud";

const callable = vi.fn(async () => ({ data: { ok: true } }));
vi.mock("firebase/functions", () => ({ httpsCallable: () => callable }));
vi.mock("@/lib/firebase/client", () => ({
  getFunctionsClient: async () => ({}),
  getDb: async () => null,
  getFirebaseApp: async () => null,
}));

class Driver implements AuthDriver {
  user: AuthUser | null = null;
  cbs = new Set<(u: AuthUser | null) => void>();
  onAuthStateChanged(cb: (u: AuthUser | null) => void) {
    this.cbs.add(cb);
    queueMicrotask(() => cb(this.user));
    return () => this.cbs.delete(cb);
  }
  async completeRedirect() {}
  async signInWithGoogle() {}
  async signInAnonymously(): Promise<AuthUser> {
    throw new Error("unused");
  }
  async signOut() {
    this.set(null);
  }
  currentUser() {
    return this.user;
  }
  async signInForTests(email: string) {
    this.set({ uid: "u1", email, displayName: "Alice", photoURL: null, isAnonymous: false });
  }
  set(u: AuthUser | null) {
    this.user = u;
    for (const cb of this.cbs) cb(u);
  }
}

const until = async (cond: () => boolean | Promise<boolean>, ms = 4000) => {
  const end = Date.now() + ms;
  while (!(await cond())) {
    if (Date.now() > end) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 10));
  }
};

const ts = (s: number) => ({ seconds: s, nanoseconds: 0 });
let db: TcgDb;
let fake: FakeFirestore;
let n = 0;
const reload = vi.fn(async () => {});
const artStart = vi.fn(async () => {});
const payStart = vi.fn(async () => {});

beforeEach(async () => {
  vi.stubEnv("NEXT_PUBLIC_USE_EMULATORS", "1");
  db = new TcgDb(`cloud-${++n}`);
  await db.open();
  fake = new FakeFirestore();
  artStart.mockClear();
  payStart.mockClear();
  resetCloudForTests();
  resetAuthForTests({
    cloudConfigured: () => true,
    loadDriver: async () => new Driver(),
    preferRedirect: () => false,
  });
});
afterEach(async () => {
  await signOut().catch(() => {});
  resetCloudForTests();
  resetAuthForTests();
  vi.unstubAllEnvs();
  db.close();
  await db.delete();
});

function start() {
  return startCloud({
    loadFirestore: async () => ({ fs: fake.api(), firestore: fake.db }),
    db: () => db,
    historySync: () => false,
    reloadSettings: reload,
    startArtCloud: artStart,
    startPayments: payStart,
  });
}

describe("startCloud", () => {
  it("is idempotent and does nothing for guests", async () => {
    await Promise.all([start(), start()]);
    expect(useAuth.getState()).toMatchObject({ status: "signedOut", initialized: true });
    expect(useSyncStatus.getState().active).toBe(false);
    expect(artStart).not.toHaveBeenCalled(); // guests never load cloud art
  });

  // @req AUTH-003
  it("first sign-in with data on both sides asks, merges and starts syncing", async () => {
    await db.profiles.put({
      id: "l1",
      schemaVersion: 1,
      name: "Local",
      normalizedName: "local",
      color: "#fff",
      contrast: false,
      updatedAt: 5,
    });
    await db.games.put({ id: "active", schemaVersion: 1, updatedAt: 1, game: {} as never });
    await db.settings.put({ key: "app", value: { theme: "light" }, updatedAt: 1 });
    fake.docs.set("users/u1/profiles/r1", {
      name: "Cloud",
      normalizedName: "cloud",
      color: "#000",
      contrast: true,
      updatedAt: ts(10),
    });
    await start();
    await signInForTests("alice@example.com");
    await until(() => useCloud.getState().mergePrompt !== null);
    expect(useCloud.getState().mergePrompt).toMatchObject({
      needsChoice: true,
      counts: { local: 1, remote: 1 },
    });
    resolveMerge("merge");
    await until(() => fake.docs.has("users/u1/profiles/l1"));
    await until(async () => (await db.profiles.get("r1")) !== undefined);
    await until(
      () =>
        useSyncStatus.getState().state === "idle" && useSyncStatus.getState().lastSyncedAt !== null,
    );
    expect(useSyncStatus.getState().active).toBe(true);
    expect((await db.kv.get(LINKED_UID_KEY))?.value).toBe("u1");
    expect(fake.docs.get("users/u1")).toMatchObject({ displayName: "Alice" });
    // @req ART-022 cloud art starts once the account's sync engine runs
    expect(artStart).toHaveBeenCalledTimes(1);
    expect(payStart).toHaveBeenCalledTimes(1); // entitlement sync starts with account sync

    // AUTH-004: sign out and remove data; the active game stays.
    await signOut({ removeLocalData: true });
    expect(await db.profiles.count()).toBe(0);
    expect(await db.games.get("active")).toBeDefined();
    expect(useSyncStatus.getState().active).toBe(false);
    expect(await db.kv.get(LINKED_UID_KEY)).toBeUndefined();
    expect(reload).toHaveBeenCalled();
    // Nothing was tombstoned in the cloud by clearing the device.
    expect(fake.docs.get("users/u1/profiles/l1")).not.toHaveProperty("deleted");
  });

  it("cloudOnly replaces local data with the cloud copy", async () => {
    await db.profiles.put({
      id: "l1",
      schemaVersion: 1,
      name: "Local",
      normalizedName: "local",
      color: "#fff",
      contrast: false,
      updatedAt: 5,
    });
    fake.docs.set("users/u1/profiles/r1", {
      name: "Cloud",
      normalizedName: "cloud",
      color: "#000",
      contrast: true,
      updatedAt: ts(10),
    });
    await start();
    await signInForTests("alice@example.com");
    await until(() => useCloud.getState().mergePrompt !== null);
    resolveMerge("cloudOnly");
    await until(async () => (await db.profiles.get("r1")) !== undefined);
    expect(await db.profiles.get("l1")).toBeUndefined();
    expect(fake.docs.has("users/u1/profiles/l1")).toBe(false);
  });

  it("signing out while the merge prompt is open cancels it", async () => {
    await db.profiles.put({
      id: "l1",
      schemaVersion: 1,
      name: "Local",
      normalizedName: "local",
      color: "#fff",
      contrast: false,
      updatedAt: 5,
    });
    fake.docs.set("users/u1/profiles/r1", {
      name: "Cloud",
      normalizedName: "cloud",
      color: "#000",
      contrast: true,
      updatedAt: ts(10),
    });
    await start();
    await signInForTests("alice@example.com");
    await until(() => useCloud.getState().mergePrompt !== null);
    await signOut();
    expect(useCloud.getState()).toMatchObject({ mergePrompt: null, phase: "idle" });
    expect(await db.profiles.count()).toBe(1);
    expect(artStart).not.toHaveBeenCalled(); // no account sync → no cloud art
  });

  // @req ART-022
  it("a cloud-art start failure does not stop account sync", async () => {
    await db.kv.put({ key: LINKED_UID_KEY, value: "u1" });
    artStart.mockRejectedValueOnce(new Error("no storage"));
    await start();
    await signInForTests("alice@example.com");
    await until(() => artStart.mock.calls.length === 1);
    await until(() => useSyncStatus.getState().lastSyncedAt !== null);
    expect(useSyncStatus.getState()).toMatchObject({ active: true, state: "idle" });
    expect(useCloud.getState().phase).toBe("syncing");
  });

  it("a returning user skips the merge and syncs directly; failures surface as errors", async () => {
    await db.kv.put({ key: LINKED_UID_KEY, value: "u1" });
    await db.profiles.put({
      id: "l1",
      schemaVersion: 1,
      name: "Local",
      normalizedName: "local",
      color: "#fff",
      contrast: false,
      updatedAt: 5,
    });
    fake.failWrites = Object.assign(new Error("denied"), { code: "permission-denied" });
    await start();
    await signInForTests("alice@example.com");
    await until(() => useSyncStatus.getState().state === "error");
    expect(useCloud.getState().mergePrompt).toBeNull();
    expect(useSyncStatus.getState().error).toBe("denied");
  });

  it("reports a startup failure", async () => {
    await startCloud({
      loadFirestore: () => Promise.reject(new Error("no firestore")),
      db: () => db,
      historySync: () => false,
      reloadSettings: reload,
    });
    await signInForTests("alice@example.com");
    await until(() => useSyncStatus.getState().state === "error");
    expect(useSyncStatus.getState().error).toBe("no firestore");
  });

  // @req AUTH-005
  it("deleteMyAccount calls deleteUserData, signs out and clears the device", async () => {
    await db.kv.put({ key: LINKED_UID_KEY, value: "u1" });
    await db.profiles.put({
      id: "l1",
      schemaVersion: 1,
      name: "Local",
      normalizedName: "local",
      color: "#fff",
      contrast: false,
      updatedAt: 5,
    });
    await start();
    await signInForTests("alice@example.com");
    await until(() => useSyncStatus.getState().active);
    await deleteMyAccount();
    expect(callable).toHaveBeenCalledWith({});
    expect(useAuth.getState().user).toBeNull();
    expect(await db.profiles.count()).toBe(0);
  });
});
