// @vitest-environment node
// @req ART-022 @req ART-024 @req SEC-004 @req LEG-005
import { afterEach, describe, expect, it, vi } from "vitest";
import { bytesBlob, closeArtDbs, freshArtDb } from "../../../tests/unit/helpers/art";
import { artMapper } from "@/lib/sync/mappers";
import {
  artQuota,
  deleteArtEverywhere,
  downloadArtBlob,
  extFor,
  firebaseArtStorage,
  ownsPath,
  pendingUploads,
  uploadPendingArt,
  type ArtStorageApi,
} from "./cloud";
import { getArt, saveUpload, type ArtRow } from "./repo";

afterEach(closeArtDbs);

function memoryStorage() {
  const files = new Map<string, { blob: Blob; contentType: string }>();
  const api: ArtStorageApi & { files: typeof files } = {
    files,
    put: vi.fn(async (path: string, blob: Blob, contentType: string) => {
      files.set(path, { blob, contentType });
    }),
    get: vi.fn(async (path: string) => {
      const f = files.get(path);
      if (!f) throw new Error("storage/object-not-found");
      return f.blob;
    }),
    remove: vi.fn(async (path: string) => {
      files.delete(path);
    }),
  };
  return api;
}

const up = (db: ReturnType<typeof freshArtDb>, name: string, at: number, type = "image/webp") =>
  saveUpload(
    { blob: bytesBlob(32, type), width: 100, height: 50, name, contentType: type },
    db,
    at,
  );

describe("cloud art upload (ART-022, SEC-004)", () => {
  // @req ART-022
  it("uploads pending blobs to users/{uid}/art/{id}.{ext} and sets meta.storagePath", async () => {
    const db = freshArtDb();
    const a = await up(db, "a", 1);
    const b = await up(db, "b", 2, "image/jpeg");
    const api = memoryStorage();
    const res = await uploadPendingArt({ api, uid: "u1", limit: 10, db, now: () => 100 });
    expect(res).toEqual({ uploaded: [a.id, b.id], overQuota: [], failed: [] });
    expect(api.files.get(`users/u1/art/${a.id}.webp`)?.contentType).toBe("image/webp");
    expect(api.files.get(`users/u1/art/${b.id}.jpg`)?.contentType).toBe("image/jpeg");
    const rowA = (await getArt(a.id, db))!;
    expect(rowA.meta).toMatchObject({ storagePath: `users/u1/art/${a.id}.webp`, updatedAt: 100 });
    // once uploaded, the sync mapper produces a valid metadata item
    expect(artMapper.toItem(rowA)).toMatchObject({
      id: a.id,
      data: { storagePath: `users/u1/art/${a.id}.webp`, width: 100, height: 50, bytes: 32 },
    });
    // idempotent
    expect((await uploadPendingArt({ api, uid: "u1", limit: 10, db })).uploaded).toEqual([]);
    // a different account re-uploads under its own prefix
    expect((await uploadPendingArt({ api, uid: "u2", limit: 10, db })).uploaded).toHaveLength(2);
  });

  // @req ART-024
  it("over the quota, new images stay local only and are flagged", async () => {
    const db = freshArtDb();
    const ids = [];
    for (let i = 0; i < 3; i++) ids.push((await up(db, `i${i}`, i)).id);
    const api = memoryStorage();
    const res = await uploadPendingArt({ api, uid: "u", limit: 2, db });
    expect(res.uploaded).toEqual(ids.slice(0, 2));
    expect(res.overQuota).toEqual([ids[2]]);
    const rows = (await db.art.toArray()) as ArtRow[];
    expect(artQuota(rows, 2)).toEqual({ used: 2, limit: 2, remaining: 0, overQuota: 1 });
    expect((await getArt(ids[2]!, db))?.meta.cloud).toBe("overQuota");
    expect(artMapper.toItem((await getArt(ids[2]!, db))!)).toBeNull(); // never synced
    // a second pass does not rewrite the flag
    await uploadPendingArt({ api, uid: "u", limit: 2, db });
    // raising the limit (Pro) uploads it and clears the flag
    const more = await uploadPendingArt({ api, uid: "u", limit: 200, db });
    expect(more.uploaded).toEqual([ids[2]]);
    expect((await getArt(ids[2]!, db))?.meta.cloud).toBeUndefined();
  });

  // @req SEC-004
  it("refuses rows that the storage rules would reject, and records upload failures", async () => {
    const db = freshArtDb();
    await db.art.put({
      id: "big",
      blob: bytesBlob(2 * 1024 * 1024 + 1),
      meta: { source: "upload", width: 1, height: 1, contentType: "image/webp", createdAt: 1 },
    });
    await db.art.put({
      id: "txt",
      blob: new Blob(["hello"], { type: "text/plain" }),
      meta: { source: "upload", width: 1, height: 1, contentType: "text/plain", createdAt: 2 },
    });
    const ok = await up(db, "ok", 3);
    const api = memoryStorage();
    api.put = vi.fn(async () => {
      throw new Error("storage/retry-limit-exceeded");
    });
    const res = await uploadPendingArt({ api, uid: "u", limit: 10, db });
    expect(res.failed.sort()).toEqual(["big", "txt", ok.id].sort());
    expect((await getArt("big", db))?.meta.cloud).toBe("error");
    expect(api.put).toHaveBeenCalledTimes(1);
  });

  it("skips Scryfall copies, empty and remote-only rows", async () => {
    const rows: ArtRow[] = [
      { id: "s", blob: bytesBlob(3), meta: { source: "scryfall", url: "https://x" } },
      { id: "e", blob: bytesBlob(0), meta: {} },
      { id: "r", blob: bytesBlob(3), meta: { remoteOnly: true } },
      { id: "o", blob: bytesBlob(3), meta: { storagePath: "users/u/art/o.webp" } },
      { id: "p", blob: bytesBlob(3), meta: {} },
    ];
    expect(pendingUploads(rows, "u").map((r) => r.id)).toEqual(["p"]);
    expect(artQuota(rows, 10).used).toBe(1);
  });

  it("helpers: extension per type, owner prefix", () => {
    expect(extFor("image/jpeg")).toBe("jpg");
    expect(extFor("image/png")).toBe("png");
    expect(extFor("image/webp")).toBe("webp");
    expect(extFor(undefined)).toBe("webp");
    expect(ownsPath("users/u/art/x.webp", "u")).toBe(true);
    expect(ownsPath("users/v/art/x.webp", "u")).toBe(false);
    expect(ownsPath(undefined, "u")).toBe(false);
  });
});

describe("download on demand and delete", () => {
  // @req ART-022
  it("downloads a remote-only blob without bumping updatedAt", async () => {
    const db = freshArtDb();
    const api = memoryStorage();
    api.files.set("users/u/art/r.webp", { blob: bytesBlob(12, ""), contentType: "image/webp" });
    await db.art.put({
      id: "r",
      blob: bytesBlob(0),
      meta: {
        remoteOnly: true,
        storagePath: "users/u/art/r.webp",
        contentType: "image/webp",
        updatedAt: 77,
      },
    });
    expect(await downloadArtBlob("r", { api, db })).toBe(true);
    const row = (await getArt("r", db))!;
    expect(row.blob.size).toBe(12);
    expect(row.blob.type).toBe("image/webp");
    expect(row.meta.remoteOnly).toBeUndefined();
    expect(row.meta.updatedAt).toBe(77);
    // already local → true without fetching again
    expect(await downloadArtBlob("r", { api, db })).toBe(true);
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it("returns false for unknown rows, rows without a path, missing objects and empty data", async () => {
    const db = freshArtDb();
    const api = memoryStorage();
    expect(await downloadArtBlob("nope", { api, db })).toBe(false);
    await db.art.put({ id: "np", blob: bytesBlob(0), meta: { remoteOnly: true } });
    expect(await downloadArtBlob("np", { api, db })).toBe(false);
    await db.art.put({
      id: "gone",
      blob: bytesBlob(0),
      meta: { remoteOnly: true, storagePath: "users/u/art/gone.webp" },
    });
    expect(await downloadArtBlob("gone", { api, db })).toBe(false);
    api.files.set("users/u/art/empty.webp", { blob: bytesBlob(0), contentType: "image/webp" });
    await db.art.put({
      id: "empty",
      blob: bytesBlob(0),
      meta: { remoteOnly: true, storagePath: "users/u/art/empty.webp" },
    });
    expect(await downloadArtBlob("empty", { api, db })).toBe(false);
  });

  // @req LEG-005
  it("deletes locally and removes the owner's Storage object", async () => {
    const db = freshArtDb();
    const api = memoryStorage();
    const a = await up(db, "a", 1);
    await uploadPendingArt({ api, uid: "u", limit: 10, db });
    expect(api.files.size).toBe(1);
    await deleteArtEverywhere(a.id, { api, uid: "u", db });
    expect(await getArt(a.id, db)).toBeUndefined();
    expect(api.files.size).toBe(0);
    // local-only delete (signed out) and a failing remove are fine
    const b = await up(db, "b", 2);
    await deleteArtEverywhere(b.id, { db });
    expect(await db.art.count()).toBe(0);
    api.remove = vi.fn(async () => {
      throw new Error("x");
    });
    await db.art.put({ id: "c", blob: bytesBlob(1), meta: { storagePath: "users/u/art/c.webp" } });
    await expect(deleteArtEverywhere("c", { api, uid: "u", db })).resolves.toBeUndefined();
  });

  it("adapts the modular Firebase Storage API", async () => {
    const calls: string[] = [];
    const fns = {
      ref: (_s: string, path: string) => `ref:${path}`,
      uploadBytes: async (r: string, _d: Blob, m: { contentType: string }) => {
        calls.push(`up ${r} ${m.contentType}`);
      },
      getBytes: async (r: string) => {
        calls.push(`get ${r}`);
        return new Uint8Array([1, 2, 3]).buffer;
      },
      deleteObject: async (r: string) => {
        calls.push(`del ${r}`);
      },
    };
    const api = firebaseArtStorage(fns, "storage");
    await api.put("p", bytesBlob(1), "image/webp");
    expect((await api.get("p")).size).toBe(3);
    await api.remove("p");
    expect(calls).toEqual(["up ref:p image/webp", "get ref:p", "del ref:p"]);
  });
});
