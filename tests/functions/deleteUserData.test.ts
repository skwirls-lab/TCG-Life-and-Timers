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
  StripeCleanupError,
  type DeleteUserDataDeps,
} from "../../functions/src/logic/deleteUserData";
import { fakeStripe } from "./support/fakeStripe";

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
  w.set(db.doc(`users/${uid}/setups/s1`), { name: "Friday pod", presetId: "mtg.commander" });
  w.set(db.doc(`users/${uid}/games/g1`), { presetId: "mtg" });
  w.set(db.doc(`users/${uid}/art/a1`), { storagePath: `users/${uid}/art/a1.webp` });
  w.set(db.doc(`users/${uid}/private/entitlements`), { pro: true, source: "subscription" });
  w.set(db.doc(`sharedPresets/${shareCode}`), { code: shareCode, ownerUid: uid, name: "S" });
  w.set(db.doc(`feedback/fb_${uid}`), { uid, email: `${uid}@example.com`, message: "hi" });
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
  `users/${uid}/setups/s1`,
  `users/${uid}/games/g1`,
  `users/${uid}/art/a1`,
  `users/${uid}/private/entitlements`,
  `sharedPresets/${code}`,
  `feedback/fb_${uid}`,
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
    expect(res).toEqual({
      uid: A,
      sharedPresetsDeleted: 1,
      authUserDeleted: true,
      subscriptionsCanceled: 0,
      stripeCustomerDeleted: null,
      feedbackDeleted: 1,
    });
    expect(await existing(userPaths(A, "AAAAaaaa"))).toEqual([]);
    expect(await storageFiles(A)).toEqual([]);
    expect(await authExists(A)).toBe(false);
  });

  // @req AUTH-005
  it("deletes saved setups (Presets) under users/{uid}/setups", async () => {
    await db.doc(`users/${A}/setups/s2`).set({ name: "Duel", presetId: "pokemon.standard" });
    await deleteUserData(deps, A);
    expect(await existing([`users/${A}/setups/s1`, `users/${A}/setups/s2`])).toEqual([]);
    expect(await existing([`users/${B}/setups/s1`])).toEqual([`users/${B}/setups/s1`]);
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
    expect(again).toEqual({
      uid: A,
      sharedPresetsDeleted: 0,
      authUserDeleted: false,
      subscriptionsCanceled: 0,
      stripeCustomerDeleted: null,
      feedbackDeleted: 0,
    });
  });

  // @req AUTH-005
  it("rejects uids that could escape the user's path", async () => {
    await expect(deleteUserData(deps, "")).rejects.toThrow(/invalid uid/);
    await expect(deleteUserData(deps, `${B}/profiles`)).rejects.toThrow(/invalid uid/);
    await expect(deleteUserData(deps, "..")).rejects.toThrow(/invalid uid/);
    expect(isSafeUid("x".repeat(129))).toBe(false);
    expect(isSafeUid(A)).toBe(true);
    expect(await existing(userPaths(B, "BBBBbbbb"))).toHaveLength(10);
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

  // @req AUTH-005
  it("B-6: deletes the user's feedback docs (uid + email), not other users'", async () => {
    await db.doc("feedback/anon").set({ message: "no uid" });
    await deleteUserData(deps, A);
    expect(await existing([`feedback/fb_${A}`])).toEqual([]);
    expect(await existing([`feedback/fb_${B}`, "feedback/anon"])).toHaveLength(2);
  });

  // @req AUTH-005 @req PAY-003
  it("B-3: cancels every billable subscription and deletes the Stripe customer first", async () => {
    const stripe = fakeStripe();
    await db.doc(`users/${A}/private/stripe`).set({ customerId: "cus_A" });
    stripe.customers.set("cus_A", { id: "cus_A", deleted: false, email: null, metadata: {} });
    for (const [id, status] of [
      ["sub_old", "canceled"],
      ["sub_due", "past_due"],
      ["sub_act", "active"],
    ] as const)
      stripe.addSubscription("cus_A", status, id, A);
    stripe.addSubscription("cus_B", "active", "sub_b", B); // another customer: untouched
    const origCancel = stripe.cancelSubscription;
    stripe.cancelSubscription = async (id) => {
      // The user's data (and the mapping) must still exist while Stripe is called.
      expect((await db.doc(`users/${A}/private/stripe`).get()).exists).toBe(true);
      return origCancel(id);
    };
    const res = await deleteUserData({ ...deps, stripe }, A);
    expect(stripe.calls.filter((c) => c === "cancelSubscription")).toHaveLength(2);
    expect(stripe.subscriptions.get("sub_due")!.status).toBe("canceled");
    expect(stripe.subscriptions.get("sub_act")!.status).toBe("canceled");
    expect(stripe.subscriptions.get("sub_b")!.status).toBe("active");
    expect(stripe.customers.get("cus_A")!.deleted).toBe(true);
    expect(stripe.calls.at(-1)).toBe("deleteCustomer");
    expect(res).toMatchObject({ subscriptionsCanceled: 2, stripeCustomerDeleted: "cus_A" });
    expect(await existing([...userPaths(A, "AAAAaaaa"), `users/${A}/private/stripe`])).toEqual([]);
    // A user without a Stripe customer never needs Stripe.
    const none = fakeStripe();
    await deleteUserData({ ...deps, stripe: none }, B);
    expect(none.calls).toEqual([]);
  });

  // @req AUTH-005
  it("B-3: a Stripe failure aborts before anything is deleted (retryable)", async () => {
    await db.doc(`users/${A}/private/stripe`).set({ customerId: "cus_A" });
    const stripe = fakeStripe();
    stripe.addSubscription("cus_A", "active", "sub_x", A);
    stripe.failNext.cancelSubscription = Object.assign(new Error("stripe down"), {
      type: "StripeAPIError",
      statusCode: 500,
    });
    const err = await deleteUserData({ ...deps, stripe }, A).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StripeCleanupError);
    expect((err as StripeCleanupError).customerId).toBe("cus_A");
    expect((err as StripeCleanupError).detail).toBe("StripeAPIError/500");
    expect(await existing(userPaths(A, "AAAAaaaa"))).toHaveLength(10);
    expect(await authExists(A)).toBe(true);
    // The customer delete failing aborts too.
    stripe.failNext.deleteCustomer = new Error("nope");
    await expect(deleteUserData({ ...deps, stripe }, A)).rejects.toBeInstanceOf(StripeCleanupError);
    expect(await existing(userPaths(A, "AAAAaaaa"))).toHaveLength(10);
    // No Stripe client while the user has a customer: refuse rather than leave billing running.
    await expect(deleteUserData({ ...deps, stripe: null }, A)).rejects.toThrow(
      "stripe not configured",
    );
    expect(await authExists(A)).toBe(true);
    // Retry once Stripe answers: everything goes.
    await expect(deleteUserData({ ...deps, stripe }, A)).resolves.toMatchObject({
      stripeCustomerDeleted: "cus_A",
      authUserDeleted: true,
    });
  });

  // @req AUTH-005
  it("best effort (Auth onDelete): a Stripe failure is reported and the data still goes", async () => {
    await db.doc(`users/${A}/private/stripe`).set({ customerId: "cus_A" });
    const stripe = fakeStripe();
    stripe.failNext.listSubscriptions = Object.assign(new Error("x"), { statusCode: 503 });
    const res = await deleteUserData({ ...deps, stripe, stripeFailure: "continue" }, A);
    expect(res).toMatchObject({ stripeError: "cus_A: 503", stripeCustomerDeleted: null });
    expect(await existing(userPaths(A, "AAAAaaaa"))).toEqual([]);
  });
});
