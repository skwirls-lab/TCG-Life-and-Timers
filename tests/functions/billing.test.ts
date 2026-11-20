// The app's own Stripe integration (D-082) against the Firestore/Auth emulators via the admin SDK,
// with an in-memory Stripe (support/fakeStripe.ts): nothing reaches api.stripe.com. Webhook
// signatures are made and verified by the real Stripe SDK.
// @req PAY-002 @req PAY-003 @req PAY-004 @req SEC-002
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { FieldValue, Timestamp, getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  BillingError,
  HANDLED_EVENTS,
  REFRESH_INTERVAL_MS,
  createCheckoutSession,
  createPortalSession,
  handleStripeWebhook,
  refreshEntitlements,
  resolveOrigin,
  type BillingConfig,
  type BillingDeps,
  type Caller,
} from "../../functions/src/logic/billing";
import { signWebhookPayload } from "../../functions/src/logic/stripe";
import { fakeStripe, type FakeStripe } from "./support/fakeStripe";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";

const PROJECT_ID = "demo-tcg-life";
const U = "billing-user";
const SECRET = "whsec_test_secret";

let app: App;
let db: Firestore;
let auth: Auth;
let stripe: FakeStripe;
let deps: BillingDeps;
let clock: number;
let quotaRuns: string[];

const config = (over: Partial<BillingConfig> = {}): BillingConfig => ({
  priceIds: new Set(["price_monthly", "price_yearly"]),
  lifetimePriceIds: new Set(),
  baseUrl: "https://tcgtempo.skwirls.com",
  returnOrigins: new Set(["https://tcgtempo.skwirls.com", "https://tcgtempo.web.app"]),
  automaticTax: false,
  ...over,
});

const caller = (over: Partial<Caller> = {}): Caller => ({
  uid: U,
  anonymous: false,
  email: `${U}@example.com`,
  ...over,
});

async function clearFirestore() {
  await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: "DELETE" },
  );
}

const entitlement = async (uid = U) =>
  (await db.doc(`users/${uid}/private/entitlements`).get()).data();
const mapping = async (uid = U) => (await db.doc(`users/${uid}/private/stripe`).get()).data();
/** A customer that exists in Stripe and is mapped to `uid`. */
async function linkCustomer(customerId: string, uid = U) {
  if (!stripe.customers.has(customerId))
    stripe.customers.set(customerId, {
      id: customerId,
      deleted: false,
      email: null,
      metadata: { firebaseUID: uid },
    });
  await db.doc(`users/${uid}/private/stripe`).set({ customerId }, { merge: true });
}

let evtSeq = 0;
function signedEvent(type: string, object: Record<string, unknown>, id = `evt_${++evtSeq}x`) {
  const payload = JSON.stringify({ id, object: "event", type, data: { object } });
  return { payload, header: signWebhookPayload(payload, SECRET), id };
}
const deliver = (e: { payload: string; header: string }, secret = SECRET) =>
  handleStripeWebhook(
    deps,
    { method: "POST", rawBody: Buffer.from(e.payload), signature: e.header },
    secret,
  );

async function rejects(p: Promise<unknown>, code: string, reason?: string) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(BillingError);
  expect((err as BillingError).code).toBe(code);
  if (reason) expect((err as BillingError).reason).toBe(reason);
}

beforeAll(() => {
  app = initializeApp({ projectId: PROJECT_ID }, "billing-test");
  db = getFirestore(app);
  auth = getAuth(app);
});
afterAll(async () => {
  await deleteApp(app);
});
beforeEach(async () => {
  await clearFirestore();
  await auth.deleteUser(U).catch(() => undefined);
  await auth.createUser({ uid: U, email: `${U}@example.com` });
  stripe = fakeStripe();
  clock = 1_800_000_000_000;
  quotaRuns = [];
  deps = {
    firestore: db,
    auth,
    stripe,
    serverTimestamp: FieldValue.serverTimestamp,
    now: () => clock,
    config: config(),
    onEntitlementsChanged: async (uid) => {
      quotaRuns.push(uid);
    },
  };
});

describe("createCheckoutSession", () => {
  // @req PAY-002 @req SEC-006
  it("requires a signed-in, non-anonymous account", async () => {
    await rejects(
      createCheckoutSession(deps, null, { priceId: "price_monthly" }),
      "unauthenticated",
    );
    await rejects(
      createCheckoutSession(deps, caller({ anonymous: true }), { priceId: "price_monthly" }),
      "failed-precondition",
      "sign-in-required",
    );
    expect(stripe.calls).toEqual([]);
  });

  // @req PAY-002 @req SEC-002
  it("rejects prices outside the server allowlist before calling Stripe", async () => {
    for (const priceId of ["price_evil", "price_oneoff", "", 42, undefined])
      await rejects(
        createCheckoutSession(deps, caller(), { priceId }),
        "invalid-argument",
        "price-not-allowed",
      );
    expect(stripe.calls).toEqual([]);
  });

  // @req PAY-002
  it("creates the customer once (metadata.firebaseUID, email) and a subscription Checkout", async () => {
    const res = await createCheckoutSession(deps, caller(), { priceId: "price_yearly" });
    expect(res).toEqual({ url: expect.stringMatching(/^https:\/\/checkout\.stripe\.test\//) });
    expect([...stripe.customers.values()]).toEqual([
      { id: "cus_1", deleted: false, email: `${U}@example.com`, metadata: { firebaseUID: U } },
    ]);
    expect(await mapping()).toEqual({ customerId: "cus_1" });
    expect(stripe.sessions).toEqual([
      {
        mode: "subscription",
        customer: "cus_1",
        priceId: "price_yearly",
        uid: U,
        successUrl:
          "https://tcgtempo.skwirls.com/pro?checkout=success&session_id={CHECKOUT_SESSION_ID}",
        cancelUrl: "https://tcgtempo.skwirls.com/pro?checkout=cancel",
        automaticTax: false,
      },
    ]);
    // A second checkout reuses the mapped customer.
    await createCheckoutSession(deps, caller(), { priceId: "price_monthly" });
    expect(stripe.customers.size).toBe(1);
    expect(stripe.calls.filter((c) => c === "createCustomer")).toHaveLength(1);
  });

  // @req PAY-002
  it("concurrent calls create ONE customer (deterministic idempotency key)", async () => {
    const results = await Promise.all(
      [1, 2, 3].map(() => createCheckoutSession(deps, caller(), { priceId: "price_monthly" })),
    );
    expect(results.every((r) => "url" in r)).toBe(true);
    expect(stripe.customers.size).toBe(1);
    expect(await mapping()).toEqual({ customerId: [...stripe.customers.keys()][0] });
    expect(new Set(stripe.sessions.map((s) => s.customer)).size).toBe(1);
  });

  // @req PAY-002
  it("replaces a mapped customer that no longer exists (deleted, or test-mode after going live)", async () => {
    await db.doc(`users/${U}/private/stripe`).set({ customerId: "cus_testmode" });
    await createCheckoutSession(deps, caller(), { priceId: "price_monthly" });
    expect(await mapping()).toEqual({ customerId: "cus_1" });
    expect(stripe.sessions[0]!.customer).toBe("cus_1");
    // Deleted in the dashboard: replaced again, under a fresh idempotency key.
    stripe.customers.set("cus_1", { ...stripe.customers.get("cus_1")!, deleted: true });
    await createCheckoutSession(deps, caller(), { priceId: "price_monthly" });
    expect((await mapping())!.customerId).not.toBe("cus_1");
    expect(stripe.customers.size).toBe(2);
  });

  // @req PAY-002 @req PAY-004
  it("answers alreadyPro for a live subscription, and syncs the entitlement", async () => {
    await linkCustomer("cus_9");
    for (const status of ["active", "trialing", "past_due"]) {
      stripe.subscriptions.clear();
      stripe.addSubscription("cus_9", status);
      expect(await createCheckoutSession(deps, caller(), { priceId: "price_monthly" })).toEqual({
        status: "alreadyPro",
      });
    }
    expect(stripe.sessions).toEqual([]);
    // past_due is not Pro (entitlements policy) but still may not buy a second subscription.
    expect(await entitlement()).toMatchObject({ pro: false, source: "none" });
    stripe.subscriptions.clear();
    stripe.addSubscription("cus_9", "active");
    await createCheckoutSession(deps, caller(), { priceId: "price_monthly" });
    expect(await entitlement()).toMatchObject({ pro: true, source: "subscription" });
    // A canceled one doesn't block a new purchase.
    stripe.subscriptions.clear();
    stripe.addSubscription("cus_9", "canceled");
    expect(
      await createCheckoutSession(deps, caller(), { priceId: "price_monthly" }),
    ).toHaveProperty("url");
  });

  // @req PAY-002 @req SEC-002
  it("accepts only allowlisted return origins", async () => {
    await createCheckoutSession(deps, caller(), {
      priceId: "price_monthly",
      returnOrigin: "https://tcgtempo.web.app",
    });
    await createCheckoutSession(deps, caller(), {
      priceId: "price_monthly",
      returnOrigin: "https://evil.example",
    });
    expect(stripe.sessions.map((s) => s.cancelUrl)).toEqual([
      "https://tcgtempo.web.app/pro?checkout=cancel",
      "https://tcgtempo.skwirls.com/pro?checkout=cancel",
    ]);
    const c = config();
    expect(resolveOrigin(c, "https://tcgtempo.web.app/some/path?x=1")).toBe(
      "https://tcgtempo.web.app",
    );
    expect(resolveOrigin(c, "http://tcgtempo.web.app")).toBe("https://tcgtempo.skwirls.com");
    expect(resolveOrigin(c, "https://tcgtempo.web.app.evil.example")).toBe(
      "https://tcgtempo.skwirls.com",
    );
    expect(resolveOrigin(c, "javascript:alert(1)")).toBe("https://tcgtempo.skwirls.com");
    expect(resolveOrigin(c, 3)).toBe("https://tcgtempo.skwirls.com");
    expect(resolveOrigin(c, "http://127.0.0.1:3300")).toBe("https://tcgtempo.skwirls.com");
    expect(resolveOrigin(config({ allowLocalOrigins: true }), "http://127.0.0.1:3300")).toBe(
      "http://127.0.0.1:3300",
    );
  });

  // @req PAY-002
  it("lifetime prices use payment mode; misconfigured or archived prices are refused", async () => {
    deps.config = config({ lifetimePriceIds: new Set(["price_lifetime", "price_yearly"]) });
    await createCheckoutSession(deps, caller(), { priceId: "price_lifetime" });
    expect(stripe.sessions.at(-1)).toMatchObject({ mode: "payment", priceId: "price_lifetime" });
    // A recurring price listed as lifetime is a config error, not a silent subscription.
    await rejects(
      createCheckoutSession(deps, caller(), { priceId: "price_yearly" }),
      "failed-precondition",
      "price-misconfigured",
    );
    deps.config = config({ priceIds: new Set(["price_oneoff", "price_archived"]) });
    await rejects(
      createCheckoutSession(deps, caller(), { priceId: "price_oneoff" }),
      "failed-precondition",
      "price-misconfigured",
    );
    await rejects(
      createCheckoutSession(deps, caller(), { priceId: "price_archived" }),
      "failed-precondition",
      "price-unavailable",
    );
  });

  // @req PAY-002
  it("owning lifetime answers alreadyPro; a refunded lifetime does not", async () => {
    deps.config = config({ lifetimePriceIds: new Set(["price_lifetime"]) });
    await linkCustomer("cus_9");
    const pi = stripe.addPayment("cus_9", {});
    expect(await createCheckoutSession(deps, caller(), { priceId: "price_monthly" })).toEqual({
      status: "alreadyPro",
    });
    stripe.payments.set(pi, { ...stripe.payments.get(pi)!, refunded: true, amountRefunded: 2999 });
    expect(
      await createCheckoutSession(deps, caller(), { priceId: "price_monthly" }),
    ).toHaveProperty("url");
  });

  it("passes the Stripe Tax switch through", async () => {
    deps.config = config({ automaticTax: true });
    await createCheckoutSession(deps, caller({ email: null }), { priceId: "price_monthly" });
    expect(stripe.sessions[0]).toMatchObject({ automaticTax: true });
    expect([...stripe.customers.values()][0]!.email).toBeNull();
  });
});

describe("createPortalSession", () => {
  // @req PAY-004
  it("opens the portal for the mapped customer, returning to /pro", async () => {
    await rejects(createPortalSession(deps, null, {}), "unauthenticated");
    await rejects(createPortalSession(deps, caller(), {}), "not-found", "no-customer");
    await linkCustomer("cus_7");
    const res = await createPortalSession(deps, caller(), {
      returnOrigin: "https://tcgtempo.web.app",
    });
    expect(res.url).toBe(
      `https://billing.stripe.test/p/cus_7?return=${encodeURIComponent("https://tcgtempo.web.app/pro")}`,
    );
    const fallback = await createPortalSession(deps, caller(), {
      returnOrigin: "https://x.example",
    });
    expect(fallback.url).toContain(encodeURIComponent("https://tcgtempo.skwirls.com/pro"));
  });
});

describe("stripeWebhook", () => {
  // @req SEC-002
  it("answers 400 to unsigned, mis-signed or stale events and processes nothing", async () => {
    await linkCustomer("cus_1");
    stripe.addSubscription("cus_1", "active", "sub_a", U);
    const e = signedEvent("customer.subscription.created", {
      id: "sub_a",
      customer: "cus_1",
      metadata: { firebaseUID: U },
    });
    const cases = [
      handleStripeWebhook(
        deps,
        { method: "POST", rawBody: Buffer.from(e.payload), signature: undefined },
        SECRET,
      ),
      deliver(e, "whsec_other"),
      deliver({ payload: e.payload.replace("created", "updated"), header: e.header }),
      handleStripeWebhook(
        deps,
        {
          method: "POST",
          rawBody: Buffer.from(e.payload),
          signature: signWebhookPayload(e.payload, SECRET, Math.floor(Date.now() / 1000) - 3600),
        },
        SECRET,
      ),
      deliver(e, ""),
    ];
    for (const r of await Promise.all(cases))
      expect(r).toEqual({ status: 400, body: { error: "invalid signature" } });
    expect(
      (await handleStripeWebhook(deps, { method: "GET", rawBody: "", signature: "x" }, SECRET))
        .status,
    ).toBe(405);
    expect(stripe.calls).toEqual([]);
    expect(await entitlement()).toBeUndefined();
    expect((await db.collection("stripeEvents").get()).size).toBe(0);
  });

  // @req PAY-002 @req PAY-003
  it("a signed subscription event grants Pro (doc + claim + art quota) and records the event", async () => {
    await linkCustomer("cus_1");
    stripe.addSubscription("cus_1", "active", "sub_a", U);
    const e = signedEvent("customer.subscription.created", {
      id: "sub_a",
      customer: "cus_1",
      status: "active",
      metadata: { firebaseUID: U },
    });
    expect(await deliver(e)).toEqual({ status: 200, body: { received: true, pro: true } });
    expect(await entitlement()).toMatchObject({ pro: true, source: "subscription" });
    expect((await auth.getUser(U)).customClaims).toEqual({ pro: true });
    expect(quotaRuns).toEqual([U]);
    const marker = (await db.doc(`stripeEvents/${e.id}`).get()).data()!;
    expect(marker).toMatchObject({ type: "customer.subscription.created", matched: true });
    expect(marker.expireAt).toBeInstanceOf(Timestamp);
    expect((marker.expireAt as Timestamp).toMillis()).toBe(clock + 30 * 24 * 3600 * 1000);
  });

  // @req PAY-003
  it("skips a duplicate delivery of the same event id", async () => {
    await linkCustomer("cus_1");
    stripe.addSubscription("cus_1", "active", "sub_a", U);
    const e = signedEvent("invoice.paid", { id: "in_1", customer: "cus_1" });
    await deliver(e);
    const callsAfterFirst = stripe.calls.length;
    expect(await deliver(e)).toEqual({ status: 200, body: { duplicate: true } });
    expect(stripe.calls.length).toBe(callsAfterFirst);
  });

  // @req PAY-003
  it("out-of-order events converge on Stripe's current state (re-fetch, not the payload)", async () => {
    await linkCustomer("cus_1");
    // Current truth in Stripe: the subscription was canceled.
    stripe.addSubscription("cus_1", "canceled", "sub_a", U);
    const deleted = signedEvent("customer.subscription.deleted", {
      id: "sub_a",
      customer: "cus_1",
      status: "canceled",
      metadata: { firebaseUID: U },
    });
    // ...and the older "created (active)" event arrives AFTER the deletion.
    const lateCreated = signedEvent("customer.subscription.created", {
      id: "sub_a",
      customer: "cus_1",
      status: "active",
      metadata: { firebaseUID: U },
    });
    await deliver(deleted);
    await deliver(lateCreated);
    expect(await entitlement()).toMatchObject({ pro: false, source: "none" });
    // The reverse: a stale "past_due" update after the renewal succeeded.
    stripe.subscriptions.set("sub_a", { ...stripe.subscriptions.get("sub_a")!, status: "active" });
    await deliver(signedEvent("invoice.paid", { id: "in_2", customer: "cus_1" }));
    await deliver(
      signedEvent("customer.subscription.updated", {
        id: "sub_a",
        customer: "cus_1",
        status: "past_due",
        metadata: { firebaseUID: U },
      }),
    );
    expect(await entitlement()).toMatchObject({ pro: true, source: "subscription" });
  });

  // @req PAY-003
  it.each([
    ["active", true],
    ["trialing", true],
    ["past_due", false],
    ["unpaid", false],
    ["paused", false],
    ["canceled", false],
    ["incomplete", false],
  ])("subscription %s → pro %s (entitlements.ts policy)", async (status, pro) => {
    await linkCustomer("cus_1");
    stripe.addSubscription("cus_1", status, "sub_a", U);
    await deliver(
      signedEvent("customer.subscription.updated", {
        id: "sub_a",
        customer: "cus_1",
        metadata: { firebaseUID: U },
      }),
    );
    expect((await entitlement())?.pro).toBe(pro);
    expect((await auth.getUser(U)).customClaims?.pro).toBe(pro);
  });

  // @req PAY-003
  it("finds the uid from the customer's metadata when the event carries none", async () => {
    await linkCustomer("cus_1");
    stripe.customers.set("cus_1", {
      id: "cus_1",
      deleted: false,
      email: null,
      metadata: { firebaseUID: U },
    });
    stripe.addSubscription("cus_1", "active");
    expect(
      (
        await deliver(
          signedEvent("invoice.payment_failed", { id: "in_1", customer: { id: "cus_1" } }),
        )
      ).body,
    ).toEqual({ received: true, pro: true });
    expect(stripe.calls).toContain("retrieveCustomer");
    // invoices: parent.subscription_details.metadata (no customer lookup needed)
    stripe.calls.length = 0;
    await deliver(
      signedEvent("invoice.paid", {
        id: "in_2",
        customer: "cus_1",
        parent: { subscription_details: { metadata: { firebaseUID: U } } },
      }),
    );
    expect(stripe.calls).not.toContain("retrieveCustomer");
    // checkout.session.completed: client_reference_id
    stripe.calls.length = 0;
    await deliver(
      signedEvent("checkout.session.completed", {
        id: "cs_1",
        client_reference_id: U,
        customer: "cus_1",
      }),
    );
    expect(stripe.calls).not.toContain("retrieveCustomer");
  });

  it("acknowledges events it can't match or doesn't handle (200, no processing)", async () => {
    const unmatched = signedEvent("invoice.paid", { id: "in_1", customer: "cus_unknown" });
    expect(await deliver(unmatched)).toEqual({
      status: 200,
      body: { received: true, unmatched: true },
    });
    stripe.calls.length = 0;
    const other = signedEvent("product.updated", { id: "prod_1" });
    expect(await deliver(other)).toEqual({ status: 200, body: { ignored: "product.updated" } });
    expect(stripe.calls).toEqual([]);
    expect((await db.doc(`stripeEvents/${other.id}`).get()).exists).toBe(false);
    expect(HANDLED_EVENTS.has("charge.dispute.created")).toBe(true);
  });

  // @req PAY-003
  it("a refund or a dispute revokes lifetime Pro (B-8)", async () => {
    deps.config = config({ lifetimePriceIds: new Set(["price_lifetime"]) });
    await linkCustomer("cus_1");
    stripe.customers.set("cus_1", {
      id: "cus_1",
      deleted: false,
      email: null,
      metadata: { firebaseUID: U },
    });
    const pi = stripe.addPayment("cus_1", {
      metadata: { firebaseUID: U, priceId: "price_lifetime" },
    });
    await deliver(
      signedEvent("checkout.session.completed", {
        id: "cs_1",
        client_reference_id: U,
        customer: "cus_1",
      }),
    );
    expect(await entitlement()).toMatchObject({ pro: true, source: "lifetime" });

    // Partial refund keeps it; a full refund revokes it.
    stripe.payments.set(pi, { ...stripe.payments.get(pi)!, amountRefunded: 1000 });
    await deliver(signedEvent("charge.refunded", { id: "ch_1", customer: "cus_1" }));
    expect((await entitlement())?.pro).toBe(true);
    stripe.payments.set(pi, { ...stripe.payments.get(pi)!, amountRefunded: 2999, refunded: true });
    await deliver(signedEvent("charge.refunded", { id: "ch_1", customer: "cus_1" }));
    expect(await entitlement()).toMatchObject({ pro: false, source: "none" });

    // A second lifetime purchase, then a dispute (the dispute object has only the charge id).
    const pi2 = stripe.addPayment("cus_1", {});
    await deliver(
      signedEvent("checkout.session.completed", { id: "cs_2", client_reference_id: U }),
    );
    expect((await entitlement())?.pro).toBe(true);
    stripe.payments.set(pi2, { ...stripe.payments.get(pi2)!, disputed: true });
    stripe.charges.set("ch_2", "cus_1");
    await deliver(signedEvent("charge.dispute.created", { id: "dp_1", charge: "ch_2" }));
    expect(stripe.calls).toContain("chargeCustomer");
    expect(await entitlement()).toMatchObject({ pro: false, source: "none" });
    expect((await auth.getUser(U)).customClaims).toEqual({ pro: false });
  });

  it("one-time payments of non-lifetime prices never grant Pro", async () => {
    deps.config = config({ lifetimePriceIds: new Set(["price_lifetime"]) });
    await linkCustomer("cus_1");
    stripe.addPayment("cus_1", { priceId: "price_other" });
    stripe.addPayment("cus_1", { priceId: null });
    await deliver(
      signedEvent("charge.refunded", {
        id: "ch_1",
        customer: "cus_1",
        metadata: { firebaseUID: U },
      }),
    );
    expect(await entitlement()).toMatchObject({ pro: false });
    // Without a configured lifetime price, payments aren't even listed.
    deps.config = config();
    stripe.calls.length = 0;
    await deliver(
      signedEvent("invoice.paid", { id: "in_9", customer: "cus_1", metadata: { firebaseUID: U } }),
    );
    expect(stripe.calls).not.toContain("listPayments");
  });

  // @req AUTH-005
  it("B-3: never writes for a deleted Auth user (late webhook)", async () => {
    await auth.deleteUser(U);
    stripe.addSubscription("cus_1", "canceled", "sub_a", U);
    const r = await deliver(
      signedEvent("customer.subscription.deleted", {
        id: "sub_a",
        customer: "cus_1",
        metadata: { firebaseUID: U },
      }),
    );
    expect(r.status).toBe(200);
    expect(await entitlement()).toBeUndefined();
    expect(stripe.calls).not.toContain("listSubscriptions");
  });

  it("a processing failure throws (→ 500, Stripe retries) and is not recorded", async () => {
    await linkCustomer("cus_1");
    stripe.addSubscription("cus_1", "active", "sub_a", U);
    const e = signedEvent("customer.subscription.created", {
      id: "sub_a",
      customer: "cus_1",
      metadata: { firebaseUID: U },
    });
    stripe.failNext.listSubscriptions = Object.assign(new Error("api down"), { statusCode: 500 });
    await expect(deliver(e)).rejects.toThrow("api down");
    expect((await db.doc(`stripeEvents/${e.id}`).get()).exists).toBe(false);
    expect(await deliver(e)).toEqual({ status: 200, body: { received: true, pro: true } });
  });

  it("keeps an owner-granted (manual) entitlement", async () => {
    await db
      .doc(`users/${U}/private/entitlements`)
      .set({ pro: true, source: "manual", updatedAt: Timestamp.now() });
    await linkCustomer("cus_1");
    stripe.addSubscription("cus_1", "canceled", "sub_a", U);
    await deliver(
      signedEvent("customer.subscription.deleted", {
        id: "sub_a",
        customer: "cus_1",
        metadata: { firebaseUID: U },
      }),
    );
    expect(await entitlement()).toMatchObject({ pro: true, source: "manual" });
  });
});

describe("refreshEntitlements (Restore purchases)", () => {
  // @req PAY-004
  it("re-fetches from Stripe and recomputes; rate-limited to once per 30 s", async () => {
    await rejects(refreshEntitlements(deps, null), "unauthenticated");
    expect(await refreshEntitlements(deps, caller())).toEqual({ pro: false, source: "none" });
    await linkCustomer("cus_1");
    stripe.addSubscription("cus_1", "active");
    clock += 5_000;
    await rejects(refreshEntitlements(deps, caller()), "resource-exhausted", "rate-limited");
    expect(await entitlement()).toMatchObject({ pro: false });
    clock += REFRESH_INTERVAL_MS;
    expect(await refreshEntitlements(deps, caller())).toEqual({
      pro: true,
      source: "subscription",
    });
    expect(await entitlement()).toMatchObject({ pro: true, source: "subscription" });
    expect(await mapping()).toEqual({ customerId: "cus_1", refreshedAt: clock });
    // Other users have their own limit.
    await auth.deleteUser("other-user").catch(() => undefined);
    await auth.createUser({ uid: "other-user" });
    expect(await refreshEntitlements(deps, caller({ uid: "other-user" }))).toMatchObject({
      pro: false,
    });
  });

  // @req PAY-004
  it("works for an anonymous caller too (no purchase → not Pro)", async () => {
    await auth.deleteUser("anon-user").catch(() => undefined);
    await auth.createUser({ uid: "anon-user" });
    expect(await refreshEntitlements(deps, caller({ uid: "anon-user", anonymous: true }))).toEqual({
      pro: false,
      source: "none",
    });
  });
});
