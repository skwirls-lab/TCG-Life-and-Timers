// @vitest-environment node
// @req ART-022 @req ART-024
import { afterEach, describe, expect, it, vi } from "vitest";
import { bytesBlob, closeArtDbs, freshArtDb } from "../../../tests/unit/helpers/art";
import type { ArtStorageApi } from "./cloud";
import {
  artCloudActive,
  configureArtCloud,
  deleteArt,
  downloadArt,
  syncArtNow,
  watchArtCloud,
  type CloudUser,
} from "./cloudRuntime";
import { getArt, saveUpload } from "./repo";

afterEach(async () => {
  configureArtCloud();
  await closeArtDbs();
});

function setup(user: CloudUser | null, limit = 10) {
  const db = freshArtDb();
  const files = new Map<string, Blob>();
  const api: ArtStorageApi = {
    put: vi.fn(async (p: string, b: Blob) => {
      files.set(p, b);
    }),
    get: vi.fn(async (p: string) => files.get(p) ?? bytesBlob(0)),
    remove: vi.fn(async (p: string) => {
      files.delete(p);
    }),
  };
  const state = { user };
  const listeners = new Set<() => void>();
  const loadApi = vi.fn(async () => api);
  configureArtCloud({
    user: () => state.user,
    limit: () => limit,
    loadApi,
    db: () => db,
    onUserChange: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  });
  const signIn = (u: CloudUser | null) => {
    state.user = u;
    for (const l of listeners) l();
  };
  return { db, api, files, loadApi, signIn };
}

describe("cloud art runtime", () => {
  it("does nothing for guests and anonymous users", async () => {
    const { db, loadApi } = setup({ uid: "anon", isAnonymous: true });
    await saveUpload({ blob: bytesBlob(), width: 1, height: 1, name: "a" }, db);
    expect(artCloudActive()).toBe(false);
    expect(await syncArtNow()).toBeNull();
    expect(await downloadArt("x")).toBe(false);
    expect(loadApi).not.toHaveBeenCalled();
  });

  // @req ART-022
  it("uploads when signed in; concurrent calls share one serialized run", async () => {
    const { db, api, files } = setup({ uid: "u", isAnonymous: false });
    const a = await saveUpload({ blob: bytesBlob(), width: 1, height: 1, name: "a" }, db);
    expect(artCloudActive()).toBe(true);
    const p1 = syncArtNow();
    const p2 = syncArtNow();
    expect(p2).toBe(p1);
    const res = await p1;
    expect(res?.uploaded).toEqual([a.id]);
    expect(files.has(`users/u/art/${a.id}.webp`)).toBe(true);
    expect(api.put).toHaveBeenCalledTimes(1);
  });

  it("returns null when Storage is not configured (or fails to load)", async () => {
    const { db } = setup({ uid: "u", isAnonymous: false });
    configureArtCloud({
      user: () => ({ uid: "u", isAnonymous: false }),
      loadApi: async () => {
        throw new Error("no config");
      },
      db: () => db,
    });
    expect(await syncArtNow()).toBeNull();
    expect(await downloadArt("x")).toBe(false);
  });

  // @req ART-022
  it("downloads remote-only blobs and deletes from Storage when signed in", async () => {
    const { db, files } = setup({ uid: "u", isAnonymous: false });
    files.set("users/u/art/r.webp", bytesBlob(6));
    await db.art.put({
      id: "r",
      blob: bytesBlob(0),
      meta: { remoteOnly: true, storagePath: "users/u/art/r.webp", contentType: "image/webp" },
    });
    expect(await downloadArt("r")).toBe(true);
    expect((await getArt("r", db))?.blob.size).toBe(6);
    await deleteArt("r");
    expect(await getArt("r", db)).toBeUndefined();
    expect(files.size).toBe(0);
  });

  it("deletes locally when signed out", async () => {
    const { db, api } = setup(null);
    const a = await saveUpload({ blob: bytesBlob(), width: 1, height: 1, name: "a" }, db);
    await deleteArt(a.id);
    expect(await db.art.count()).toBe(0);
    expect(api.remove).not.toHaveBeenCalled();
  });

  // @req ART-024
  it("starts an upload pass when an account signs in (once per account)", async () => {
    const { db, api, signIn } = setup(null, 1);
    await saveUpload({ blob: bytesBlob(), width: 1, height: 1, name: "a" }, db, 1);
    await saveUpload({ blob: bytesBlob(), width: 1, height: 1, name: "b" }, db, 2);
    watchArtCloud();
    watchArtCloud(); // idempotent
    expect(api.put).not.toHaveBeenCalled();
    signIn({ uid: "u", isAnonymous: false });
    await vi.waitFor(async () => {
      const rows = await db.art.toArray();
      expect(rows.filter((r) => r.meta.storagePath).length).toBe(1);
      expect(rows.filter((r) => r.meta.cloud === "overQuota").length).toBe(1);
    });
    signIn({ uid: "u", isAnonymous: false }); // same account: no new pass
    expect(api.put).toHaveBeenCalledTimes(1);
  });

  it("a call during a run schedules exactly one more pass", async () => {
    const { db, api } = setup({ uid: "u", isAnonymous: false });
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const put = api.put as ReturnType<typeof vi.fn>;
    put.mockImplementationOnce(async () => {
      await gate;
    });
    await saveUpload({ blob: bytesBlob(), width: 1, height: 1, name: "a" }, db, 1);
    const run = syncArtNow();
    await vi.waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    await saveUpload({ blob: bytesBlob(), width: 1, height: 1, name: "b" }, db, 2);
    void syncArtNow();
    release();
    const res = await run;
    expect(res?.uploaded).toHaveLength(2); // the second pass uploaded "b"
    expect(put).toHaveBeenCalledTimes(2);
  });
});
