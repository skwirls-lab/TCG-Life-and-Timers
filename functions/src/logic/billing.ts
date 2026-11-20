/**
 * Pro payments with the app's own Stripe integration (PAY-002, PAY-003, SEC-002, D-082).
 *
 *   createCheckoutSession  signed-in (non-anonymous) caller buys an allowlisted price
 *   createPortalSession    Stripe Billing Portal ("Manage subscription")
 *   refreshEntitlements    "Restore purchases": re-fetch from Stripe and recompute (rate-limited)
 *   handleStripeWebhook    signed Stripe events → re-fetch from Stripe and recompute
 *
 * Data (all server-only except the entitlements doc, see firestore.rules):
 *   users/{uid}/private/stripe        { customerId, refreshedAt? }        uid → Stripe customer
 *   users/{uid}/private/entitlements  { pro, source, updatedAt }          client-readable (owner)
 *   stripeEvents/{eventId}            { type, processedAt, expireAt }     webhook idempotency (TTL)
 *
 * Every webhook and refresh recomputes from the customer's CURRENT state in Stripe (all
 * subscriptions, plus one-time payments when a lifetime price is configured), never from the
 * event payload, so out-of-order and duplicate deliveries always converge on the right answer.
 * Dependencies are structural (D-016); the Stripe client is a `StripePort` (./stripe.ts).
 */
import { isLifetimePayment, type PaymentLike } from "./entitlements";
import { isSafeUid } from "./deleteUserData";
import {
  constructWebhookEvent,
  isStripeId,
  type StripePayment,
  type StripePort,
  type StripeSubscription,
} from "./stripe";
import {
  syncEntitlements,
  type ClaimsAuthLike,
  type PurchaseState,
  type SyncEntitlementsResult,
} from "./syncEntitlements";

// ---------- config ----------

/** The two prices of "TCGTempo Pro" (monthly $1.99, yearly $19.99). */
export const DEFAULT_PRICE_IDS = [
  "price_1UdwGcArytmUxb6t7Ik7ScRb",
  "price_1UdwGcArytmUxb6tJrrS0mpq",
] as const;
export const DEFAULT_APP_BASE_URL = "https://tcgtempo.skwirls.com";
export const DEFAULT_RETURN_ORIGINS = ["https://tcgtempo.skwirls.com", "https://tcgtempo.web.app"];
export const REFRESH_INTERVAL_MS = 30_000;
export const STRIPE_EVENT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface BillingConfig {
  /** Recurring prices that may be bought (STRIPE_PRICE_IDS). */
  priceIds: ReadonlySet<string>;
  /** One-time prices that grant lifetime Pro (LIFETIME_PRICE_IDS); also purchasable. */
  lifetimePriceIds: ReadonlySet<string>;
  /** Default origin for success / cancel / return URLs (APP_BASE_URL). */
  baseUrl: string;
  /** Client-supplied return origins accepted as-is (APP_RETURN_ORIGINS). */
  returnOrigins: ReadonlySet<string>;
  /** Emulator only: also accept http://127.0.0.1:* and http://localhost:* origins. */
  allowLocalOrigins?: boolean;
  /** STRIPE_AUTOMATIC_TAX: Stripe Tax on Checkout. */
  automaticTax: boolean;
}

// ---------- dependencies ----------

interface Snap {
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}
export interface BillingDocRef {
  get(): Promise<Snap>;
  set(data: Record<string, unknown>): Promise<unknown>;
}
export interface BillingTransaction {
  get(ref: BillingDocRef): Promise<Snap>;
  set(ref: BillingDocRef, data: Record<string, unknown>, options: { merge: true }): unknown;
}
export interface BillingFirestore {
  doc(path: string): BillingDocRef;
  runTransaction<T>(fn: (tx: BillingTransaction) => Promise<T>): Promise<T>;
}

export interface BillingDeps {
  firestore: BillingFirestore;
  auth: ClaimsAuthLike;
  stripe: StripePort;
  serverTimestamp: () => unknown;
  now: () => number;
  config: BillingConfig;
  /** Called after the entitlements doc changed (art quota recompute, B-4). */
  onEntitlementsChanged?: (uid: string) => Promise<unknown>;
}

/** Who is calling a callable (from the verified ID token). */
export interface Caller {
  uid: string;
  anonymous: boolean;
  email: string | null;
}

export type BillingErrorCode =
  | "unauthenticated"
  | "failed-precondition"
  | "invalid-argument"
  | "not-found"
  | "resource-exhausted";

/** Mapped 1:1 to an HttpsError by index.ts; `reason` is a stable machine-readable detail. */
export class BillingError extends Error {
  constructor(
    readonly code: BillingErrorCode,
    readonly reason: string,
    message: string,
  ) {
    super(message);
    this.name = "BillingError";
  }
}

// ---------- helpers ----------

export const stripeDocPath = (uid: string) => `users/${uid}/private/stripe`;

function requireCaller(caller: Caller | null): Caller {
  if (!caller || !isSafeUid(caller.uid))
    throw new BillingError("unauthenticated", "unauthenticated", "Sign in first.");
  return caller;
}

function requireAccount(caller: Caller | null): Caller {
  const c = requireCaller(caller);
  if (c.anonymous)
    throw new BillingError(
      "failed-precondition",
      "sign-in-required",
      "Sign in with Google before buying, so the purchase follows your account.",
    );
  return c;
}

function field(data: unknown, key: string): unknown {
  return data && typeof data === "object" ? (data as Record<string, unknown>)[key] : undefined;
}

/** The origin for success / cancel / portal-return URLs: an allowlisted request, else the base. */
export function resolveOrigin(config: BillingConfig, requested: unknown): string {
  if (typeof requested === "string" && requested.length <= 200) {
    try {
      const u = new URL(requested);
      if (config.returnOrigins.has(u.origin) || u.origin === new URL(config.baseUrl).origin)
        return u.origin;
      const local = u.hostname === "127.0.0.1" || u.hostname === "localhost";
      if (config.allowLocalOrigins && local && u.protocol === "http:") return u.origin;
    } catch {
      // not a URL: fall through to the base
    }
  }
  return new URL(config.baseUrl).origin;
}

export async function mappedCustomer(deps: BillingDeps, uid: string): Promise<string | null> {
  const snap = await deps.firestore.doc(stripeDocPath(uid)).get();
  const id = snap.exists ? snap.data()?.customerId : undefined;
  return isStripeId(id, "cus") ? id : null;
}

/**
 * The caller's Stripe customer, created on first use with metadata.firebaseUID. The idempotency
 * key is deterministic per uid, so concurrent calls (two taps, two tabs) get the SAME customer
 * back from Stripe; the mapping is written in a transaction that keeps a value another call
 * wrote meanwhile. A mapped customer that no longer exists (deleted in the dashboard, or a
 * test-mode id after switching to live keys) is replaced, under a key that names the stale id.
 */
export async function getOrCreateCustomer(deps: BillingDeps, caller: Caller): Promise<string> {
  const stale = await mappedCustomer(deps, caller.uid);
  if (stale) {
    const c = await deps.stripe.retrieveCustomer(stale);
    if (c && !c.deleted) return stale;
  }
  const created = await deps.stripe.createCustomer(
    { uid: caller.uid, email: caller.email },
    `tcgtempo-customer-${caller.uid}${stale ? `-after-${stale}` : ""}`,
  );
  const ref = deps.firestore.doc(stripeDocPath(caller.uid));
  return deps.firestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const cur = snap.exists ? snap.data()?.customerId : undefined;
    if (isStripeId(cur, "cus") && cur !== stale) return cur;
    tx.set(ref, { customerId: created.id }, { merge: true });
    return created.id;
  });
}

/** Stripe objects → the shapes entitlements.ts computes from. */
export function paymentLike(p: StripePayment): PaymentLike {
  return {
    status: p.status,
    price: p.priceId,
    amount: p.amount,
    amount_received: p.amountReceived,
    amount_refunded: p.amountRefunded,
    refunded: p.refunded,
    disputed: p.disputed,
  };
}

export async function loadPurchases(
  deps: BillingDeps,
  customerId: string,
): Promise<PurchaseState & { raw: StripeSubscription[] }> {
  const [subs, payments] = await Promise.all([
    deps.stripe.listSubscriptions(customerId),
    // One-time payments matter only when a lifetime price is configured (none is sold today).
    deps.config.lifetimePriceIds.size > 0
      ? deps.stripe.listPayments(customerId)
      : Promise.resolve([]),
  ]);
  return {
    raw: subs,
    subscriptions: subs.map((s) => ({ status: s.status })),
    payments: payments.map(paymentLike),
  };
}

/** Re-fetch the user's state from Stripe and rewrite their entitlement (+ claim, art quota). */
export async function syncFromStripe(
  deps: BillingDeps,
  uid: string,
): Promise<SyncEntitlementsResult> {
  const r = await syncEntitlements(
    {
      firestore: deps.firestore,
      auth: deps.auth,
      serverTimestamp: deps.serverTimestamp,
      lifetimePriceIds: deps.config.lifetimePriceIds,
    },
    uid,
    async () => {
      const customerId = await mappedCustomer(deps, uid);
      return customerId ? loadPurchases(deps, customerId) : { subscriptions: [], payments: [] };
    },
  );
  if (r.written && !r.userDeleted) await deps.onEntitlementsChanged?.(uid);
  return r;
}

/** A live subscription the Billing Portal manages: buying again would double-charge. */
const LIVE_SUB = new Set(["active", "trialing", "past_due", "unpaid", "paused"]);

// ---------- callables ----------

export type CheckoutResult = { url: string } | { status: "alreadyPro" };

export async function createCheckoutSession(
  deps: BillingDeps,
  callerIn: Caller | null,
  input: unknown,
): Promise<CheckoutResult> {
  const caller = requireAccount(callerIn);
  const priceId = field(input, "priceId");
  const { priceIds, lifetimePriceIds } = deps.config;
  if (typeof priceId !== "string" || !(priceIds.has(priceId) || lifetimePriceIds.has(priceId)))
    throw new BillingError("invalid-argument", "price-not-allowed", "Unknown price.");
  const lifetime = lifetimePriceIds.has(priceId);

  const price = await deps.stripe.retrievePrice(priceId);
  if (!price || !price.active)
    throw new BillingError("failed-precondition", "price-unavailable", "This plan isn't on sale.");
  // A one-time price must be a lifetime price (it grants nothing otherwise), and vice versa.
  if (price.recurring === lifetime)
    throw new BillingError(
      "failed-precondition",
      "price-misconfigured",
      "This plan is misconfigured.",
    );

  const origin = resolveOrigin(deps.config, field(input, "returnOrigin"));
  const customer = await getOrCreateCustomer(deps, caller);

  const current = await loadPurchases(deps, customer);
  const lifetimeOwned = current.payments.some((p) => isLifetimePayment(p, lifetimePriceIds));
  if (lifetimeOwned || current.raw.some((s) => LIVE_SUB.has(s.status))) {
    // Make sure the app sees it too (e.g. a missed webhook), then send them to the portal.
    await syncFromStripe(deps, caller.uid);
    return { status: "alreadyPro" };
  }

  const session = await deps.stripe.createCheckoutSession({
    mode: lifetime ? "payment" : "subscription",
    customer,
    priceId,
    uid: caller.uid,
    successUrl: `${origin}/pro?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${origin}/pro?checkout=cancel`,
    automaticTax: deps.config.automaticTax,
  });
  return { url: session.url };
}

export async function createPortalSession(
  deps: BillingDeps,
  callerIn: Caller | null,
  input: unknown,
): Promise<{ url: string }> {
  const caller = requireCaller(callerIn);
  const customer = await mappedCustomer(deps, caller.uid);
  if (!customer)
    throw new BillingError("not-found", "no-customer", "No purchase is linked to this account.");
  const origin = resolveOrigin(deps.config, field(input, "returnOrigin"));
  return deps.stripe.createPortalSession({ customer, returnUrl: `${origin}/pro` });
}

/** "Restore purchases": once per REFRESH_INTERVAL_MS per uid. */
export async function refreshEntitlements(
  deps: BillingDeps,
  callerIn: Caller | null,
): Promise<{ pro: boolean; source: string }> {
  const caller = requireCaller(callerIn);
  const ref = deps.firestore.doc(stripeDocPath(caller.uid));
  const now = deps.now();
  const allowed = await deps.firestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const last = snap.exists ? snap.data()?.refreshedAt : undefined;
    if (typeof last === "number" && now - last < REFRESH_INTERVAL_MS && now >= last) return false;
    tx.set(ref, { refreshedAt: now }, { merge: true });
    return true;
  });
  if (!allowed)
    throw new BillingError(
      "resource-exhausted",
      "rate-limited",
      "Checked a moment ago. Try again in a few seconds.",
    );
  const r = await syncFromStripe(deps, caller.uid);
  return { pro: r.pro, source: r.source };
}

// ---------- webhook ----------

export const HANDLED_EVENTS: ReadonlySet<string> = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "invoice.paid",
  "invoice.payment_failed",
  "charge.refunded",
  "charge.dispute.created",
]);

interface EventLike {
  id: string;
  type: string;
  data: { object: unknown };
}

const idOf = (v: unknown): string | null =>
  typeof v === "string"
    ? v
    : typeof field(v, "id") === "string"
      ? (field(v, "id") as string)
      : null;

/** The Firebase uid an event is about: server-set metadata first, else the customer's metadata. */
export async function resolveEventUid(deps: BillingDeps, event: EventLike): Promise<string | null> {
  const obj = event.data.object;
  const candidates = [
    field(field(obj, "metadata"), "firebaseUID"),
    field(obj, "client_reference_id"),
    // invoices carry the subscription's metadata under parent.subscription_details
    field(field(field(field(obj, "parent"), "subscription_details"), "metadata"), "firebaseUID"),
  ];
  for (const c of candidates) if (typeof c === "string" && isSafeUid(c)) return c;

  let customer = idOf(field(obj, "customer"));
  if (!customer && event.type.startsWith("charge.dispute.")) {
    const charge = idOf(field(obj, "charge"));
    if (isStripeId(charge, "ch") || isStripeId(charge, "py"))
      customer = await deps.stripe.chargeCustomer(charge);
  }
  if (!isStripeId(customer, "cus")) return null;
  const c = await deps.stripe.retrieveCustomer(customer);
  const uid = c?.metadata.firebaseUID;
  return typeof uid === "string" && isSafeUid(uid) ? uid : null;
}

export interface WebhookRequest {
  method: string;
  rawBody: Buffer | string | undefined;
  signature: string | string[] | undefined;
}
export interface WebhookResponse {
  status: number;
  body: Record<string, unknown>;
}

/**
 * Verify, de-duplicate, re-fetch, recompute. Throws only on a processing failure (index.ts answers
 * 500, so Stripe retries); bad signatures are 400 and never processed.
 */
export async function handleStripeWebhook(
  deps: BillingDeps,
  req: WebhookRequest,
  webhookSecret: string,
): Promise<WebhookResponse> {
  if (req.method !== "POST") return { status: 405, body: { error: "method not allowed" } };
  let event: EventLike;
  try {
    event = constructWebhookEvent(req.rawBody ?? "", req.signature, webhookSecret);
  } catch {
    return { status: 400, body: { error: "invalid signature" } };
  }
  if (!HANDLED_EVENTS.has(event.type)) return { status: 200, body: { ignored: event.type } };
  if (!isStripeId(event.id, "evt")) return { status: 400, body: { error: "invalid event id" } };

  const marker = deps.firestore.doc(`stripeEvents/${event.id}`);
  if ((await marker.get()).exists) return { status: 200, body: { duplicate: true } };

  const uid = await resolveEventUid(deps, event);
  let pro: boolean | null = null;
  if (uid) pro = (await syncFromStripe(deps, uid)).pro;

  // Recorded only after a successful recompute: a failed attempt is retried by Stripe.
  await marker.set({
    type: event.type,
    processedAt: deps.serverTimestamp(),
    expireAt: new Date(deps.now() + STRIPE_EVENT_TTL_MS),
    matched: uid !== null,
  });
  return { status: 200, body: uid ? { received: true, pro } : { received: true, unmatched: true } };
}
