// @vitest-environment node
// @req ART-006 @req ART-009
import { afterEach, describe, expect, it } from "vitest";
import { bytesBlob, closeArtDbs, freshArtDb } from "../../../tests/unit/helpers/art";
import { clearImageCache, formatBytes, imageCacheSize, type CacheStorageLike } from "./imageCache";
import { cacheRemoteArt, getArt, saveUpload } from "./repo";

afterEach(closeArtDbs);

function fakeCaches(content: Record<string, number[]>): CacheStorageLike & {
  names: () => string[];
} {
  const store = new Map(Object.entries(content));
  return {
    names: () => [...store.keys()],
    keys: async () => [...store.keys()],
    delete: async (name) => store.delete(name),
    open: async (name) => {
      const sizes = store.get(name) ?? [];
      const reqs = sizes.map((_, i) => ({ url: `https://x/${i}` }) as unknown as Request);
      return {
        keys: async () => reqs,
        match: async (req: Request) => {
          const i = reqs.indexOf(req);
          const len = String(sizes[i] ?? 0);
          return {
            headers: { get: (h: string) => (h === "content-length" ? len : null) },
          } as unknown as Response;
        },
      };
    },
  };
}

const okFetch = (blob: Blob) => async () =>
  ({ ok: true, status: 200, blob: async () => blob }) as unknown as Response;

describe("image cache (A-11e)", () => {
  it("sizes and clears the Scryfall caches and offline copies, keeping uploads", async () => {
    const db = freshArtDb();
    const upload = await saveUpload({ blob: bytesBlob(10), width: 1, height: 1, name: "x" }, db, 1);
    await cacheRemoteArt("https://cards.scryfall.io/a.jpg", {
      db,
      fetch: okFetch(bytesBlob(2048, "image/jpeg")),
      now: 2,
    });
    const caches = fakeCaches({
      "scryfall-images": [1000, 3000],
      "scryfall-api": [500],
      "app-shell": [99999],
    });
    expect(await imageCacheSize({ db, caches })).toEqual({ bytes: 2048 + 4500, entries: 4 });
    const removed = await clearImageCache({ db, caches });
    expect(removed.bytes).toBe(6548);
    expect(caches.names()).toEqual(["app-shell"]);
    expect(await imageCacheSize({ db, caches })).toEqual({ bytes: 0, entries: 0 });
    expect(await getArt(upload.id, db)).toBeDefined();
  });

  it("works without CacheStorage and formats sizes", async () => {
    const db = freshArtDb();
    expect(await imageCacheSize({ db, caches: null })).toEqual({ bytes: 0, entries: 0 });
    expect(formatBytes(0)).toBe("0 KB");
    expect(formatBytes(1500)).toBe("1 KB");
    expect(formatBytes(3.5 * 1024 * 1024)).toBe("3.5 MB");
  });
});
