/**
 * Derive the client-visible entitlement (users/{uid}/private/entitlements, SEC-002) from the
 * Stripe extension's mirrored docs (customers/{uid}/subscriptions/*, customers/{uid}/payments/*).
 *
 *   - a subscription with status "active" | "trialing"                    => pro (subscription)
 *   - a payment with status "succeeded" whose metadata.lifetime == "true",
 *     or which bought a price listed in LIFETIME_PRICE_IDS              => pro (lifetime)
 *
 * Lifetime wins over a subscription because it never lapses. Pure; the PAY lane wires triggers.
 */

export type EntitlementSource = "none" | "subscription" | "lifetime" | "manual";
export interface Entitlements {
  pro: boolean;
  source: EntitlementSource;
}

export interface SubscriptionLike {
  status?: unknown;
}
type PriceRef = string | { id?: unknown } | null | undefined;
export interface PaymentLike {
  status?: unknown;
  metadata?: Record<string, unknown> | null;
  price?: PriceRef;
  prices?: ReadonlyArray<PriceRef> | null;
  items?: ReadonlyArray<{ price?: PriceRef } | null> | null;
}

const PRO_SUB_STATUSES = new Set(["active", "trialing"]);

/** Parses a comma/whitespace separated env list such as "price_a, price_b". */
export function parseLifetimePriceIds(raw: string | undefined): Set<string> {
  return new Set((raw ?? "").split(/[\s,]+/).filter(Boolean));
}

function priceId(p: PriceRef): string | null {
  if (typeof p === "string") return p;
  if (p && typeof p === "object" && typeof p.id === "string") return p.id;
  return null;
}

/** Every price ID referenced by a payment doc, across the shapes the extension writes. */
export function paymentPriceIds(p: PaymentLike): string[] {
  const refs: PriceRef[] = [p.price, ...(p.prices ?? []), ...(p.items ?? []).map((i) => i?.price)];
  return refs.map(priceId).filter((x): x is string => x !== null);
}

export function isLifetimePayment(p: PaymentLike, lifetimePriceIds: ReadonlySet<string>): boolean {
  if (p.status !== "succeeded") return false;
  if (p.metadata?.lifetime === "true") return true;
  return paymentPriceIds(p).some((id) => lifetimePriceIds.has(id));
}

export function entitlementsFromSubscriptions(
  subs: ReadonlyArray<SubscriptionLike>,
  payments: ReadonlyArray<PaymentLike>,
  lifetimePriceIds: ReadonlySet<string> = parseLifetimePriceIds(process.env.LIFETIME_PRICE_IDS),
): Entitlements {
  if (payments.some((p) => isLifetimePayment(p, lifetimePriceIds))) {
    return { pro: true, source: "lifetime" };
  }
  if (subs.some((s) => typeof s.status === "string" && PRO_SUB_STATUSES.has(s.status))) {
    return { pro: true, source: "subscription" };
  }
  return { pro: false, source: "none" };
}
