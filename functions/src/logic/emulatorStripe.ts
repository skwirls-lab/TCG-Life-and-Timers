/**
 * EMULATOR ONLY: a Firestore-backed stand-in for Stripe, used by the @emu e2e build where
 * api.stripe.com is unreachable. index.ts loads this module only when
 * `process.env.FUNCTIONS_EMULATOR === "true"` and no real Stripe key is configured, and
 * firebase.json's functions `ignore` keeps it out of every deploy, so it can never run in
 * production.
 *
 * Checkout "pays" immediately: creating a session records an active subscription (or a succeeded
 * one-time payment) and returns the success URL itself, so the browser lands on
 * /pro?checkout=success and the page's refreshEntitlements call grants Pro through the real code.
 * State lives in `_emulatorStripe/{customerId}` (default-deny in firestore.rules).
 */
import type { StripePayment, StripePort, StripeSubscription } from "./stripe";

interface Snap {
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}
export interface EmulatorFirestore {
  doc(path: string): {
    get(): Promise<Snap>;
    set(data: Record<string, unknown>): Promise<unknown>;
    delete(): Promise<unknown>;
  };
}

interface CustomerState {
  uid: string;
  email: string | null;
  subscriptions: StripeSubscription[];
  payments: StripePayment[];
}

export function emulatorStripe(fs: EmulatorFirestore): StripePort {
  if (process.env.FUNCTIONS_EMULATOR !== "true")
    throw new Error("emulator Stripe outside the emulator");
  const ref = (customerId: string) => fs.doc(`_emulatorStripe/${customerId}`);
  const read = async (customerId: string): Promise<CustomerState | null> => {
    const snap = await ref(customerId).get();
    return snap.exists ? (snap.data() as unknown as CustomerState) : null;
  };
  const write = (customerId: string, s: CustomerState) =>
    ref(customerId).set(s as unknown as Record<string, unknown>);
  let seq = 0;
  const nextId = (prefix: string) => `${prefix}_emu${Date.now()}${++seq}`;

  return {
    async createCustomer({ uid, email }) {
      const id = `cus_emu${uid.replace(/[^A-Za-z0-9]/g, "")}`;
      if (!(await read(id))) await write(id, { uid, email, subscriptions: [], payments: [] });
      return { id };
    },
    async retrieveCustomer(id) {
      const s = await read(id);
      return s ? { id, deleted: false, email: s.email, metadata: { firebaseUID: s.uid } } : null;
    },
    async deleteCustomer(id) {
      await ref(id).delete();
    },
    async retrievePrice(id) {
      return { id, active: true, recurring: !/lifetime/i.test(id) };
    },
    async createCheckoutSession(p) {
      const s = await read(p.customer);
      if (!s) throw new Error("no such customer");
      const id = nextId("cs");
      if (p.mode === "subscription") {
        s.subscriptions.push({
          id: nextId("sub"),
          status: "active",
          customer: p.customer,
          priceIds: [p.priceId],
          metadata: { firebaseUID: p.uid },
        });
      } else {
        s.payments.push({
          id: nextId("pi"),
          status: "succeeded",
          amount: 100,
          amountReceived: 100,
          amountRefunded: 0,
          refunded: false,
          disputed: false,
          priceId: p.priceId,
          metadata: { firebaseUID: p.uid, priceId: p.priceId },
        });
      }
      await write(p.customer, s);
      return { id, url: p.successUrl.replace("{CHECKOUT_SESSION_ID}", id) };
    },
    async createPortalSession({ returnUrl }) {
      return { url: `${returnUrl}?portal=emulator` };
    },
    async listSubscriptions(customer) {
      return (await read(customer))?.subscriptions ?? [];
    },
    async cancelSubscription(id) {
      void id; // the customer is deleted right after (account deletion)
    },
    async listPayments(customer) {
      return (await read(customer))?.payments ?? [];
    },
    async chargeCustomer() {
      return null;
    },
  };
}
