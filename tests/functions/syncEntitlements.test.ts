// syncEntitlements against the Firestore/Auth emulators via the admin SDK (D-005). The purchase
// state is what billing.ts re-fetched from Stripe; here a plain loader supplies it.
// @req PAY-002 @req PAY-003 @req SEC-002
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { FieldValue, Timestamp, getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  syncEntitlements as syncWith,
  type PurchaseState,
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

// The user's current purchases "in Stripe" (reset per test).
let state: { subscriptions: Record<string, unknown>[]; payments: Record<string, unknown>[] };
let loads = 0;
const syncEntitlements = (d: SyncEntitlementsDeps, uid: string) =>
  syncWith(d, uid, async (): Promise<PurchaseState> => {
    loads++;
    return state;
  });
const sub = (status: string) => state.subscriptions.push({ status });
const pay = (p: Record<string, unknown>) => state.payments.push(p);

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
  state = { subscriptions: [], payments: [] };
  loads = 0;
  await clearFirestore();
  await auth.deleteUser(U).catch(() => undefined);
  await auth.createUser({ uid: U, email: `${U}@example.com` });
});

describe("syncEntitlements (T7.2)", () => {
  // @req PAY-002 @req SEC-002
  it("an active subscription grants pro (doc + custom claim)", async () => {
    sub("active");
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
    sub("trialing");
    expect((await syncEntitlements(deps, U)).pro).toBe(true);
    expect(await entitlement()).toMatchObject({ pro: true, source: "subscription" });
  });

  // @req PAY-003
  it("cancelling removes pro; the claim follows and other claims are kept", async () => {
    await auth.setCustomUserClaims(U, { beta: true });
    sub("active");
    await syncEntitlements(deps, U);
    expect((await auth.getUser(U)).customClaims).toEqual({ beta: true, pro: true });

    state.subscriptions = [{ status: "canceled" }];
    const r = await syncEntitlements(deps, U);
    expect(r).toMatchObject({ pro: false, source: "none", written: true });
    expect(await entitlement()).toMatchObject({ pro: false, source: "none" });
    expect((await auth.getUser(U)).customClaims).toEqual({ beta: true, pro: false });
  });

  // @req PAY-002
  it("a canceled sub next to an active one stays pro (order-independent)", async () => {
    sub("canceled");
    sub("active");
    expect((await syncEntitlements(deps, U)).pro).toBe(true);
  });

  // @req PAY-002
  it("a succeeded lifetime payment grants lifetime pro, even after a subscription ends", async () => {
    sub("canceled");
    pay({ status: "succeeded", items: [{ price: { id: "price_lifetime" } }] });
    const r = await syncEntitlements(deps, U);
    expect(r).toMatchObject({ pro: true, source: "lifetime" });
    expect(await entitlement()).toMatchObject({ pro: true, source: "lifetime" });
  });

  // @req PAY-003
  it("B-8: refunding the lifetime payment revokes pro on the next sync", async () => {
    pay({ status: "succeeded", amount: 2999, price: "price_lifetime" });
    expect(await syncEntitlements(deps, U)).toMatchObject({ pro: true, source: "lifetime" });
    state.payments = [
      { status: "succeeded", amount: 2999, amount_refunded: 2999, price: "price_lifetime" },
    ];
    expect(await syncEntitlements(deps, U)).toMatchObject({ pro: false, written: true });
    expect((await auth.getUser(U)).customClaims).toEqual({ pro: false });
  });

  it("a non-lifetime or failed payment does not grant pro", async () => {
    pay({ status: "succeeded", price: "price_other" });
    pay({ status: "canceled", price: "price_lifetime" });
    expect(await syncEntitlements(deps, U)).toMatchObject({ pro: false, source: "none" });
  });

  it("does not rewrite an unchanged entitlement, and is idempotent", async () => {
    sub("active");
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

  it("a manual comp wins over a subscription and its doc is left as the owner wrote it", async () => {
    await db
      .doc(`users/${U}/private/entitlements`)
      .set({ pro: true, source: "manual", note: "gift", updatedAt: FieldValue.serverTimestamp() });
    state.subscriptions.push({ status: "active", interval: "year", currentPeriodEnd: 5e12 });
    expect(await syncEntitlements(deps, U)).toMatchObject({
      pro: true,
      source: "manual",
      written: false,
    });
    const doc = await entitlement();
    expect(doc).toMatchObject({ pro: true, source: "manual", note: "gift" });
    expect(doc).not.toHaveProperty("plan");
  });

  it("writes the plan, renewal date, cancel flag and status (additive fields)", async () => {
    const end = Date.UTC(2027, 0, 15);
    state.subscriptions.push({
      status: "active",
      interval: "month",
      priceIds: ["price_monthly"],
      currentPeriodEnd: end,
      cancelAtPeriodEnd: false,
    });
    expect(await syncEntitlements(deps, U)).toMatchObject({
      pro: true,
      details: { plan: "monthly", currentPeriodEnd: end },
    });
    expect(await entitlement()).toMatchObject({
      pro: true,
      source: "subscription",
      plan: "monthly",
      currentPeriodEnd: end,
      cancelAtPeriodEnd: false,
      status: "active",
    });

    // Canceling in the portal (at period end): still Pro, the doc says so.
    state.subscriptions[0]!.cancelAtPeriodEnd = true;
    expect(await syncEntitlements(deps, U)).toMatchObject({ pro: true, written: true });
    expect(await entitlement()).toMatchObject({ cancelAtPeriodEnd: true, currentPeriodEnd: end });
    // Unchanged details: no rewrite.
    expect(await syncEntitlements(deps, U)).toMatchObject({ written: false });
  });

  it("upgrades an old doc without the new fields on the next sync", async () => {
    await db
      .doc(`users/${U}/private/entitlements`)
      .set({ pro: true, source: "subscription", updatedAt: FieldValue.serverTimestamp() });
    state.subscriptions.push({ status: "active", interval: "year", currentPeriodEnd: 4e12 });
    expect(await syncEntitlements(deps, U)).toMatchObject({ written: true });
    expect(await entitlement()).toMatchObject({ plan: "yearly", currentPeriodEnd: 4e12 });
  });

  it("losing Pro drops the plan fields", async () => {
    state.subscriptions.push({ status: "active", interval: "month", currentPeriodEnd: 4e12 });
    await syncEntitlements(deps, U);
    state.subscriptions = [{ status: "canceled", interval: "month", currentPeriodEnd: 4e12 }];
    await syncEntitlements(deps, U);
    const doc = await entitlement();
    expect(doc).toMatchObject({ pro: false, source: "none" });
    expect(Object.keys(doc!).sort()).toEqual(["pro", "source", "updatedAt"]);
  });

  // @req AUTH-005
  it("B-3: never writes entitlements for a deleted Auth user (late Stripe webhook)", async () => {
    await auth.deleteUser(U);
    sub("active");
    expect(await syncEntitlements(deps, U)).toMatchObject({
      written: false,
      claimUpdated: false,
      userDeleted: true,
    });
    expect((await db.doc(`users/${U}/private/entitlements`).get()).exists).toBe(false);
    expect(loads).toBe(0); // Stripe is not even asked
  });

  it("works when claims are disabled (no auth dependency)", async () => {
    sub("active");
    const noClaims = { ...deps, auth: undefined };
    expect(await syncEntitlements(noClaims, U)).toMatchObject({ pro: true, written: true });
    expect(await syncEntitlements(noClaims, U)).toMatchObject({ pro: true, written: false });
    expect((await auth.getUser(U)).customClaims ?? {}).toEqual({});
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
