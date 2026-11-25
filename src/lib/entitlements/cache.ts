/**
 * Offline entitlement cache (PAY-003): the last server-verified entitlement is kept in Dexie kv
 * so an offline Pro user keeps Pro for 14 days after the last verification.
 */
import { getDb, type TcgDb } from "@/lib/db";
import { parseDetails, type ProDetails } from "./details";

export const ENTITLEMENT_CACHE_KEY = "pay:entitlement";
export const GRACE_MS = 14 * 24 * 60 * 60 * 1000;

export interface EntitlementCache {
  uid: string;
  pro: boolean;
  /** epoch ms of the last server-confirmed entitlement read */
  verifiedAt: number;
  /** plan / renewal display details of that read (absent in caches written before them) */
  details?: ProDetails | null;
}

export function parseCache(v: unknown): EntitlementCache | null {
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.uid !== "string" || typeof o.pro !== "boolean") return null;
  if (typeof o.verifiedAt !== "number" || !Number.isFinite(o.verifiedAt)) return null;
  const details = parseDetails(o.details);
  return { uid: o.uid, pro: o.pro, verifiedAt: o.verifiedAt, ...(details ? { details } : {}) };
}

/**
 * Pro from the cache: only while within the grace period, and (once the signed-in user is known)
 * only for that user. `uid === undefined` means "auth not known yet".
 */
export function proFromCache(
  cache: EntitlementCache | null,
  now: number,
  uid?: string | null,
): boolean {
  if (!cache?.pro) return false;
  if (uid !== undefined && uid !== cache.uid) return false;
  const age = now - cache.verifiedAt;
  return age >= 0 && age <= GRACE_MS;
}

export interface CacheStore {
  read(): Promise<EntitlementCache | null>;
  write(c: EntitlementCache): Promise<void>;
  clear(): Promise<void>;
}

export function dexieEntitlementCache(db: () => TcgDb = getDb): CacheStore {
  return {
    async read() {
      return parseCache((await db().kv.get(ENTITLEMENT_CACHE_KEY))?.value);
    },
    async write(c) {
      await db().kv.put({ key: ENTITLEMENT_CACHE_KEY, value: c });
    },
    async clear() {
      await db().kv.delete(ENTITLEMENT_CACHE_KEY);
    },
  };
}
