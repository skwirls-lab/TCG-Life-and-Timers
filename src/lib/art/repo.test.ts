// @vitest-environment node
// @req ART-009 @req ART-022 @req ART-023
import { afterEach, describe, expect, it } from "vitest";
import { bytesBlob, closeArtDbs, freshArtDb } from "../../../tests/unit/helpers/art";
import {
  cacheRemoteArt,
  cleanArtName,
  getArt,
  getRemoteCopy,
  hashString,
  isCacheableUrl,
  isUploadRow,
  listUploads,
  nameFromFile,
  pruneRemoteCopies,
  remoteCopyId,
  renameArt,
  saveUpload,
} from "./repo";

afterEach(closeArtDbs);

const URL1 = "https://cards.scryfall.io/art_crop/front/a/b/ab.jpg?1";

/** jsdom Blobs can't go through undici's Response, so tests use a Response-like stub. */
function res(blob: Blob, ok = true): Response {
  return { ok, status: ok ? 200 : 404, blob: async () => blob } as unknown as Response;
}
function okFetch(blob: Blob) {
  return async () => res(blob);
}

describe("art repo", () => {
  // @req ART-022
  it("saves an upload with complete metadata and lists uploads newest first", async () => {
    const db = freshArtDb();
    const a = await saveUpload(
      { blob: bytesBlob(10), width: 1600.4, height: 900, name: "  My   deck art " },
      db,
      1000,
    );
    const b = await saveUpload(
      {
        blob: bytesBlob(20, "image/jpeg"),
        width: 10,
        height: 0,
        name: "",
        contentType: "image/jpeg",
      },
      db,
      2000,
    );
    expect(a.meta).toMatchObject({
      source: "upload",
      name: "My deck art",
      width: 1600,
      height: 900,
      bytes: 10,
      contentType: "image/webp",
      createdAt: 1000,
      updatedAt: 1000,
    });
    expect(b.meta).toMatchObject({ name: "Image", height: 1, contentType: "image/jpeg" });
    await cacheRemoteArt(URL1, { db, fetch: okFetch(bytesBlob(5, "image/jpeg")), now: 1 });
    const list = await listUploads(db);
    expect(list.map((r) => r.id)).toEqual([b.id, a.id]); // the Scryfall copy is excluded
    expect((await getArt(a.id, db))?.blob.size).toBe(10);
  });

  // @req ART-023
  it("renames (bumping updatedAt) and ignores unknown ids", async () => {
    const db = freshArtDb();
    const a = await saveUpload({ blob: bytesBlob(), width: 1, height: 1, name: "x" }, db, 1);
    const r = await renameArt(a.id, "Toxrill fan art", db, 50);
    expect(r?.meta).toMatchObject({ name: "Toxrill fan art", updatedAt: 50 });
    expect(await renameArt("nope", "y", db)).toBeUndefined();
  });

  it("cleans names and derives them from file names", () => {
    expect(cleanArtName("a".repeat(200)).length).toBe(80);
    expect(cleanArtName("   ", "Fallback")).toBe("Fallback");
    expect(nameFromFile("IMG_0001.JPEG")).toBe("IMG_0001");
    expect(nameFromFile(undefined, "Photo")).toBe("Photo");
    expect(nameFromFile("archive.tar.gz")).toBe("archive.tar");
  });

  it("treats rows without a source (synced from another device) as uploads", () => {
    expect(isUploadRow({ id: "x", blob: bytesBlob(0), meta: {} })).toBe(true);
    expect(isUploadRow({ id: "x", blob: bytesBlob(0), meta: { source: "scryfall" } })).toBe(false);
  });
});

describe("offline copies of chosen Scryfall art (ART-009)", () => {
  it("hashes URLs into stable ids", () => {
    expect(hashString("abc")).toBe(hashString("abc"));
    expect(hashString("abc")).not.toBe(hashString("abd"));
    expect(remoteCopyId(URL1)).toMatch(/^sf_[0-9a-f]{8}_\d+$/);
    expect(isCacheableUrl(URL1)).toBe(true);
    expect(isCacheableUrl("http://x.test/a.jpg")).toBe(false);
    expect(isCacheableUrl("not a url")).toBe(false);
  });

  // @req ART-009
  it("copies the image into IndexedDB once, then touches it", async () => {
    const db = freshArtDb();
    let calls = 0;
    const fetch = async () => {
      calls++;
      return res(bytesBlob(7, "image/jpeg"));
    };
    expect(await cacheRemoteArt(URL1, { db, fetch, now: 10 })).toBe(true);
    expect(await cacheRemoteArt(URL1, { db, fetch, now: 20 })).toBe(true);
    expect(calls).toBe(1);
    const copy = await getRemoteCopy(URL1, db);
    expect(copy?.blob.size).toBe(7);
    expect(copy?.meta).toMatchObject({ source: "scryfall", url: URL1, usedAt: 20 });
    expect(await getRemoteCopy("https://other.test/x.jpg", db)).toBeUndefined();
  });

  it("returns false on network errors, HTTP errors, empty or non-image bodies and bad URLs", async () => {
    const db = freshArtDb();
    const fail = async () => {
      throw new TypeError("Failed to fetch");
    };
    expect(await cacheRemoteArt(URL1, { db, fetch: fail })).toBe(false);
    expect(await cacheRemoteArt(URL1, { db, fetch: async () => res(bytesBlob(1), false) })).toBe(
      false,
    );
    expect(await cacheRemoteArt(URL1, { db, fetch: okFetch(bytesBlob(0)) })).toBe(false);
    expect(
      await cacheRemoteArt(URL1, {
        db,
        fetch: okFetch(new Blob(["<html>"], { type: "text/html" })),
      }),
    ).toBe(false);
    expect(await cacheRemoteArt("javascript:alert(1)", { db })).toBe(false);
    expect(await db.art.count()).toBe(0);
  });

  it("evicts the least recently used copies beyond the limit (uploads are never evicted)", async () => {
    const db = freshArtDb();
    await saveUpload({ blob: bytesBlob(), width: 1, height: 1, name: "keep" }, db, 0);
    for (let i = 0; i < 4; i++)
      await cacheRemoteArt(`https://cards.scryfall.io/${i}.jpg`, {
        db,
        fetch: okFetch(bytesBlob(3, "image/jpeg")),
        now: 100 + i,
        maxCopies: 3,
      });
    const rows = await db.art.toArray();
    expect(rows.length).toBe(4); // 1 upload + 3 copies
    expect(await getRemoteCopy("https://cards.scryfall.io/0.jpg", db)).toBeUndefined();
    expect(await pruneRemoteCopies(10, db)).toBe(0);
  });
});
