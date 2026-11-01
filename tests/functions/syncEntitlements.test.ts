// syncEntitlements against the Firestore/Auth emulators via the admin SDK (D-005). The Stripe
// extension is simulated by writing customers/{uid}/subscriptions|payments docs (§6.3 fallback).
// @req PAY-002 @req PAY-003 @req SEC-002
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { FieldValue, Timestamp, getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  syncEntitlements,
  type SyncEntitlementsDeps,
} from "../../functions/src/logic/syncEntitlements";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";

const PROJECT_ID = "demo-tcg-life";
const U = "pay-user";

let app: App;
let db: Firestore;
let auth: Auth;
let deps: SyncEntitlementsDeps;

async function clearFirestore() {
  await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: "DELETE" },
  );
}

const entitlement = async (uid = U) =>
  (await db.doc(`users/${uid}/private/entitlements`).get()).data();

beforeAll(() => {
  app = initializeApp({ projectId: PROJECT_ID }, "sync-entitlements-test");
  db = getFirestore(app);
  auth = getAuth(app);
  deps = {
    firestore: db,
    auth,
    serverTimestamp: FieldValue.serverTimestamp,
    lifetimePriceIds: new Set(["price_lifetime"]),
  };
});

afterAll(async () => {
  await deleteApp(app);
});

beforeEach(async () => {
  await clearFirestore();
  await auth.deleteUser(U).catch(() => undefined);
  await auth.createUser({ uid: U, email: `${U}@example.com` });
});

describe("syncEntitlements (T7.2)", () => {
  // @req PAY-002 @req SEC-002
  it("an active subscription grants pro (doc + custom claim)", async () => {
    await db.doc(`customers/${U}/subscriptions/sub_1`).set({ status: "active" });
    const r = await syncEntitlements(deps, U);
    expect(r).toMatchObject({
      pro: true,
      source: "subscription",
      written: true,
      claimUpdated: true,
    });
    const doc = await entitlement();
    expect(doc).toMatchObject({ pro: true, source: "subscription" });
    expect(doc!.updatedAt).toBeInstanceOf(Timestamp);
    expect((await auth.getUser(U)).customClaims).toEqual({ pro: true });
  });

  // @req PAY-002
  it("a trialing subscription grants pro", async () => {
    await db.doc(`customers/${U}/subscriptions/sub_t`).set({ status: "trialing" });
    expect((await syncEntitlements(deps, U)).pro).toBe(true);
    expect(await entitlement()).toMatchObject({ pro: true, source: "subscription" });
  });

  // @req PAY-003
  it("cancelling removes pro; the claim follows and other claims are kept", async () => {
    await auth.setCustomUserClaims(U, { beta: true });
    const sub = db.doc(`customers/${U}/subscriptions/sub_1`);
    await sub.set({ status: "active" });
    await syncEntitlements(deps, U);
    expect((await auth.getUser(U)).customClaims).toEqual({ beta: true, pro: true });

    await sub.set({ status: "canceled" });
    const r = await syncEntitlements(deps, U);
    expect(r).toMatchObject({ pro: false, source: "none", written: true });
    expect(await entitlement()).toMatchObject({ pro: false, source: "none" });
    expect((await auth.getUser(U)).customClaims).toEqual({ beta: true, pro: false });
  });

  // @req PAY-002
  it("a canceled sub next to an active one stays pro (order-independent)", async () => {
    await db.doc(`customers/${U}/subscriptions/old`).set({ status: "canceled" });
    await db.doc(`customers/${U}/subscriptions/new`).set({ status: "active" });
    expect((await syncEntitlements(deps, U)).pro).toBe(true);
  });

  // @req PAY-002
  it("a succeeded lifetime payment grants lifetime pro, even after a subscription ends", async () => {
    await db.doc(`customers/${U}/subscriptions/sub_1`).set({ status: "canceled" });
    await db
      .doc(`customers/${U}/payments/pi_1`)
      .set({ status: "succeeded", items: [{ price: { id: "price_lifetime" } }] });
    const r = await syncEntitlements(deps, U);
    expect(r).toMatchObject({ pro: true, source: "lifetime" });
    expect(await entitlement()).toMatchObject({ pro: true, source: "lifetime" });
  });

  it("a non-lifetime or failed payment does not grant pro", async () => {
    await db.doc(`customers/${U}/payments/pi_1`).set({ status: "succeeded", price: "price_other" });
    await db
      .doc(`customers/${U}/payments/pi_2`)
      .set({ status: "canceled", price: "price_lifetime" });
    expect(await syncEntitlements(deps, U)).toMatchObject({ pro: false, source: "none" });
  });

  it("does not rewrite an unchanged entitlement, and is idempotent", async () => {
    await db.doc(`customers/${U}/subscriptions/sub_1`).set({ status: "active" });
    await syncEntitlements(deps, U);
    const first = (await entitlement())!.updatedAt as Timestamp;
    const again = await syncEntitlements(deps, U);
    expect(again).toMatchObject({ pro: true, written: false, claimUpdated: false });
    expect(((await entitlement())!.updatedAt as Timestamp).isEqual(first)).toBe(true);
  });

  it("keeps an owner-granted (manual) entitlement", async () => {
    await db
      .doc(`users/${U}/private/entitlements`)
      .set({ pro: true, source: "manual", updatedAt: FieldValue.serverTimestamp() });
    expect(await syncEntitlements(deps, U)).toMatchObject({ pro: true, source: "manual" });
  });

  it("works when the Auth user is gone or claims are disabled", async () => {
    await auth.deleteUser(U);
    await db.doc(`customers/${U}/subscriptions/sub_1`).set({ status: "active" });
    expect(await syncEntitlements(deps, U)).toMatchObject({ pro: true, claimUpdated: false });
    const noClaims = { ...deps, auth: undefined };
    expect(await syncEntitlements(noClaims, U)).toMatchObject({ pro: true, written: false });
  });

  it("rejects unsafe uids", async () => {
    await expect(syncEntitlements(deps, "a/b")).rejects.toThrow("invalid uid");
    await expect(syncEntitlements(deps, "..")).rejects.toThrow("invalid uid");
  });

  it("rethrows unexpected auth errors", async () => {
    const broken = {
      ...deps,
      auth: {
        getUser: () => Promise.reject(Object.assign(new Error("boom"), { code: "internal" })),
        setCustomUserClaims: async () => {},
      },
    };
    await expect(syncEntitlements(broken, U)).rejects.toThrow("boom");
  });
});
