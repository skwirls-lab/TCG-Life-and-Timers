// @vitest-environment node
// @req ART-003 @req ART-009 @req ART-022
import { afterEach, describe, expect, it, vi } from "vitest";
import { bytesBlob, closeArtDbs, freshArtDb } from "../../../tests/unit/helpers/art";
import { cacheRemoteArt, saveUpload } from "./repo";
import { isImageArt, resolveArtUrl } from "./resolve";

afterEach(closeArtDbs);

const URL1 = "https://cards.scryfall.io/art_crop/front/x.jpg";

function urls() {
  let n = 0;
  const created: Blob[] = [];
  const revoked: string[] = [];
  return {
    created,
    revoked,
    createObjectURL: (b: Blob) => {
      created.push(b);
      return `blob:test/${++n}`;
    },
    revokeObjectURL: (u: string) => revoked.push(u),
  };
}

describe("resolveArtUrl", () => {
  it("CSS-only kinds and missing art resolve to no URL", async () => {
    const db = freshArtDb();
    for (const art of [
      undefined,
      { kind: "gradient", value: "linear-gradient(red, blue)" },
      { kind: "solid", value: "#fff" },
      { kind: "default", value: "" },
      { kind: "upload", value: "" },
    ] as const) {
      const r = await resolveArtUrl(art, { db });
      expect(r).toMatchObject({ url: undefined, source: "none" });
      r.revoke();
    }
    expect(isImageArt({ kind: "scryfall", value: URL1 })).toBe(true);
  });

  // @req ART-003
  it("scryfall: the remote URL when no offline copy exists; non-https is refused", async () => {
    const db = freshArtDb();
    const r = await resolveArtUrl({ kind: "scryfall", value: URL1 }, { db });
    expect(r).toMatchObject({ url: URL1, source: "remote" });
    r.revoke();
    expect((await resolveArtUrl({ kind: "scryfall", value: "javascript:x" }, { db })).url).toBe(
      undefined,
    );
  });

  // @req ART-009
  it("scryfall: the IndexedDB copy (object URL) once cached; revoke frees it once", async () => {
    const db = freshArtDb();
    const blob = bytesBlob(9, "image/jpeg");
    await cacheRemoteArt(URL1, {
      db,
      fetch: async () => ({ ok: true, blob: async () => blob }) as unknown as Response,
    });
    const u = urls();
    const r = await resolveArtUrl({ kind: "scryfall", value: URL1 }, { db, ...u });
    expect(r).toMatchObject({ url: "blob:test/1", source: "copy" });
    expect(u.created[0]?.size).toBe(9);
    r.revoke();
    r.revoke();
    expect(u.revoked).toEqual(["blob:test/1"]);
  });

  // @req ART-022
  it("upload: object URL of the stored blob; unknown id → none", async () => {
    const db = freshArtDb();
    const row = await saveUpload({ blob: bytesBlob(5), width: 2, height: 2, name: "a" }, db);
    const u = urls();
    const r = await resolveArtUrl({ kind: "upload", value: row.id }, { db, ...u });
    expect(r).toMatchObject({ url: "blob:test/1", source: "blob" });
    expect((await resolveArtUrl({ kind: "upload", value: "missing" }, { db, ...u })).source).toBe(
      "none",
    );
  });

  it("upload: a remote-only row is downloaded first when signed in", async () => {
    const db = freshArtDb();
    await db.art.put({
      id: "r1",
      blob: bytesBlob(0),
      meta: { remoteOnly: true, storagePath: "users/u/art/r1.webp" },
    });
    const u = urls();
    // signed out: nothing to show
    expect((await resolveArtUrl({ kind: "upload", value: "r1" }, { db, ...u })).source).toBe(
      "none",
    );
    const download = vi.fn(async (id: string) => {
      await db.art.put({ id, blob: bytesBlob(4), meta: { storagePath: "users/u/art/r1.webp" } });
      return true;
    });
    const r = await resolveArtUrl({ kind: "upload", value: "r1" }, { db, ...u, download });
    expect(download).toHaveBeenCalledWith("r1");
    expect(r.source).toBe("blob");
    // a failing download leaves it unresolved
    await db.art.put({ id: "r2", blob: bytesBlob(0), meta: { remoteOnly: true } });
    const failing = async () => {
      throw new Error("storage/unauthorized");
    };
    expect(
      (await resolveArtUrl({ kind: "upload", value: "r2" }, { db, ...u, download: failing }))
        .source,
    ).toBe("none");
  });
});
