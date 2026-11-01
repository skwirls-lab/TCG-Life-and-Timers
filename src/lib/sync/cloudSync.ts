"use client";
/**
 * Wires the sync engine to Dexie + Firestore for the signed-in (non-anonymous) user (T4.3).
 * Firebase is loaded lazily via src/lib/firebase/client.ts (PERF-003).
 */
import type { Firestore } from "firebase/firestore";
import { getDb as getLocalDb, type TcgDb } from "@/lib/db";
import { can } from "@/lib/entitlements/policy";
import { useEntitlements } from "@/lib/entitlements/store";
import { dexieKv, localAdapters, settingsAdapter } from "./dexieLocal";
import { createSyncEngine, kvKeys, type SyncEngine } from "./engine";
import { remoteAdapters, type FirestoreApi, type RemoteContext } from "./firestoreRemote";
import { useSyncStatus } from "./status";
import type { CollectionSpec, NetworkMonitor } from "./types";

export interface SyncUser {
  uid: string;
  displayName: string | null;
}

export interface StartSyncDeps {
  fs: FirestoreApi;
  firestore: Firestore;
  db?: TcgDb;
  network?: NetworkMonitor;
  historySync?: boolean;
  onSettingsApplied?: () => void;
  debounceMs?: number;
}

export function browserNetwork(): NetworkMonitor {
  return {
    isOnline: () => typeof navigator === "undefined" || navigator.onLine !== false,
    subscribe(onChange) {
      if (typeof window === "undefined") return () => {};
      const on = () => onChange(true);
      const off = () => onChange(false);
      window.addEventListener("online", on);
      window.addEventListener("offline", off);
      return () => {
        window.removeEventListener("online", on);
        window.removeEventListener("offline", off);
      };
    },
  };
}

const warn = (msg: string, detail?: unknown) => {
  if (process.env.NODE_ENV !== "test") console.warn(msg, detail ?? "");
};

/** Synced collections for a user; game records only with `can('historySync')` (PRD §17.2). */
export function buildCollections(
  user: SyncUser,
  deps: StartSyncDeps & { db: TcgDb },
): CollectionSpec[] {
  const ctx: RemoteContext = { fs: deps.fs, db: deps.firestore, uid: user.uid, log: warn };
  const db = deps.db;
  const specs: CollectionSpec[] = [
    {
      name: "profiles",
      local: localAdapters.profiles(db, warn),
      remote: remoteAdapters.profiles(ctx),
    },
    { name: "decks", local: localAdapters.decks(db, warn), remote: remoteAdapters.decks(ctx) },
    {
      name: "presets",
      local: localAdapters.presets(db, warn),
      remote: remoteAdapters.presets(ctx),
    },
    {
      name: "settings",
      local: settingsAdapter(db, { log: warn, onApplied: deps.onSettingsApplied }),
      remote: remoteAdapters.settings(ctx, () => user.displayName ?? ""),
    },
    { name: "art", local: localAdapters.art(db, warn), remote: remoteAdapters.art(ctx) },
  ];
  const history = deps.historySync ?? can(useEntitlements.getState(), "historySync");
  if (history)
    specs.push({
      name: "records",
      local: localAdapters.records(db, warn),
      remote: remoteAdapters.records(ctx),
      writeOnce: true,
    });
  return specs;
}

/** Create and start an engine for `user`. Status flows into `useSyncStatus`. */
export async function startUserSync(user: SyncUser, deps: StartSyncDeps): Promise<SyncEngine> {
  const db = deps.db ?? getLocalDb();
  const engine = createSyncEngine({
    scope: user.uid,
    collections: buildCollections(user, { ...deps, db }),
    kv: dexieKv(db),
    network: deps.network ?? browserNetwork(),
    debounceMs: deps.debounceMs,
    log: warn,
    onStatus: (s) => useSyncStatus.getState().set({ ...s, active: true }),
  });
  await engine.start();
  return engine;
}

/** Forget all persisted sync state (queue, shadows) for every user on this device. */
export async function clearSyncState(db: TcgDb = getLocalDb()): Promise<void> {
  await db.kv.where("key").startsWith(kvKeys.prefix).delete();
}
