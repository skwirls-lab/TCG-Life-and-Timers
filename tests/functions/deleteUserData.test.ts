// Account deletion against the Firestore/Auth/Storage emulators via the admin SDK (D-005).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import {
  deleteUserData,
  isNotFound,
  isSafeUid,
  type DeleteUserDataDeps,
} from "../../functions/src/logic/deleteUserData";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
process.env.FIREBASE_STORAGE_EMULATOR_HOST ??= "127.0.0.1:9199";

const PROJECT_ID = "demo-tcg-life";
const BUCKET = `${PROJECT_ID}.appspot.com`;
const A = "user-a";
const B = "user-b";

let app: App;
let db: Firestore;
let auth: Auth;
let deps: DeleteUserDataDeps;

async function clearFirestore() {
  await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: "DELETE" },
  );
}

/** Everything a user can own, so the test proves each piece is removed (or kept). */
async function seedUser(uid: string, shareCode: string) {
  await auth.createUser({ uid, email: `${uid}@example.com` }).catch(() => undefined);
  const w = db.batch();
  w.set(db.doc(`users/${uid}`), { displayName: uid });
  w.set(db.doc(`users/${uid}/profiles/p1`), { name: "P" });
  w.set(db.doc(`users/${uid}/profiles/p1/decks/d1`), { name: "D" });
  w.set(db.doc(`users/${uid}/presets/x`), { name: "X" });
  w.set(db.doc(`users/${uid}/games/g1`), { presetId: "mtg" });
  w.set(db.doc(`users/${uid}/art/a1`), { storagePath: `users/${uid}/art/a1.webp` });
  w.set(db.doc(`users/${uid}/private/entitlements`), { pro: true, source: "subscription" });
  w.set(db.doc(`customers/${uid}`), { stripeId: `cus_${uid}` });
  w.set(db.doc(`customers/${uid}/subscriptions/s1`), { status: "active" });
  w.set(db.doc(`customers/${uid}/checkout_sessions/c1`), { price: "price_1" });
  w.set(db.doc(`sharedPresets/${shareCode}`), { code: shareCode, ownerUid: uid, name: "S" });
  await w.commit();
  const bucket = getStorage(app).bucket(BUCKET);
  await bucket.file(`users/${uid}/art/a1.webp`).save(Buffer.from("img"), {
    contentType: "image/webp",
  });
  await bucket.file(`users/${uid}/art/a2.webp`).save(Buffer.from("img"), {
    contentType: "image/webp",
  });
}

const userPaths = (uid: string, code: string) => [
  `users/${uid}`,
  `users/${uid}/profiles/p1`,
  `users/${uid}/profiles/p1/decks/d1`,
  `users/${uid}/presets/x`,
  `users/${uid}/games/g1`,
  `users/${uid}/art/a1`,
  `users/${uid}/private/entitlements`,
  `customers/${uid}`,
  `customers/${uid}/subscriptions/s1`,
  `customers/${uid}/checkout_sessions/c1`,
  `sharedPresets/${code}`,
];

async function existing(paths: string[]): Promise<string[]> {
  const snaps = await Promise.all(paths.map((p) => db.doc(p).get()));
  return snaps.filter((s) => s.exists).map((s) => s.ref.path);
}
async function storageFiles(uid: string): Promise<string[]> {
  const [files] = await getStorage(app)
    .bucket(BUCKET)
    .getFiles({ prefix: `users/${uid}/` });
  return files.map((f) => f.name);
}
async function authExists(uid: string): Promise<boolean> {
  return auth.getUser(uid).then(
    () => true,
    () => false,
  );
}

beforeAll(() => {
  app = initializeApp({ projectId: PROJECT_ID, storageBucket: BUCKET }, "delete-user-data-test");
  db = getFirestore(app);
  auth = getAuth(app);
  deps = { firestore: db, bucket: getStorage(app).bucket(BUCKET), auth };
});
beforeEach(async () => {
  await clearFirestore();
  await Promise.all([A, B].map((u) => auth.deleteUser(u).catch(() => undefined)));
  await getStorage(app).bucket(BUCKET).deleteFiles({ force: true });
  await seedUser(A, "AAAAaaaa");
  await seedUser(B, "BBBBbbbb");
});
afterAll(async () => {
  if (app) await deleteApp(app);
});

describe("deleteUserData (AUTH-005)", () => {
  // @req AUTH-005
  it("deletes all of user A's Firestore, Storage and Auth data", async () => {
    const res = await deleteUserData(deps, A);
    expect(res).toEqual({ uid: A, sharedPresetsDeleted: 1, authUserDeleted: true });
    expect(await existing(userPaths(A, "AAAAaaaa"))).toEqual([]);
    expect(await storageFiles(A)).toEqual([]);
    expect(await authExists(A)).toBe(false);
  });

  // @req AUTH-005
  // @req SEC-001
  it("leaves user B untouched", async () => {
    await deleteUserData(deps, A);
    const bPaths = userPaths(B, "BBBBbbbb");
    expect(await existing(bPaths)).toEqual(bPaths);
    expect((await storageFiles(B)).sort()).toEqual([
      `users/${B}/art/a1.webp`,
      `users/${B}/art/a2.webp`,
    ]);
    expect(await authExists(B)).toBe(true);
  });

  // @req AUTH-005
  it("is idempotent and ignores an already-deleted Auth user (onUserDeleted path)", async () => {
    await auth.deleteUser(A);
    const first = await deleteUserData(deps, A);
    expect(first.authUserDeleted).toBe(false);
    expect(await existing(userPaths(A, "AAAAaaaa"))).toEqual([]);
    const again = await deleteUserData(deps, A);
    expect(again).toEqual({ uid: A, sharedPresetsDeleted: 0, authUserDeleted: false });
  });

  // @req AUTH-005
  it("rejects uids that could escape the user's path", async () => {
    await expect(deleteUserData(deps, "")).rejects.toThrow(/invalid uid/);
    await expect(deleteUserData(deps, `${B}/profiles`)).rejects.toThrow(/invalid uid/);
    await expect(deleteUserData(deps, "..")).rejects.toThrow(/invalid uid/);
    expect(isSafeUid("x".repeat(129))).toBe(false);
    expect(isSafeUid(A)).toBe(true);
    expect(await existing(userPaths(B, "BBBBbbbb"))).toHaveLength(11);
  });

  // @req AUTH-005
  it("propagates unexpected errors but tolerates not-found", async () => {
    expect(isNotFound({ code: "auth/user-not-found" })).toBe(true);
    expect(isNotFound({ code: 404 })).toBe(true);
    expect(isNotFound(null)).toBe(false);
    const failing: DeleteUserDataDeps = {
      ...deps,
      auth: { deleteUser: () => Promise.reject(Object.assign(new Error("boom"), { code: 500 })) },
    };
    await expect(deleteUserData(failing, A)).rejects.toThrow("boom");
    const storageFails: DeleteUserDataDeps = {
      ...deps,
      bucket: {
        deleteFiles: () => Promise.reject(Object.assign(new Error("gone"), { code: 404 })),
      },
    };
    await expect(deleteUserData(storageFails, B)).resolves.toMatchObject({ authUserDeleted: true });
  });
});
