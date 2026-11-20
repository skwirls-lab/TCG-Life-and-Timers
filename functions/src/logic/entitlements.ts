/**
 * Derive the client-visible entitlement (users/{uid}/private/entitlements, SEC-002) from the
 * user's CURRENT purchases, as billing.ts re-fetches them from Stripe (subscriptions, and
 * one-time payments when a lifetime price is configured; D-082 replaced the Stripe extension).
 *
 *   - a subscription with status "active" | "trialing"                    => pro (subscription)
 *     (past_due, unpaid, paused, incomplete, canceled: not Pro; Stripe's Smart Retries and the
 *     portal recover a past_due subscription, which turns Pro again when it is paid)
 *   - a payment with status "succeeded" which bought a price listed in LIFETIME_PRICE_IDS
 *                                                                       => pro (lifetime)
 *     The price is the one createCheckoutSession recorded server-side (PaymentIntent
 *     metadata.priceId); other metadata (e.g. metadata.lifetime) is NEVER trusted (D-062).
 *
 * Lifetime wins over a subscription because it never lapses. Pure.
 *
 * Revocation (B-8): only a payment whose status is still "succeeded" grants lifetime. A payment
 * that was refunded or disputed stops granting: `refunded: true`, `amount_refunded` ≥ the amount
 * paid, a `dispute` / `disputed: true` marker, `revoked: true`, or a non-succeeded status. The
 * charge.refunded / charge.dispute.created webhooks re-fetch the payment from Stripe and
 * recompute → pro false unless another valid grant (subscription, other payment, manual comp).
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
  refunded?: unknown;
  amount?: unknown;
  amount_received?: unknown;
  amount_refunded?: unknown;
  disputed?: unknown;
  dispute?: unknown;
  revoked?: unknown;
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

/** B-8: the payment was (fully) refunded, disputed or revoked by the owner. */
export function isRevokedPayment(p: PaymentLike): boolean {
  if (p.refunded === true || p.disputed === true || p.revoked === true) return true;
  if (p.dispute !== undefined && p.dispute !== null && p.dispute !== false) return true;
  const refunded = typeof p.amount_refunded === "number" ? p.amount_refunded : 0;
  const paid =
    typeof p.amount_received === "number"
      ? p.amount_received
      : typeof p.amount === "number"
        ? p.amount
        : null;
  return refunded > 0 && (paid === null || refunded >= paid);
}

export function isLifetimePayment(p: PaymentLike, lifetimePriceIds: ReadonlySet<string>): boolean {
  if (p.status !== "succeeded" || isRevokedPayment(p)) return false;
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
