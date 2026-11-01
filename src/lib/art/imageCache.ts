/**
 * ART-006 / SET "Clear image cache" (A-11e): the space used by cached card art — the service
 * worker's `scryfall-*` caches (API answers and images) plus the offline copies of chosen Scryfall
 * art in IndexedDB (`sf_*` rows, ART-009). Clearing never touches the user's own uploads.
 */
import { getDb, type TcgDb } from "@/lib/db";
import type { ArtRow } from "./repo";

export const SCRYFALL_CACHE_PREFIX = "scryfall-";

/** The subset of CacheStorage this module uses (injectable for tests). */
export interface CacheStorageLike {
  keys(): Promise<string[]>;
  open(name: string): Promise<{
    keys(): Promise<readonly Request[]>;
    match(req: Request): Promise<Response | undefined>;
  }>;
  delete(name: string): Promise<boolean>;
}

export interface ImageCacheEnv {
  db?: TcgDb;
  caches?: CacheStorageLike | null;
}

const isCopy = (r: ArtRow) => r.meta.source === "scryfall" || r.id.startsWith("sf_");

function cacheStorage(env: ImageCacheEnv): CacheStorageLike | null {
  if (env.caches !== undefined) return env.caches;
  return typeof caches === "undefined" ? null : (caches as unknown as CacheStorageLike);
}

async function responseBytes(res: Response | undefined): Promise<number> {
  if (!res) return 0;
  const len = Number(res.headers.get("content-length"));
  if (Number.isFinite(len) && len > 0) return len;
  try {
    return (await res.clone().blob()).size;
  } catch {
    return 0;
  }
}

export interface ImageCacheSize {
  bytes: number;
  /** Cached responses + offline copies. */
  entries: number;
}

/** Bytes used by cached card art (best effort; opaque responses count as 0). */
export async function imageCacheSize(env: ImageCacheEnv = {}): Promise<ImageCacheSize> {
  const db = env.db ?? getDb();
  let bytes = 0;
  let entries = 0;
  const rows = ((await db.art.toArray()) as ArtRow[]).filter(isCopy);
  for (const r of rows) {
    bytes += r.meta.bytes ?? r.blob?.size ?? 0;
    entries++;
  }
  const cs = cacheStorage(env);
  if (cs) {
    for (const name of await cs.keys()) {
      if (!name.startsWith(SCRYFALL_CACHE_PREFIX)) continue;
      const cache = await cs.open(name);
      for (const req of await cache.keys()) {
        bytes += await responseBytes(await cache.match(req));
        entries++;
      }
    }
  }
  return { bytes, entries };
}

/** Delete the `scryfall-*` caches and the offline Scryfall copies; returns what was removed. */
export async function clearImageCache(env: ImageCacheEnv = {}): Promise<ImageCacheSize> {
  const before = await imageCacheSize(env);
  const db = env.db ?? getDb();
  const ids = ((await db.art.toArray()) as ArtRow[]).filter(isCopy).map((r) => r.id);
  if (ids.length) await db.art.bulkDelete(ids);
  const cs = cacheStorage(env);
  if (cs) {
    for (const name of await cs.keys()) {
      if (name.startsWith(SCRYFALL_CACHE_PREFIX)) await cs.delete(name);
    }
  }
  return before;
}

/** "3.2 MB" / "640 KB" / "0 KB". */
export function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n <= 0) return "0 KB";
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}
