// Server-side cloud art quota (B-4, ART-024) against the Firestore/Auth/Storage emulators.
// @req ART-024 @req SEC-004
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import {
  artOwner,
  FREE_ART_LIMIT,
  PRO_ART_LIMIT,
  recomputeArtQuota,
  type ArtQuotaDeps,
} from "../../functions/src/logic/artQuota";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
process.env.FIREBASE_STORAGE_EMULATOR_HOST ??= "127.0.0.1:9199";

const PROJECT_ID = "demo-tcg-life";
const BUCKET = `${PROJECT_ID}.appspot.com`;
const U = "quota-user";

let app: App;
let db: Firestore;
let auth: Auth;
let deps: ArtQuotaDeps;

const bucket = () => getStorage(app).bucket(BUCKET);
async function put(n: number) {
  for (let i = 0; i < n; i++)
    await bucket()
      .file(`users/${U}/art/a${i}.webp`)
      .save(Buffer.from("img"), { contentType: "image/webp" });
}
const files = async () => (await bucket().getFiles({ prefix: `users/${U}/art/` }))[0].length;
const quota = async () => (await db.doc(`users/${U}/private/quota`).get()).data();
const claims = async () => (await auth.getUser(U)).customClaims ?? {};

beforeAll(() => {
  app = initializeApp({ projectId: PROJECT_ID, storageBucket: BUCKET }, "art-quota-test");
  db = getFirestore(app);
  auth = getAuth(app);
  deps = {
    firestore: db,
    bucket: bucket(),
    auth,
    serverTimestamp: FieldValue.serverTimestamp,
  };
});
afterAll(async () => {
  if (app) await deleteApp(app);
});
beforeEach(async () => {
  await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: "DELETE" },
  );
  await bucket().deleteFiles({ force: true });
  await auth.deleteUser(U).catch(() => undefined);
  await auth.createUser({ uid: U });
  await auth.setCustomUserClaims(U, { pro: false });
});

describe("artQuota (B-4)", () => {
  it("parses the owner of art objects only", () => {
    expect(artOwner(`users/${U}/art/a.webp`)).toBe(U);
    expect(artOwner("users/u/other/a.webp")).toBeNull();
    expect(artOwner("users/../art/a.webp")).toBeNull();
    expect(artOwner(undefined)).toBeNull();
  });

  it("paywall disabled: counts, never limits, never deletes", async () => {
    await put(12);
    const r = await recomputeArtQuota(deps, U, { newObject: `users/${U}/art/a11.webp` });
    expect(r).toMatchObject({ artCount: 12, artLimit: null, removed: [], quotaFull: false });
    expect(await quota()).toMatchObject({ artCount: 12, artLimit: null });
    expect(await claims()).toEqual({ pro: false });
  });

  it("paywall enabled, free: full at the free limit (claim set), backstop deletes the next new object", async () => {
    await db.doc("config/billing").set({ paywallEnabled: true });
    await put(FREE_ART_LIMIT);
    let r = await recomputeArtQuota(deps, U, {
      newObject: `users/${U}/art/a${FREE_ART_LIMIT - 1}.webp`,
    });
    expect(r).toMatchObject({
      artCount: FREE_ART_LIMIT,
      artLimit: FREE_ART_LIMIT,
      quotaFull: true,
    });
    expect(await claims()).toEqual({ pro: false, artQuotaFull: true });
    await bucket()
      .file(`users/${U}/art/extra.webp`)
      .save(Buffer.from("img"), { contentType: "image/webp" });
    r = await recomputeArtQuota(deps, U, { newObject: `users/${U}/art/extra.webp` });
    expect(r.removed).toEqual([`users/${U}/art/extra.webp`]);
    expect(await files()).toBe(FREE_ART_LIMIT);
    // Deleting one frees a slot and clears the claim (other claims kept).
    await bucket().file(`users/${U}/art/a0.webp`).delete();
    r = await recomputeArtQuota(deps, U);
    expect(r).toMatchObject({ artCount: FREE_ART_LIMIT - 1, quotaFull: false });
    expect(await claims()).toEqual({ pro: false });
  });

  it("Pro users get 200; a lapsed Pro keeps existing images (only new ones are refused)", async () => {
    await db.doc("config/billing").set({ paywallEnabled: true });
    await db.doc(`users/${U}/private/entitlements`).set({ pro: true, source: "subscription" });
    await put(12);
    let r = await recomputeArtQuota(deps, U, { newObject: `users/${U}/art/a11.webp` });
    expect(r).toMatchObject({ artCount: 12, artLimit: PRO_ART_LIMIT, quotaFull: false });
    await db.doc(`users/${U}/private/entitlements`).set({ pro: false, source: "none" });
    r = await recomputeArtQuota(deps, U);
    expect(r).toMatchObject({
      artCount: 12,
      artLimit: FREE_ART_LIMIT,
      quotaFull: true,
      removed: [],
    });
    expect(await files()).toBe(12);
  });

  it("never writes for a deleted user; rejects unsafe uids", async () => {
    await auth.deleteUser(U);
    expect(await recomputeArtQuota(deps, U)).toMatchObject({ userDeleted: true });
    expect(await quota()).toBeUndefined();
    await expect(recomputeArtQuota(deps, "a/b")).rejects.toThrow("invalid uid");
  });
});
