/**
 * Cloud art sync (T5.4; ART-022, ART-024, SEC-004, LEG-005).
 *
 * Binary images live in Cloud Storage at `users/{uid}/art/{id}.{webp|jpg}` (owner-only rules,
 * image/* under 2 MB). Once a blob is uploaded, `meta.storagePath` is set and the existing sync
 * engine (artMapper) syncs the metadata row; other devices receive a row with an empty blob and
 * `meta.remoteOnly` (D-053) and download the binary on demand (`downloadArtBlob`).
 *
 * Quota (ART-024): at most `limit` images are synced (free 10 / Pro 200). Beyond it, new uploads
 * stay local only and are marked `meta.cloud = "overQuota"` so the UI can show a notice.
 */
import { getDb, type TcgDb } from "@/lib/db";
import { artStoragePath, LIMITS } from "@/lib/firebase/docs";
import { getArt, isUploadRow, type ArtMeta, type ArtRow } from "./repo";

/** The slice of Cloud Storage this module needs (injectable for tests). */
export interface ArtStorageApi {
  put(path: string, blob: Blob, contentType: string): Promise<void>;
  get(path: string): Promise<Blob>;
  remove(path: string): Promise<void>;
}

/** The firebase/storage functions used by `firebaseArtStorage`. */
export interface FirebaseStorageFns<S, R> {
  ref(storage: S, path: string): R;
  uploadBytes(ref: R, data: Blob, metadata: { contentType: string }): Promise<unknown>;
  getBytes(ref: R): Promise<ArrayBuffer>;
  deleteObject(ref: R): Promise<void>;
}

/** Adapt the modular Firebase Storage SDK (works in browsers and Node). */
export function firebaseArtStorage<S, R>(fns: FirebaseStorageFns<S, R>, storage: S): ArtStorageApi {
  return {
    async put(path, blob, contentType) {
      await fns.uploadBytes(fns.ref(storage, path), blob, { contentType });
    },
    async get(path) {
      const buf = await fns.getBytes(fns.ref(storage, path));
      return new Blob([buf]);
    },
    async remove(path) {
      await fns.deleteObject(fns.ref(storage, path));
    },
  };
}

export const ART_CONTENT_TYPES = ["image/webp", "image/jpeg"] as const;

/** Storage file extension for a processed image's content type. */
export function extFor(contentType: string | undefined): string {
  return contentType === "image/jpeg" ? "jpg" : contentType === "image/png" ? "png" : "webp";
}

/** True when `path` is under this user's art prefix. */
export function ownsPath(path: string | undefined, uid: string): path is string {
  return typeof path === "string" && path.startsWith(`users/${uid}/art/`);
}

export interface ArtQuota {
  /** images in the cloud (uploaded here or synced from another device) */
  used: number;
  limit: number;
  remaining: number;
  /** local-only images that could not sync because of the quota */
  overQuota: number;
}

/** Quota summary over the upload rows (ART-024). */
export function artQuota(rows: readonly ArtRow[], limit: number): ArtQuota {
  const uploads = rows.filter(isUploadRow);
  const used = uploads.filter((r) => typeof r.meta.storagePath === "string").length;
  const overQuota = uploads.filter(
    (r) => typeof r.meta.storagePath !== "string" && r.meta.cloud === "overQuota",
  ).length;
  return { used, limit, remaining: Math.max(0, limit - used), overQuota };
}

/** Upload rows that still need their blob in this user's Storage. */
export function pendingUploads(rows: readonly ArtRow[], uid: string): ArtRow[] {
  return rows
    .filter(isUploadRow)
    .filter((r) => r.blob.size > 0 && !r.meta.remoteOnly && !ownsPath(r.meta.storagePath, uid))
    .sort((a, b) => (a.meta.createdAt ?? 0) - (b.meta.createdAt ?? 0));
}

export interface UploadDeps {
  api: ArtStorageApi;
  uid: string;
  limit: number;
  db?: TcgDb;
  now?: () => number;
}

export interface UploadResult {
  uploaded: string[];
  overQuota: string[];
  failed: string[];
}

function uploadable(row: ArtRow): boolean {
  const type = row.meta.contentType ?? row.blob.type;
  return (
    !!type &&
    /^image\/.+$/.test(type) &&
    row.blob.size > 0 &&
    row.blob.size <= LIMITS.artBytesMax &&
    (row.meta.width ?? 0) >= 1 &&
    (row.meta.height ?? 0) >= 1
  );
}

async function patchMeta(db: TcgDb, id: string, patch: (m: ArtMeta) => ArtMeta): Promise<void> {
  await db.transaction("rw", db.art, async () => {
    const row = (await db.art.get(id)) as ArtRow | undefined;
    if (!row) return;
    await db.art.put({ ...row, meta: patch(row.meta) });
  });
}

/**
 * Upload every pending blob (oldest first) while the quota allows. Each success sets
 * `meta.storagePath` (and bumps updatedAt) so the sync engine pushes the metadata.
 */
export async function uploadPendingArt(deps: UploadDeps): Promise<UploadResult> {
  const db = deps.db ?? getDb();
  const now = deps.now ?? (() => Date.now());
  const rows = (await db.art.toArray()) as ArtRow[];
  let used = artQuota(rows, deps.limit).used;
  const out: UploadResult = { uploaded: [], overQuota: [], failed: [] };
  for (const row of pendingUploads(rows, deps.uid)) {
    if (used >= deps.limit) {
      if (row.meta.cloud !== "overQuota")
        await patchMeta(db, row.id, (m) => ({ ...m, cloud: "overQuota" }));
      out.overQuota.push(row.id);
      continue;
    }
    if (!uploadable(row)) {
      await patchMeta(db, row.id, (m) => ({ ...m, cloud: "error" }));
      out.failed.push(row.id);
      continue;
    }
    const contentType = row.meta.contentType ?? row.blob.type;
    const path = artStoragePath(deps.uid, row.id, extFor(contentType));
    try {
      await deps.api.put(path, row.blob, contentType);
    } catch {
      await patchMeta(db, row.id, (m) => ({ ...m, cloud: "error" }));
      out.failed.push(row.id);
      continue;
    }
    await patchMeta(db, row.id, (m) => {
      const next: ArtMeta = {
        ...m,
        storagePath: path,
        updatedAt: Math.max(now(), (m.updatedAt ?? 0) + 1),
      };
      delete next.cloud;
      return next;
    });
    used++;
    out.uploaded.push(row.id);
  }
  return out;
}

/**
 * Fetch the binary of a remote-only row (synced from another device). Keeps `updatedAt`, so the
 * sync engine sees no local change. Returns true when the row has a usable blob afterwards.
 */
export async function downloadArtBlob(
  id: string,
  deps: { api: ArtStorageApi; db?: TcgDb },
): Promise<boolean> {
  const db = deps.db ?? getDb();
  const row = await getArt(id, db);
  if (!row) return false;
  if (row.blob.size > 0) return true;
  const path = row.meta.storagePath;
  if (typeof path !== "string") return false;
  let data: Blob;
  try {
    data = await deps.api.get(path);
  } catch {
    return false;
  }
  if (data.size === 0) return false;
  const type = row.meta.contentType ?? (data.type || "image/webp");
  const blob = data.type === type ? data : new Blob([data], { type });
  let ok = false;
  await db.transaction("rw", db.art, async () => {
    const cur = (await db.art.get(id)) as ArtRow | undefined;
    if (!cur) return;
    const meta: ArtMeta = { ...cur.meta };
    delete meta.remoteOnly;
    await db.art.put({ ...cur, blob, meta });
    ok = true;
  });
  return ok;
}

/** Delete an image locally and (best effort) its Storage object. Sync propagates the tombstone. */
export async function deleteArtEverywhere(
  id: string,
  deps: { api?: ArtStorageApi | null; uid?: string; db?: TcgDb } = {},
): Promise<void> {
  const db = deps.db ?? getDb();
  const row = await getArt(id, db);
  await db.art.delete(id);
  const path = row?.meta.storagePath;
  if (deps.api && deps.uid && ownsPath(path, deps.uid)) await deps.api.remove(path).catch(() => {});
}
