/**
 * The app's own Stripe integration (replaces the "Run Payments with Stripe" extension, D-082).
 *
 * Every Stripe call the functions make goes through `StripePort`, a small interface over the
 * official SDK. The handlers (./billing.ts, ./deleteUserData.ts) receive a port, so the tests pass
 * an in-memory fake and never reach api.stripe.com. `stripeSdkPort` is the production adapter.
 *
 * The secret key arrives from Secret Manager (STRIPE_SECRET_KEY, index.ts) and is never logged.
 */
import Stripe from "stripe";

/**
 * Pinned Stripe API version: the one the installed SDK ships with (`Stripe.API_VERSION`; a test
 * fails when an SDK upgrade changes it, so the pin moves on purpose).
 */
export const STRIPE_API_VERSION = "2026-11-18.endive" as const;

export interface StripeSubscription {
  id: string;
  /** active | trialing | past_due | unpaid | paused | canceled | incomplete | incomplete_expired */
  status: string;
  customer: string;
  priceIds: string[];
  metadata: Record<string, string>;
}

/** A one-time payment (PaymentIntent + its latest charge), in the shape entitlements.ts reads. */
export interface StripePayment {
  id: string;
  /** PaymentIntent status ("succeeded" grants) */
  status: string;
  amount: number;
  amountReceived: number;
  /** From the latest charge: refunds and disputes revoke lifetime (B-8). */
  amountRefunded: number;
  refunded: boolean;
  disputed: boolean;
  /** The price bought, as recorded server-side by createCheckoutSession (metadata.priceId). */
  priceId: string | null;
  metadata: Record<string, string>;
}

export interface StripeCustomer {
  id: string;
  deleted: boolean;
  email: string | null;
  metadata: Record<string, string>;
}

export interface StripePrice {
  id: string;
  active: boolean;
  /** true for recurring (subscription) prices, false for one-time prices */
  recurring: boolean;
}

export interface CheckoutSessionParams {
  mode: "subscription" | "payment";
  customer: string;
  priceId: string;
  uid: string;
  successUrl: string;
  cancelUrl: string;
  automaticTax: boolean;
}

export interface StripePort {
  /** Create a customer. `idempotencyKey` makes concurrent / retried calls return the same one. */
  createCustomer(
    p: { uid: string; email: string | null },
    idempotencyKey: string,
  ): Promise<{ id: string }>;
  /** null when the customer doesn't exist. */
  retrieveCustomer(id: string): Promise<StripeCustomer | null>;
  /** Resolves when the customer is deleted or no longer exists. */
  deleteCustomer(id: string): Promise<void>;
  /** null when the price doesn't exist. */
  retrievePrice(id: string): Promise<StripePrice | null>;
  createCheckoutSession(p: CheckoutSessionParams): Promise<{ id: string; url: string }>;
  createPortalSession(p: { customer: string; returnUrl: string }): Promise<{ url: string }>;
  /** Every subscription of the customer, any status (current state, never cached). */
  listSubscriptions(customer: string): Promise<StripeSubscription[]>;
  /** Cancel immediately. Resolves when it is canceled or no longer exists. */
  cancelSubscription(id: string): Promise<void>;
  /** The customer's PaymentIntents with their latest charge (only read when lifetime is sold). */
  listPayments(customer: string): Promise<StripePayment[]>;
  /** The customer id of a charge (for dispute events), or null. */
  chargeCustomer(chargeId: string): Promise<string | null>;
}

/** Subscription statuses that can still bill (everything but the terminal ones). */
const TERMINAL = new Set(["canceled", "incomplete_expired"]);

export function isBillableSubscription(status: unknown): boolean {
  return typeof status === "string" && !TERMINAL.has(status);
}

/** Stripe ids are `<prefix>_` + alphanumerics; anything else is never sent to the API. */
export function isStripeId(id: unknown, prefix: string): id is string {
  return typeof id === "string" && new RegExp(`^${prefix}_[A-Za-z0-9]{1,250}$`).test(id);
}

export function isSubscriptionId(id: string): boolean {
  return isStripeId(id, "sub");
}

/** Parses a comma/whitespace separated list such as "price_a, price_b". */
export function parseIdList(raw: string | undefined): Set<string> {
  return new Set((raw ?? "").split(/[\s,]+/).filter(Boolean));
}

const idOf = (v: unknown): string | null =>
  typeof v === "string" ? v : v && typeof v === "object" && "id" in v ? String(v.id) : null;

function stringMap(m: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (m && typeof m === "object")
    for (const [k, v] of Object.entries(m)) if (typeof v === "string") out[k] = v;
  return out;
}

function isMissing(err: unknown): boolean {
  const e = err as { statusCode?: unknown; code?: unknown } | null;
  return e?.statusCode === 404 || e?.code === "resource_missing";
}

/** Error text without request details (no keys, no headers). */
export function stripeErrorText(err: unknown): string {
  const e = err as { type?: unknown; code?: unknown; statusCode?: unknown } | null;
  const parts = [e?.type, e?.code, e?.statusCode].filter((x) => x !== undefined && x !== null);
  return parts.length ? parts.map(String).join("/") : "stripe error";
}

export function mapSubscription(s: Stripe.Subscription): StripeSubscription {
  return {
    id: s.id,
    status: s.status,
    customer: idOf(s.customer) ?? "",
    priceIds: s.items.data.map((i) => i.price.id),
    metadata: stringMap(s.metadata),
  };
}

export function mapPaymentIntent(pi: Stripe.PaymentIntent): StripePayment {
  const charge =
    pi.latest_charge && typeof pi.latest_charge === "object" ? pi.latest_charge : undefined;
  const metadata = stringMap(pi.metadata);
  return {
    id: pi.id,
    status: pi.status,
    amount: pi.amount,
    amountReceived: pi.amount_received,
    amountRefunded: charge?.amount_refunded ?? 0,
    refunded: charge?.refunded ?? false,
    disputed: charge?.disputed ?? false,
    priceId: metadata.priceId ?? null,
    metadata,
  };
}

/** The production port over the official SDK (`maxNetworkRetries` retries 5xx/429 safely). */
export function stripeSdkPort(secretKey: string, config: Stripe.StripeConfig = {}): StripePort {
  const stripe = new Stripe(secretKey, {
    apiVersion: STRIPE_API_VERSION,
    maxNetworkRetries: 2,
    appInfo: { name: "tcgtempo-functions" },
    ...config,
  });
  return {
    async createCustomer({ uid, email }, idempotencyKey) {
      const c = await stripe.customers.create(
        { ...(email ? { email } : {}), metadata: { firebaseUID: uid } },
        { idempotencyKey },
      );
      return { id: c.id };
    },
    async retrieveCustomer(id) {
      try {
        const c = await stripe.customers.retrieve(id);
        if ("deleted" in c && c.deleted) return { id, deleted: true, email: null, metadata: {} };
        const live = c as Stripe.Customer;
        return {
          id,
          deleted: false,
          email: live.email ?? null,
          metadata: stringMap(live.metadata),
        };
      } catch (err) {
        if (isMissing(err)) return null;
        throw err;
      }
    },
    async deleteCustomer(id) {
      try {
        await stripe.customers.del(id);
      } catch (err) {
        if (!isMissing(err)) throw err;
      }
    },
    async retrievePrice(id) {
      try {
        const p = await stripe.prices.retrieve(id);
        return { id: p.id, active: p.active, recurring: p.type === "recurring" };
      } catch (err) {
        if (isMissing(err)) return null;
        throw err;
      }
    },
    async createCheckoutSession(p) {
      const metadata = { firebaseUID: p.uid };
      const params: Stripe.Checkout.SessionCreateParams = {
        mode: p.mode,
        customer: p.customer,
        client_reference_id: p.uid,
        line_items: [{ price: p.priceId, quantity: 1 }],
        allow_promotion_codes: true,
        success_url: p.successUrl,
        cancel_url: p.cancelUrl,
        metadata,
        ...(p.mode === "subscription"
          ? { subscription_data: { metadata } }
          : { payment_intent_data: { metadata: { ...metadata, priceId: p.priceId } } }),
        ...(p.automaticTax
          ? { automatic_tax: { enabled: true }, customer_update: { address: "auto", name: "auto" } }
          : {}),
      };
      const s = await stripe.checkout.sessions.create(params);
      if (!s.url) throw new Error("stripe returned a checkout session without a url");
      return { id: s.id, url: s.url };
    },
    async createPortalSession({ customer, returnUrl }) {
      const s = await stripe.billingPortal.sessions.create({ customer, return_url: returnUrl });
      return { url: s.url };
    },
    async listSubscriptions(customer) {
      const list = await stripe.subscriptions
        .list({ customer, status: "all", limit: 100 })
        .autoPagingToArray({ limit: 1000 });
      return list.map(mapSubscription);
    },
    async cancelSubscription(id) {
      if (!isSubscriptionId(id)) throw new Error(`invalid subscription id: ${JSON.stringify(id)}`);
      try {
        await stripe.subscriptions.cancel(id);
      } catch (err) {
        if (isMissing(err)) return;
        // Canceling an already-canceled subscription answers 400; that is the goal state.
        const e = err as { statusCode?: unknown; message?: unknown };
        if (e.statusCode === 400 && /cancel/i.test(String(e.message ?? ""))) return;
        throw err;
      }
    },
    async listPayments(customer) {
      const list = await stripe.paymentIntents
        .list({ customer, limit: 100, expand: ["data.latest_charge"] })
        .autoPagingToArray({ limit: 1000 });
      return list.map(mapPaymentIntent);
    },
    async chargeCustomer(chargeId) {
      try {
        const c = await stripe.charges.retrieve(chargeId);
        return idOf(c.customer);
      } catch (err) {
        if (isMissing(err)) return null;
        throw err;
      }
    },
  };
}

/** Verify a webhook signature and parse the event (throws on a bad / stale signature). */
export function constructWebhookEvent(
  rawBody: Buffer | string,
  signature: string | string[] | undefined,
  secret: string,
): Stripe.Event {
  if (!signature) throw new Error("missing stripe-signature header");
  if (!secret) throw new Error("webhook secret not configured");
  return Stripe.webhooks.constructEvent(rawBody, signature, secret);
}

/** Test helper re-export: signs a payload like Stripe does (the real SDK implementation). */
export function signWebhookPayload(payload: string, secret: string, timestamp?: number): string {
  return Stripe.webhooks.generateTestHeaderString({ payload, secret, timestamp });
}

export const SDK_API_VERSION: string = Stripe.API_VERSION;
