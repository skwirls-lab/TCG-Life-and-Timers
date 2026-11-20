/**
 * In-memory StripePort (no network). Mirrors the Stripe behaviours the handlers rely on:
 * idempotency keys return the same customer, subscriptions/payments are listed from the CURRENT
 * state, and every call is logged so tests can assert what was (not) sent.
 */
import type {
  CheckoutSessionParams,
  StripeCustomer,
  StripePayment,
  StripePort,
  StripePrice,
  StripeSubscription,
} from "../../../functions/src/logic/stripe";

export interface FakeStripe extends StripePort {
  customers: Map<string, StripeCustomer>;
  subscriptions: Map<string, StripeSubscription>;
  payments: Map<string, StripePayment & { customer: string }>;
  prices: Map<string, StripePrice>;
  charges: Map<string, string>;
  sessions: CheckoutSessionParams[];
  calls: string[];
  /** Make the next call of a method reject with this error. */
  failNext: Partial<Record<keyof StripePort, unknown>>;
  /** Test helpers: put state "in Stripe". */
  addSubscription(customer: string, status: string, id?: string, uid?: string): string;
  addPayment(customer: string, p: Partial<StripePayment>): string;
}

const tick = () => new Promise((r) => setTimeout(r, 5));

export function fakeStripe(): FakeStripe {
  let n = 0;
  const idem = new Map<string, string>();
  const f: FakeStripe = {
    customers: new Map(),
    subscriptions: new Map(),
    payments: new Map(),
    prices: new Map([
      ["price_monthly", { id: "price_monthly", active: true, recurring: true }],
      ["price_yearly", { id: "price_yearly", active: true, recurring: true }],
      ["price_lifetime", { id: "price_lifetime", active: true, recurring: false }],
      ["price_oneoff", { id: "price_oneoff", active: true, recurring: false }],
      ["price_archived", { id: "price_archived", active: false, recurring: true }],
    ]),
    charges: new Map(),
    sessions: [],
    calls: [],
    failNext: {},
    addSubscription(customer, status, id = `sub_${++n}`, uid) {
      f.subscriptions.set(id, {
        id,
        status,
        customer,
        priceIds: ["price_monthly"],
        metadata: uid ? { firebaseUID: uid } : {},
      });
      return id;
    },
    addPayment(customer, p) {
      const id = p.id ?? `pi_${++n}`;
      f.payments.set(id, {
        id,
        status: "succeeded",
        amount: 2999,
        amountReceived: 2999,
        amountRefunded: 0,
        refunded: false,
        disputed: false,
        priceId: "price_lifetime",
        metadata: {},
        ...p,
        customer,
      });
      return id;
    },

    async createCustomer({ uid, email }, key) {
      await take("createCustomer");
      await tick(); // network latency: concurrent calls overlap here
      const known = idem.get(key);
      if (known) return { id: known };
      const id = `cus_${++n}`;
      idem.set(key, id);
      f.customers.set(id, { id, deleted: false, email, metadata: { firebaseUID: uid } });
      return { id };
    },
    async retrieveCustomer(id) {
      await take("retrieveCustomer");
      return f.customers.get(id) ?? null;
    },
    async deleteCustomer(id) {
      await take("deleteCustomer");
      const c = f.customers.get(id);
      if (c) f.customers.set(id, { ...c, deleted: true, metadata: {} });
    },
    async retrievePrice(id) {
      await take("retrievePrice");
      return f.prices.get(id) ?? null;
    },
    async createCheckoutSession(p) {
      await take("createCheckoutSession");
      f.sessions.push(p);
      const id = `cs_${++n}`;
      return { id, url: `https://checkout.stripe.test/c/${id}` };
    },
    async createPortalSession({ customer, returnUrl }) {
      await take("createPortalSession");
      return {
        url: `https://billing.stripe.test/p/${customer}?return=${encodeURIComponent(returnUrl)}`,
      };
    },
    async listSubscriptions(customer) {
      await take("listSubscriptions");
      return [...f.subscriptions.values()].filter((s) => s.customer === customer);
    },
    async cancelSubscription(id) {
      await take("cancelSubscription");
      const s = f.subscriptions.get(id);
      if (s) f.subscriptions.set(id, { ...s, status: "canceled" });
    },
    async listPayments(customer) {
      await take("listPayments");
      return [...f.payments.values()]
        .filter((p) => p.customer === customer)
        .map(({ customer: _c, ...p }) => p);
    },
    async chargeCustomer(chargeId) {
      await take("chargeCustomer");
      return f.charges.get(chargeId) ?? null;
    },
  };
  async function take(name: keyof StripePort) {
    f.calls.push(name);
    const err = f.failNext[name];
    if (err !== undefined) {
      f.failNext[name] = undefined;
      throw err;
    }
  }
  return f;
}
