// Cloud art sync against the Auth + Firestore + Storage emulators (T5.4).
// @req ART-022 @req ART-024 @req SEC-004 @req LEG-005
import { afterEach, describe, expect, it } from "vitest";
import * as st from "firebase/storage";
import { doc, getDoc } from "firebase/firestore";
import sharp from "sharp";
import { downloadArtBlob, firebaseArtStorage, uploadPendingArt } from "@/lib/art/cloud";
import { getArt, renameArt, saveUpload } from "@/lib/art/repo";
import { resolveArtUrl } from "@/lib/art/resolve";
import { device, PROJECT_ID, uniqueEmail, until, type Device } from "./clients";

const open: Device[] = [];
async function dev(email: string) {
  const d = await device(email);
  open.push(d);
  return d;
}
afterEach(async () => {
  for (const d of open.splice(0)) await d.close();
});

function storageApi(d: Device) {
  const storage = st.getStorage(d.app, `gs://${PROJECT_ID}.appspot.com`);
  st.connectStorageEmulator(storage, "127.0.0.1", 9199);
  return { storage, api: firebaseArtStorage(st, storage) };
}

async function webp(color: { r: number; g: number; b: number }): Promise<Blob> {
  const buf = await sharp({ create: { width: 64, height: 48, channels: 3, background: color } })
    .webp({ quality: 80 })
    .toBuffer();
  return new Blob([new Uint8Array(buf)], { type: "image/webp" });
}

describe("cloud art across two devices (emulator)", () => {
  // @req ART-022 @req LEG-005
  it("an image uploaded on A is listed on B and downloads on demand", async () => {
    const email = uniqueEmail("art");
    const a = await dev(email);
    const b = await dev(email);
    await a.startSync();
    await b.startSync();
    const sa = storageApi(a);
    const sb = storageApi(b);

    const blob = await webp({ r: 200, g: 30, b: 30 });
    const row = await saveUpload({ blob, width: 64, height: 48, name: "Dragon" }, a.db);
    const res = await uploadPendingArt({ api: sa.api, uid: a.uid, limit: 10, db: a.db });
    expect(res.uploaded).toEqual([row.id]);
    const path = `users/${a.uid}/art/${row.id}.webp`;
    expect((await getArt(row.id, a.db))?.meta.storagePath).toBe(path);

    // Metadata reaches Firestore and device B (remote-only row, empty blob).
    const remote = await until(
      () => getDoc(doc(a.firestore, `users/${a.uid}/art/${row.id}`)),
      (s) => s.exists(),
    );
    expect(remote.data()).toMatchObject({
      storagePath: path,
      width: 64,
      height: 48,
      bytes: blob.size,
      contentType: "image/webp",
      name: "Dragon",
    });
    const onB = await until(
      () => getArt(row.id, b.db),
      (r) => r !== undefined,
    );
    expect(onB!.meta.remoteOnly).toBe(true);
    expect(onB!.blob.size).toBe(0);

    // B resolves the upload by downloading the binary from Storage.
    const resolved = await resolveArtUrl(
      { kind: "upload", value: row.id },
      {
        db: b.db,
        createObjectURL: () => "blob:test",
        revokeObjectURL: () => {},
        download: (id) => downloadArtBlob(id, { api: sb.api, db: b.db }),
      },
    );
    expect(resolved.source).toBe("blob");
    const local = (await getArt(row.id, b.db))!;
    expect(local.meta.remoteOnly).toBeUndefined();
    expect(new Uint8Array(await local.blob.arrayBuffer())).toEqual(
      new Uint8Array(await blob.arrayBuffer()),
    );

    // A rename on B syncs back to A without re-uploading.
    await renameArt(row.id, "Elder Dragon", b.db, Date.now() + 1000);
    await until(
      () => getArt(row.id, a.db),
      (r) => r?.meta.name === "Elder Dragon",
    );
    expect((await getArt(row.id, a.db))!.blob.size).toBe(blob.size);
  });

  // @req SEC-004
  it("Storage rules: owner-only, images only", async () => {
    const a = await dev(uniqueEmail("art-own"));
    const other = await dev(uniqueEmail("art-other"));
    const sa = storageApi(a);
    const so = storageApi(other);
    const path = `users/${a.uid}/art/x1.webp`;
    await sa.api.put(path, await webp({ r: 0, g: 0, b: 255 }), "image/webp");
    await expect(so.api.get(path)).rejects.toThrow(/unauthorized|permission/i);
    await expect(
      sa.api.put(
        `users/${a.uid}/art/x2.txt`,
        new Blob(["hi"], { type: "text/plain" }),
        "text/plain",
      ),
    ).rejects.toThrow(/unauthorized|permission/i);
    expect((await sa.api.get(path)).size).toBeGreaterThan(0);
    await sa.api.remove(path);
  });

  // @req ART-024
  it("over the quota, images stay local only and never reach the cloud", async () => {
    const a = await dev(uniqueEmail("art-quota"));
    await a.startSync();
    const sa = storageApi(a);
    const first = await saveUpload(
      { blob: await webp({ r: 1, g: 2, b: 3 }), width: 64, height: 48, name: "one" },
      a.db,
      1,
    );
    const second = await saveUpload(
      { blob: await webp({ r: 3, g: 2, b: 1 }), width: 64, height: 48, name: "two" },
      a.db,
      2,
    );
    const res = await uploadPendingArt({ api: sa.api, uid: a.uid, limit: 1, db: a.db });
    expect(res).toMatchObject({ uploaded: [first.id], overQuota: [second.id] });
    await until(
      () => getDoc(doc(a.firestore, `users/${a.uid}/art/${first.id}`)),
      (s) => s.exists(),
    );
    await a.engine!.whenIdle();
    expect((await getDoc(doc(a.firestore, `users/${a.uid}/art/${second.id}`))).exists()).toBe(
      false,
    );
    await expect(sa.api.get(`users/${a.uid}/art/${second.id}.webp`)).rejects.toThrow();
  });
});
