// @req PAY-003
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TcgDb } from "@/lib/db";
import { fakeRemote } from "../../../tests/unit/support/fakeRemote";
import {
  ENTITLEMENT_CACHE_KEY,
  GRACE_MS,
  dexieEntitlementCache,
  parseCache,
  proFromCache,
  type CacheStore,
  type EntitlementCache,
} from "./cache";
import {
  proFromDoc,
  resetPaymentsForTests,
  startPayments,
  useEntitlementSync,
  type AuthView,
} from "./sync";

const DAY = 24 * 60 * 60 * 1000;
const T0 = 1_800_000_000_000;

function memCache(
  initial: EntitlementCache | null = null,
): CacheStore & { value: EntitlementCache | null } {
  const store = {
    value: initial,
    read: async () => store.value,
    write: async (c: EntitlementCache) => {
      store.value = c;
    },
    clear: async () => {
      store.value = null;
    },
  };
  return store;
}

function harness(
  cached: EntitlementCache | null,
  auth: AuthView = { uid: null, initialized: false },
) {
  const remote = fakeRemote();
  const cache = memCache(cached);
  let state = auth;
  const subs = new Set<() => void>();
  const pro = { value: false };
  let now = T0;
  const session = startPayments({
    remote,
    cache,
    now: () => now,
    authState: () => state,
    subscribeAuth: (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    setPro: (p) => (pro.value = p),
  });
  return {
    remote,
    cache,
    pro,
    session,
    setAuth: (a: AuthView) => {
      state = a;
      for (const cb of subs) cb();
    },
    advance: (ms: number) => (now += ms),
    subs,
  };
}

const entPath = (uid: string) => `users/${uid}/private/entitlements`;

afterEach(() => resetPaymentsForTests());

describe("entitlement cache (PAY-003)", () => {
  // @req PAY-003
  it("grants Pro for 14 days after the last verification", () => {
    const c = { uid: "u1", pro: true, verifiedAt: T0 };
    expect(GRACE_MS).toBe(14 * DAY);
    expect(proFromCache(c, T0 + 14 * DAY)).toBe(true);
    expect(proFromCache(c, T0 + 14 * DAY + 1)).toBe(false);
    expect(proFromCache(c, T0 - 1)).toBe(false); // clock went backwards: don't trust
    expect(proFromCache(c, T0, "u1")).toBe(true);
    expect(proFromCache(c, T0, "u2")).toBe(false);
    expect(proFromCache(c, T0, null)).toBe(false);
    expect(proFromCache({ ...c, pro: false }, T0)).toBe(false);
    expect(proFromCache(null, T0)).toBe(false);
  });

  it("parses only well-formed cache values", () => {
    expect(parseCache({ uid: "u", pro: true, verifiedAt: 5 })).toEqual({
      uid: "u",
      pro: true,
      verifiedAt: 5,
    });
    for (const bad of [
      null,
      3,
      { uid: 1, pro: true, verifiedAt: 1 },
      { uid: "u", pro: "y", verifiedAt: 1 },
      { uid: "u", pro: true, verifiedAt: Infinity },
    ])
      expect(parseCache(bad)).toBeNull();
  });

  it("persists in Dexie kv", async () => {
    const db = new TcgDb(`pay-cache-${Date.now()}`);
    const cache = dexieEntitlementCache(() => db);
    expect(await cache.read()).toBeNull();
    await cache.write({ uid: "u1", pro: true, verifiedAt: T0 });
    expect(await cache.read()).toEqual({ uid: "u1", pro: true, verifiedAt: T0 });
    expect((await db.kv.get(ENTITLEMENT_CACHE_KEY))?.value).toBeTruthy();
    await cache.clear();
    expect(await cache.read()).toBeNull();
    db.close();
    await db.delete();
  });

  it("reads pro from entitlement docs strictly", () => {
    expect(proFromDoc({ pro: true, source: "subscription" })).toBe(true);
    expect(proFromDoc({ pro: "true" })).toBe(false);
    expect(proFromDoc(null)).toBe(false);
  });
});

describe("startPayments (T7.2)", () => {
  // @req PAY-003
  it("mirrors the server entitlement doc and caches each verification", async () => {
    const h = harness(null);
    await h.session.ready;
    expect(h.pro.value).toBe(false);
    h.setAuth({ uid: "u1", initialized: true });
    expect(h.remote.listeners.map((l) => l.path)).toEqual([entPath("u1")]);

    h.remote.serverWrite(entPath("u1"), { pro: true, source: "subscription" }, true);
    expect(h.pro.value).toBe(false); // cached snapshots don't verify
    h.remote.serverWrite(entPath("u1"), { pro: true, source: "subscription" });
    expect(h.pro.value).toBe(true);
    expect(h.cache.value).toEqual({ uid: "u1", pro: true, verifiedAt: T0 });

    h.advance(DAY);
    h.remote.serverWrite(entPath("u1"), { pro: false, source: "none" });
    expect(h.pro.value).toBe(false);
    expect(h.cache.value).toEqual({ uid: "u1", pro: false, verifiedAt: T0 + DAY });

    h.setAuth({ uid: "u1", initialized: true }); // same user: listener kept
    expect(h.remote.listeners).toHaveLength(1);
  });

  // @req PAY-003
  it("keeps a verified Pro offline within the grace period, not after", async () => {
    const fresh = harness({ uid: "u1", pro: true, verifiedAt: T0 - 13 * DAY });
    await fresh.session.ready;
    expect(fresh.pro.value).toBe(true); // before auth is known (offline start-up)
    fresh.setAuth({ uid: "u1", initialized: true });
    expect(fresh.pro.value).toBe(true);
    fresh.remote.listeners[0]!.error(new Error("unavailable"));
    expect(fresh.pro.value).toBe(true); // listener failure keeps the cached state
    fresh.session.stop();

    const stale = harness({ uid: "u1", pro: true, verifiedAt: T0 - 15 * DAY });
    await stale.session.ready;
    expect(stale.pro.value).toBe(false);
  });

  it("drops Pro on sign-out and when another user signs in", async () => {
    const h = harness({ uid: "u1", pro: true, verifiedAt: T0 }, { uid: "u1", initialized: true });
    await h.session.ready;
    expect(h.pro.value).toBe(true);
    h.setAuth({ uid: "u2", initialized: true });
    expect(h.pro.value).toBe(false);
    expect(h.remote.listeners.map((l) => l.path)).toEqual([entPath("u2")]);
    h.remote.serverWrite(entPath("u1"), { pro: true }); // old listener is gone
    expect(h.pro.value).toBe(false);
    h.setAuth({ uid: null, initialized: true });
    expect(h.pro.value).toBe(false);
    expect(h.remote.listeners).toHaveLength(0);
  });

  it("is idempotent and stoppable", async () => {
    const h = harness(null);
    expect(startPayments()).toBe(h.session);
    h.session.stop();
    expect(h.subs.size).toBe(0);
    h.setAuth({ uid: "u1", initialized: true });
    expect(h.remote.listeners).toHaveLength(0);
  });

  it("does nothing if stopped before the cache is read", async () => {
    const h = harness({ uid: "u1", pro: true, verifiedAt: T0 });
    h.session.stop();
    await h.session.ready;
    expect(h.pro.value).toBe(false);
  });

  it("survives cache read/write failures", async () => {
    const remote = fakeRemote();
    const setPro = vi.fn();
    const s = startPayments({
      remote,
      cache: {
        read: () => Promise.reject(new Error("idb")),
        write: () => Promise.reject(new Error("idb")),
        clear: async () => {},
      },
      now: () => T0,
      authState: () => ({ uid: "u9", initialized: true }),
      subscribeAuth: () => () => {},
      setPro,
    });
    await s.ready;
    remote.serverWrite(entPath("u9"), { pro: true });
    expect(setPro).toHaveBeenLastCalledWith(true);
  });

  it("useEntitlementSync starts the default session when cloud is configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_USE_EMULATORS", "1");
    try {
      renderHook(() => useEntitlementSync());
      const s = startPayments();
      await s.ready;
      expect(startPayments()).toBe(s);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("useEntitlementSync does not start without cloud config", () => {
    renderHook(() => useEntitlementSync());
    const h = harness(null);
    expect(startPayments()).toBe(h.session); // the hook did not start its own session first
  });
});
