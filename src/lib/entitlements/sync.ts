"use client";
/**
 * Entitlement sync (T7.2, PAY-003): while a user is signed in, listen to
 * `users/{uid}/private/entitlements` (written by the `syncEntitlements` function) and mirror
 * `pro` into the entitlement store. Every server-confirmed read is cached in Dexie kv; offline,
 * the cached Pro stays valid for 14 days after the last verification (GRACE_MS).
 *
 * `startPayments()` is idempotent; the cloud start-up (startCloud) and PaywallHost call it.
 */
import { useEffect } from "react";
import { useAuth } from "@/lib/auth/store";
import { isCloudConfigured } from "@/lib/firebase/config";
import { paths } from "@/lib/firebase/docs";
import {
  dexieEntitlementCache,
  proFromCache,
  type CacheStore,
  type EntitlementCache,
} from "./cache";
import { firebaseRemote, type RemotePort } from "./remote";
import { useEntitlements } from "./store";

export interface AuthView {
  uid: string | null;
  initialized: boolean;
}

export interface PaymentsDeps {
  remote: RemotePort;
  cache: CacheStore;
  now: () => number;
  authState: () => AuthView;
  subscribeAuth: (cb: () => void) => () => void;
  setPro: (pro: boolean) => void;
}

const defaultDeps = (): PaymentsDeps => ({
  remote: firebaseRemote(),
  cache: dexieEntitlementCache(),
  now: () => Date.now(),
  authState: () => {
    const s = useAuth.getState();
    return { uid: s.user?.uid ?? null, initialized: s.initialized };
  },
  subscribeAuth: (cb) => useAuth.subscribe(cb),
  setPro: (pro) => useEntitlements.getState().setPro(pro),
});

const warn = (msg: string, err?: unknown) => {
  if (process.env.NODE_ENV !== "test") console.warn(msg, err ?? "");
};

/** Pure: is a (server) entitlement doc Pro? Unknown shapes are not Pro. */
export function proFromDoc(data: Record<string, unknown> | null): boolean {
  return data?.pro === true;
}

interface Session {
  stop: () => void;
  ready: Promise<void>;
}

let session: Session | null = null;

/** Start mirroring entitlements. Returns a stop function (tests); safe to call many times. */
export function startPayments(overrides: Partial<PaymentsDeps> = {}): Session {
  if (session) return session;
  const deps = { ...defaultDeps(), ...overrides };
  let cache: EntitlementCache | null = null;
  let listenUid: string | null = null;
  let unsubDoc: (() => void) | null = null;
  let stopped = false;

  const stopDoc = () => {
    unsubDoc?.();
    unsubDoc = null;
    listenUid = null;
  };

  const onAuth = () => {
    if (stopped) return;
    const { uid, initialized } = deps.authState();
    if (!initialized) {
      // Auth not known yet (offline start-up): trust a fresh cache for now (PAY-003).
      deps.setPro(proFromCache(cache, deps.now()));
      return;
    }
    if (!uid) {
      stopDoc();
      deps.setPro(false);
      return;
    }
    if (listenUid === uid) return;
    stopDoc();
    listenUid = uid;
    deps.setPro(proFromCache(cache, deps.now(), uid));
    unsubDoc = deps.remote.onDoc(
      paths.entitlements(uid),
      (snap) => {
        if (snap.fromCache || listenUid !== uid) return; // only server-confirmed reads verify
        const pro = proFromDoc(snap.data);
        deps.setPro(pro);
        cache = { uid, pro, verifiedAt: deps.now() };
        deps.cache.write(cache).catch((e: unknown) => warn("pay: cache write failed", e));
      },
      (err) => warn("pay: entitlement listener failed (keeping cached state)", err),
    );
  };

  const ready = (async () => {
    cache = await deps.cache.read().catch(() => null);
    if (stopped) return;
    onAuth();
  })();
  const unsubAuth = deps.subscribeAuth(onAuth);

  session = {
    ready,
    stop: () => {
      stopped = true;
      unsubAuth();
      stopDoc();
      session = null;
    },
  };
  return session;
}

/** Test hook: forget the running session. */
export function resetPaymentsForTests(): void {
  session?.stop();
  session = null;
}

/** React entry point: start entitlement sync when this deployment has cloud config. */
export function useEntitlementSync(): void {
  useEffect(() => {
    if (!isCloudConfigured()) return;
    startPayments();
  }, []);
}
