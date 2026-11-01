/**
 * syncEntitlements (T7.2, PAY-002, PAY-003, SEC-002): recompute a user's entitlement from the
 * Stripe extension's mirrored docs and write the client-readable
 * `users/{uid}/private/entitlements` = { pro, source, updatedAt } (+ the `pro` custom claim).
 *
 * Runs on every write to customers/{uid}/subscriptions/{id} and customers/{uid}/payments/{id}
 * (see index.ts). Reading ALL of the user's subscriptions and payments on each event makes it
 * order-independent and idempotent: a cancelled subscription next to an active one, or a
 * lifetime payment, always yields the same answer. Dependencies are structural (D-016).
 *
 * B-3: when the Auth user no longer exists (account deleted; a late Stripe webhook re-created
 * customers/{uid}/**), nothing is written — a deleted uid never gets an entitlements doc again.
 */
import { entitlementsFromSubscriptions, type Entitlements } from "./entitlements";
import { isNotFound, isSafeUid } from "./deleteUserData";

export interface QuerySnapLike {
  docs: ReadonlyArray<{ data(): Record<string, unknown> | undefined }>;
}
export interface EntitlementsFirestoreLike {
  collection(path: string): { get(): Promise<QuerySnapLike> };
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
}

export interface SyncEntitlementsResult extends Entitlements {
  uid: string;
  /** false when the stored doc already matched (no write). */
  written: boolean;
  claimUpdated: boolean;
  /** true when the Auth user is gone: nothing was written (B-3). */
  userDeleted?: boolean;
}

async function docsData(fs: EntitlementsFirestoreLike, path: string) {
  const snap = await fs.collection(path).get();
  return snap.docs.map((d) => d.data() ?? {});
}

export async function syncEntitlements(
  deps: SyncEntitlementsDeps,
  uid: string,
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
  const [subs, payments] = await Promise.all([
    docsData(fs, `customers/${uid}/subscriptions`),
    docsData(fs, `customers/${uid}/payments`),
  ]);
  const computed = entitlementsFromSubscriptions(subs, payments, deps.lifetimePriceIds);

  const ref = fs.doc(`users/${uid}/private/entitlements`);
  const cur = await ref.get();
  const prev = cur.exists ? cur.data() : undefined;
  // An owner-granted entitlement (source "manual", e.g. a comp) is never revoked by Stripe events.
  const ent: Entitlements =
    prev?.source === "manual" && prev.pro === true ? { pro: true, source: "manual" } : computed;
  const same = prev?.pro === ent.pro && prev?.source === ent.source;
  if (!same) await ref.set({ pro: ent.pro, source: ent.source, updatedAt: deps.serverTimestamp() });

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
  return { uid, ...ent, written: !same, claimUpdated };
}
