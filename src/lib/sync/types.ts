/**
 * Storage-agnostic sync contracts (T4.3, SYNC-002). The engine in ./engine.ts only talks to these
 * interfaces, so it is unit-tested with in-memory adapters; Dexie and Firestore adapters live in
 * ./dexieLocal.ts and ./firestoreRemote.ts.
 */

/** JSON-compatible value (what Firestore and IndexedDB both store). */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };

/**
 * One synced document in the remote ("client data") shape of src/lib/firebase/docs.ts, without
 * `updatedAt` / `deleted` (those are carried alongside).
 */
export interface SyncItem {
  id: string;
  /** Parent document id for nested collections (decks live under their profile). */
  parent?: string;
  /** Epoch ms. Local: the row's own clock. Remote: the server timestamp of the last write. */
  updatedAt: number;
  /** Tombstone (SYNC-002 deletes propagate as `deleted: true`). */
  deleted: boolean;
  data: JsonObject;
}

export type Unsubscribe = () => void;

/** The device-side half of one collection. */
export interface LocalAdapter {
  /** Current local documents (live ones only; a missing id means "deleted locally"). */
  list(): Promise<SyncItem[]>;
  /** Write a remote change locally: upsert, or delete when `item.deleted`. */
  apply(item: SyncItem): Promise<void>;
  /** Call `onChange` whenever local data may have changed. */
  subscribe(onChange: () => void): Unsubscribe;
}

export interface RemoteSnapshot {
  items: SyncItem[];
  /** False while the data only comes from a local cache (not yet confirmed by the server). */
  fromServer: boolean;
}

/** The cloud-side half of one collection. */
export interface RemoteAdapter {
  /** Full-collection listener: every call carries the complete current set. */
  subscribe(
    onSnapshot: (snap: RemoteSnapshot) => void,
    onError: (err: unknown) => void,
  ): Unsubscribe;
  /** Upsert (or tombstone when `item.deleted`); the server stamps `updatedAt`. */
  write(item: SyncItem): Promise<void>;
}

export interface CollectionSpec {
  name: string;
  local: LocalAdapter;
  remote: RemoteAdapter;
  /** Write-once documents (game records, SYNC-003): only creates and tombstones are pushed. */
  writeOnce?: boolean;
}

/** Minimal persisted key/value store (Dexie `kv` in production). */
export interface KvStore {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
}

export type SyncState = "idle" | "syncing" | "offline" | "error";

export interface SyncStatus {
  state: SyncState;
  /** Epoch ms of the last moment everything was confirmed in sync. */
  lastSyncedAt: number | null;
  /** Pending local writes not yet confirmed by the server. */
  pending: number;
  error: string | null;
}

export interface NetworkMonitor {
  isOnline(): boolean;
  /** Subscribe to online/offline transitions. */
  subscribe(onChange: (online: boolean) => void): Unsubscribe;
}

export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}
