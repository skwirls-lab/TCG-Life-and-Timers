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
  /** Optional details (from Stripe, ./stripe.ts mapSubscription) for the plan / renewal display. */
  interval?: unknown;
  priceIds?: ReadonlyArray<unknown> | null;
  currentPeriodEnd?: unknown;
  cancelAtPeriodEnd?: unknown;
  cancelAt?: unknown;
}

/** What the entitlement is, for display (optional fields of the entitlements doc). */
export type EntitlementPlan = "monthly" | "yearly" | "lifetime" | "manual";
export interface EntitlementDetails {
  plan?: EntitlementPlan;
  /** epoch ms: renews (or, with cancelAtPeriodEnd, ends) at this time */
  currentPeriodEnd?: number;
  cancelAtPeriodEnd?: boolean;
  /** the granting subscription's Stripe status (active | trialing) */
  status?: string;
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

const msOrNull = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : null;

/** "month" → monthly, "year" → yearly; otherwise the price-id config, else unknown. */
export function planOfSubscription(
  s: SubscriptionLike,
  planByPrice: ReadonlyMap<string, EntitlementPlan> = new Map(),
): EntitlementPlan | undefined {
  if (s.interval === "month") return "monthly";
  if (s.interval === "year") return "yearly";
  for (const id of s.priceIds ?? []) {
    const p = typeof id === "string" ? planByPrice.get(id) : undefined;
    if (p) return p;
  }
  return undefined;
}

/**
 * Display details for an entitlement (the doc's optional fields). For a subscription: the
 * granting (active / trialing) subscription that runs longest, with its plan, period end,
 * cancel-at-period-end (also when the portal scheduled `cancel_at` instead) and status. Pure.
 */
export function entitlementDetails(
  source: EntitlementSource,
  subs: ReadonlyArray<SubscriptionLike>,
  planByPrice?: ReadonlyMap<string, EntitlementPlan>,
): EntitlementDetails {
  if (source === "lifetime") return { plan: "lifetime" };
  if (source === "manual") return { plan: "manual" };
  if (source !== "subscription") return {};
  const end = (s: SubscriptionLike) => msOrNull(s.currentPeriodEnd) ?? 0;
  let best: SubscriptionLike | undefined;
  for (const s of subs) {
    if (typeof s.status !== "string" || !PRO_SUB_STATUSES.has(s.status)) continue;
    if (!best || end(s) > end(best)) best = s;
  }
  if (!best) return {};
  const out: EntitlementDetails = { status: String(best.status) };
  const plan = planOfSubscription(best, planByPrice);
  if (plan) out.plan = plan;
  const cancelAt = msOrNull(best.cancelAt);
  // A scheduled cancellation is when access ends; otherwise the period end is the renewal.
  const periodEnd = cancelAt ?? msOrNull(best.currentPeriodEnd);
  if (periodEnd !== null) out.currentPeriodEnd = periodEnd;
  out.cancelAtPeriodEnd = best.cancelAtPeriodEnd === true || cancelAt !== null;
  return out;
}
