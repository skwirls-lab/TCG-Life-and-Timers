/**
 * syncEntitlements (T7.2, PAY-002, PAY-003, SEC-002): recompute a user's entitlement and write
 * the client-readable `users/{uid}/private/entitlements` = { pro, source, updatedAt } (+ the
 * `pro` custom claim).
 *
 * The caller supplies `load`, which fetches the user's CURRENT subscriptions and one-time payments
 * (./billing.ts re-fetches them from Stripe on every webhook / refresh). Recomputing from the full
 * current state makes it order-independent and idempotent: a late "subscription.updated" event
 * can never resurrect a canceled subscription, and a duplicate event changes nothing.
 *
 * B-3: when the Auth user no longer exists (account deleted, a late Stripe webhook), nothing is
 * loaded or written: a deleted uid never gets an entitlements doc again.
 * An owner-granted entitlement (source "manual", e.g. a comp) is never revoked by Stripe, and
 * its doc is left exactly as the owner wrote it.
 *
 * Optional display fields (additive; older docs lack them and clients show "Pro" without dates):
 *   plan               "monthly" | "yearly" | "lifetime" (+ "manual", which clients derive
 *                      from the source because a manual doc is never rewritten)
 *   currentPeriodEnd   epoch ms: the renewal date, or the end date when cancelAtPeriodEnd
 *   cancelAtPeriodEnd  the subscription ends instead of renewing
 *   status             the granting subscription's Stripe status
 */
import {
  entitlementDetails,
  entitlementsFromSubscriptions,
  type EntitlementDetails,
  type EntitlementPlan,
  type Entitlements,
  type PaymentLike,
  type SubscriptionLike,
} from "./entitlements";
import { isNotFound, isSafeUid } from "./deleteUserData";

export interface EntitlementsFirestoreLike {
  doc(path: string): {
    get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>;
    set(data: Record<string, unknown>): Promise<unknown>;
  };
}
export interface ClaimsAuthLike {
  getUser(uid: string): Promise<{ customClaims?: Record<string, unknown> | null }>;
  setCustomUserClaims(uid: string, claims: Record<string, unknown> | null): Promise<void>;
}
export interface SyncEntitlementsDeps {
  firestore: EntitlementsFirestoreLike;
  /** Optional: also mirror `pro` into the user's custom claims. */
  auth?: ClaimsAuthLike;
  /** Server timestamp sentinel (FieldValue.serverTimestamp()). */
  serverTimestamp: () => unknown;
  lifetimePriceIds?: ReadonlySet<string>;
  /** Fallback plan of a price when Stripe gave no interval (billing.ts: the known price ids). */
  planByPrice?: ReadonlyMap<string, EntitlementPlan>;
}

export interface PurchaseState {
  subscriptions: ReadonlyArray<SubscriptionLike>;
  payments: ReadonlyArray<PaymentLike>;
}

export interface SyncEntitlementsResult extends Entitlements {
  uid: string;
  /** The display fields written (empty for a manual entitlement, whose doc is kept as is). */
  details?: EntitlementDetails;
  /** false when the stored doc already matched (no write). */
  written: boolean;
  claimUpdated: boolean;
  /** true when the Auth user is gone: nothing was written (B-3). */
  userDeleted?: boolean;
}

export async function syncEntitlements(
  deps: SyncEntitlementsDeps,
  uid: string,
  load: () => Promise<PurchaseState>,
): Promise<SyncEntitlementsResult> {
  if (!isSafeUid(uid)) throw new Error(`invalid uid: ${JSON.stringify(uid)}`);
  const { firestore: fs } = deps;
  // B-3: never (re)create data for a deleted account.
  let user: { customClaims?: Record<string, unknown> | null } | null = null;
  if (deps.auth) {
    try {
      user = await deps.auth.getUser(uid);
    } catch (err) {
      if (!isNotFound(err)) throw err;
      return {
        uid,
        pro: false,
        source: "none",
        written: false,
        claimUpdated: false,
        userDeleted: true,
      };
    }
  }
  const state = await load();
  const computed = entitlementsFromSubscriptions(
    state.subscriptions,
    state.payments,
    deps.lifetimePriceIds,
  );

  const ref = fs.doc(`users/${uid}/private/entitlements`);
  const cur = await ref.get();
  const prev = cur.exists ? cur.data() : undefined;
  const manual = prev?.source === "manual" && prev.pro === true;
  const ent: Entitlements = manual ? { pro: true, source: "manual" } : computed;
  const details: EntitlementDetails = manual
    ? {}
    : entitlementDetails(ent.source, state.subscriptions, deps.planByPrice);
  const same =
    prev?.pro === ent.pro &&
    prev?.source === ent.source &&
    (manual || DETAIL_KEYS.every((k) => prev?.[k] === details[k]));
  if (!same)
    await ref.set({
      pro: ent.pro,
      source: ent.source,
      ...details,
      updatedAt: deps.serverTimestamp(),
    });

  let claimUpdated = false;
  if (deps.auth && user) {
    const claims = { ...(user.customClaims ?? {}) };
    if (claims.pro !== ent.pro) {
      claims.pro = ent.pro;
      try {
        await deps.auth.setCustomUserClaims(uid, claims);
        claimUpdated = true;
      } catch (err) {
        if (!isNotFound(err)) throw err; // deleted between the check and now
      }
    }
  }
  return { uid, ...ent, details, written: !same, claimUpdated };
}

const DETAIL_KEYS = ["plan", "currentPeriodEnd", "cancelAtPeriodEnd", "status"] as const;
