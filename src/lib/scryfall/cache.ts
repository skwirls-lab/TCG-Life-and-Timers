import Dexie, { type Table } from "dexie";

/** A stored response and when it was stored (epoch ms). */
export interface CacheEntry<V = unknown> {
  value: V;
  storedAt: number;
}

/**
 * Minimal storage interface for the Scryfall response cache. Implementations must not throw
 * for a missing key; the client treats any thrown error as a cache miss.
 */
export interface KeyValueCache {
  get(key: string): Promise<CacheEntry | undefined>;
  set(key: string, value: unknown): Promise<void>;
}

/** Optional maintenance operations (Settings → "Clear image cache", ART-006). */
export interface ManagedCache extends KeyValueCache {
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  count(): Promise<number>;
}

export interface MemoryCacheOptions {
  now?: () => number;
  /** Oldest entries are evicted beyond this many. Default 500. */
  maxEntries?: number;
}

/** In-memory cache (tests, SSR, or when IndexedDB is unavailable). */
export function createMemoryCache(opts: MemoryCacheOptions = {}): ManagedCache {
  const now = opts.now ?? (() => Date.now());
  const maxEntries = opts.maxEntries ?? 500;
  const map = new Map<string, CacheEntry>();
  return {
    async get(key) {
      return map.get(key);
    },
    async set(key, value) {
      map.delete(key);
      map.set(key, { value, storedAt: now() });
      while (map.size > maxEntries) {
        const oldest = map.keys().next().value as string;
        map.delete(oldest);
      }
    },
    async delete(key) {
      map.delete(key);
    },
    async clear() {
      map.clear();
    },
    async count() {
      return map.size;
    },
  };
}

/** Name of the Dexie database owned by the Scryfall cache (separate from the app DB). */
export const SCRYFALL_CACHE_DB_NAME = "tcg-life-scryfall-cache";

interface CacheRow extends CacheEntry {
  key: string;
}

class ScryfallCacheDb extends Dexie {
  responses!: Table<CacheRow, string>;
  constructor(name: string) {
    super(name);
    this.version(1).stores({ responses: "key, storedAt" });
  }
}

export interface IndexedDbCacheOptions {
  dbName?: string;
  now?: () => number;
  /** Oldest entries are pruned beyond this many. Default 1000. */
  maxEntries?: number;
}

export interface IndexedDbCache extends ManagedCache {
  /** Delete entries stored before `before` (epoch ms). Returns how many were deleted. */
  prune(before: number): Promise<number>;
  close(): void;
}

/** IndexedDB-backed cache in its own tiny Dexie DB `tcg-life-scryfall-cache`. */
export function createIndexedDbCache(opts: IndexedDbCacheOptions = {}): IndexedDbCache {
  const db = new ScryfallCacheDb(opts.dbName ?? SCRYFALL_CACHE_DB_NAME);
  const now = opts.now ?? (() => Date.now());
  const maxEntries = opts.maxEntries ?? 1000;
  return {
    async get(key) {
      const row = await db.responses.get(key);
      return row ? { value: row.value, storedAt: row.storedAt } : undefined;
    },
    async set(key, value) {
      await db.responses.put({ key, value, storedAt: now() });
      const n = await db.responses.count();
      if (n > maxEntries) {
        const old = await db.responses
          .orderBy("storedAt")
          .limit(n - maxEntries)
          .primaryKeys();
        await db.responses.bulkDelete(old);
      }
    },
    async delete(key) {
      await db.responses.delete(key);
    },
    async clear() {
      await db.responses.clear();
    },
    async count() {
      return db.responses.count();
    },
    async prune(before) {
      return db.responses.where("storedAt").below(before).delete();
    },
    close() {
      db.close();
    },
  };
}
