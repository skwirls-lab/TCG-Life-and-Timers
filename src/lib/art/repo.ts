/**
 * The Dexie `art` table (ART-009, ART-020..023): uploaded images and offline copies of chosen
 * Scryfall art. Row shape: `{ id, blob, meta }`.
 *
 * - Uploads: `meta.source = "upload"` (or absent for rows that arrived by sync), with name, width,
 *   height, bytes, contentType, createdAt, updatedAt. Cloud state: `storagePath` (set after the
 *   Storage upload; the sync engine syncs metadata from then on), `remoteOnly` (blob not on this
 *   device yet, D-053) and `cloud` ("overQuota" | "error" when kept local only).
 * - Scryfall copies: `meta.source = "scryfall"`, `url`, `usedAt`. Never synced (no storagePath).
 */
import { nanoid } from "nanoid";
import { getDb, type StoredArt, type TcgDb } from "@/lib/db";
import { LIMITS } from "@/lib/firebase/docs";

export type ArtSource = "upload" | "scryfall";
export type CloudState = "overQuota" | "error";

export interface ArtMeta {
  source?: ArtSource;
  name?: string;
  width?: number;
  height?: number;
  bytes?: number;
  contentType?: string;
  createdAt?: number;
  updatedAt?: number;
  storagePath?: string;
  remoteOnly?: boolean;
  cloud?: CloudState;
  url?: string;
  usedAt?: number;
  [k: string]: unknown;
}

export interface ArtRow extends StoredArt {
  meta: ArtMeta;
}

/** How many offline Scryfall copies to keep (least recently used are evicted). */
export const MAX_REMOTE_COPIES = 60;
export const MAX_ART_NAME = LIMITS.artNameMax;

export function isUploadRow(row: StoredArt): boolean {
  return (row.meta as ArtMeta).source !== "scryfall";
}

/** Uploaded images (incl. rows synced from another device), newest first. */
export async function listUploads(db: TcgDb = getDb()): Promise<ArtRow[]> {
  const rows = (await db.art.toArray()) as ArtRow[];
  return rows
    .filter(isUploadRow)
    .sort(
      (a, b) =>
        (b.meta.createdAt ?? b.meta.updatedAt ?? 0) - (a.meta.createdAt ?? a.meta.updatedAt ?? 0),
    );
}

export async function getArt(id: string, db: TcgDb = getDb()): Promise<ArtRow | undefined> {
  return (await db.art.get(id)) as ArtRow | undefined;
}

/** Trimmed, collapsed, length-limited image name (falls back to `fallback`). */
export function cleanArtName(name: string, fallback = "Image"): string {
  const n = name.replace(/\s+/g, " ").trim().slice(0, MAX_ART_NAME).trim();
  return n || fallback.slice(0, MAX_ART_NAME);
}

/** Base name of an uploaded file without its extension. */
export function nameFromFile(fileName: string | undefined, fallback = "Image"): string {
  const base = (fileName ?? "").replace(/\.[A-Za-z0-9]{1,5}$/, "");
  return cleanArtName(base, fallback);
}

export interface SaveUploadInput {
  blob: Blob;
  width: number;
  height: number;
  name: string;
  contentType?: string;
}

/** Store a processed upload (ART-022: local blob works for guests). */
export async function saveUpload(
  input: SaveUploadInput,
  db: TcgDb = getDb(),
  now: number = Date.now(),
): Promise<ArtRow> {
  const row: ArtRow = {
    id: nanoid(),
    blob: input.blob,
    meta: {
      source: "upload",
      name: cleanArtName(input.name),
      width: Math.max(1, Math.round(input.width)),
      height: Math.max(1, Math.round(input.height)),
      bytes: input.blob.size,
      contentType: input.contentType ?? (input.blob.type || "image/webp"),
      createdAt: now,
      updatedAt: now,
    },
  };
  await db.art.put(row);
  return row;
}

/** Rename an image (bumps updatedAt so the new name syncs). */
export async function renameArt(
  id: string,
  name: string,
  db: TcgDb = getDb(),
  now: number = Date.now(),
): Promise<ArtRow | undefined> {
  const row = await getArt(id, db);
  if (!row) return undefined;
  const next: ArtRow = { ...row, meta: { ...row.meta, name: cleanArtName(name), updatedAt: now } };
  await db.art.put(next);
  return next;
}

// ---------------------------------------------------------------------------------------------
// Offline copies of chosen Scryfall art (ART-009)
// ---------------------------------------------------------------------------------------------

/** FNV-1a 32-bit, hex: stable short id for a URL. */
export function hashString(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function remoteCopyId(url: string): string {
  return `sf_${hashString(url)}_${url.length}`;
}

export async function getRemoteCopy(url: string, db: TcgDb = getDb()): Promise<ArtRow | undefined> {
  const row = await getArt(remoteCopyId(url), db);
  return row && row.meta.url === url && row.blob.size > 0 ? row : undefined;
}

/** Only https image URLs are fetched for offline copies. */
export function isCacheableUrl(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

export interface CacheRemoteOptions {
  db?: TcgDb;
  fetch?: typeof fetch;
  now?: number;
  maxCopies?: number;
}

/**
 * Copy a chosen remote image into IndexedDB so it survives offline (ART-009; the service worker
 * cache is the backup). Returns false when it could not be fetched (CORS, offline, not an image).
 */
export async function cacheRemoteArt(url: string, opts: CacheRemoteOptions = {}): Promise<boolean> {
  const db = opts.db ?? getDb();
  const now = opts.now ?? Date.now();
  if (!isCacheableUrl(url)) return false;
  const existing = await getRemoteCopy(url, db);
  if (existing) {
    await db.art.put({ ...existing, meta: { ...existing.meta, usedAt: now } });
    return true;
  }
  const doFetch = opts.fetch ?? ((u: string) => globalThis.fetch(u, { mode: "cors" }));
  let blob: Blob;
  try {
    const res = await doFetch(url);
    if (!res.ok) return false;
    blob = await res.blob();
  } catch {
    return false;
  }
  if (blob.size === 0 || (blob.type && !blob.type.startsWith("image/"))) return false;
  await db.art.put({
    id: remoteCopyId(url),
    blob,
    meta: {
      source: "scryfall",
      url,
      bytes: blob.size,
      contentType: blob.type || "image/jpeg",
      createdAt: now,
      usedAt: now,
    },
  });
  await pruneRemoteCopies(opts.maxCopies ?? MAX_REMOTE_COPIES, db);
  return true;
}

/** Keep at most `max` Scryfall copies (least recently used go first). */
export async function pruneRemoteCopies(max: number, db: TcgDb = getDb()): Promise<number> {
  const copies = ((await db.art.toArray()) as ArtRow[]).filter((r) => r.meta.source === "scryfall");
  if (copies.length <= max) return 0;
  copies.sort((a, b) => (a.meta.usedAt ?? 0) - (b.meta.usedAt ?? 0));
  const drop = copies.slice(0, copies.length - max).map((r) => r.id);
  await db.art.bulkDelete(drop);
  return drop.length;
}
