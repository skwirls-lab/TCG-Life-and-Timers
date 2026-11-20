/**
 * Account deletion (AUTH-005): removes every trace of a user.
 *   - Stripe:    when the user has a Stripe customer (users/{uid}/private/stripe), every
 *                still-billable subscription is canceled immediately and the customer is deleted
 *                FIRST, so a deleted account never keeps billing (B-3). By default a Stripe
 *                failure aborts before anything is deleted (the user can retry); the Auth
 *                onDelete cleanup passes `stripeFailure: "continue"` (best effort: the Auth user is
 *                already gone) and the failure is reported in the result and logged.
 *   - Firestore: users/{uid}/** (recursive: profiles, decks, custom game types, saved setups
 *                ("Presets"), games, art, private docs incl. the Stripe mapping), sharedPresets
 *                owned by uid, feedback docs carrying the uid (B-6)
 *   - Storage:   every object under users/{uid}/
 *   - Auth:      the user record (already-deleted users are ignored)
 *
 * Dependencies are structural so the same code runs with the deployed admin SDK and with the
 * admin SDK the tests initialize against the emulators (D-005). Idempotent: safe to re-run, which
 * matters because the callable deletes the Auth user and that in turn fires onUserDeleted.
 */

import { isBillableSubscription, isStripeId, stripeErrorText, type StripePort } from "./stripe";

export interface DocRefLike {
  readonly path: string;
}
interface ReadableDoc {
  get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>;
}
export interface FirestoreLike<R extends DocRefLike = DocRefLike> {
  doc(path: string): R & ReadableDoc;
  recursiveDelete(ref: R): Promise<void>;
  collection(path: string): {
    where(
      field: string,
      op: "==",
      value: string,
    ): { get(): Promise<{ docs: ReadonlyArray<{ ref: R }> }> };
  };
}
export interface BucketLike {
  deleteFiles(query: { prefix: string; force?: boolean }): Promise<unknown>;
}
export interface AuthLike {
  deleteUser(uid: string): Promise<void>;
}
export interface DeleteUserDataDeps<R extends DocRefLike = DocRefLike> {
  firestore: FirestoreLike<R>;
  bucket: BucketLike;
  auth: AuthLike;
  /** B-3: cancels billable subscriptions and deletes the customer before the data. */
  stripe?: StripePort | null;
  /** "abort" (default): a Stripe failure stops before deleting. "continue": best effort. */
  stripeFailure?: "abort" | "continue";
}
export interface DeleteUserDataResult {
  uid: string;
  sharedPresetsDeleted: number;
  authUserDeleted: boolean;
  /** Subscriptions canceled in Stripe (0 when the user had no Stripe customer). */
  subscriptionsCanceled?: number;
  /** The Stripe customer that was deleted, if any. */
  stripeCustomerDeleted?: string | null;
  /** Best-effort mode only: why the Stripe cleanup failed (no secrets in it). */
  stripeError?: string;
  feedbackDeleted?: number;
}

/** Stripe refused (or isn't configured) while the user still has a customer: nothing deleted. */
export class StripeCleanupError extends Error {
  constructor(
    readonly customerId: string,
    readonly detail: string,
  ) {
    super(`stripe cleanup failed for ${customerId}: ${detail}`);
    this.name = "StripeCleanupError";
  }
}

/** Firebase uids are 1..128 chars; anything that could escape the path segment is rejected. */
export function isSafeUid(uid: string): boolean {
  return uid.length >= 1 && uid.length <= 128 && !uid.includes("/") && uid !== "." && uid !== "..";
}

export function isNotFound(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return code === "auth/user-not-found" || code === 404 || code === "storage/object-not-found";
}

export async function deleteUserData<R extends DocRefLike>(
  deps: DeleteUserDataDeps<R>,
  uid: string,
): Promise<DeleteUserDataResult> {
  // Guards against reaching another user's subtree ("a/b", "..", "").
  if (!isSafeUid(uid)) throw new Error(`invalid uid: ${JSON.stringify(uid)}`);
  const { firestore, bucket, auth, stripe } = deps;

  // B-3: stop billing before the mapping (and the user's access to the billing portal)
  // disappears. Aborts the deletion when Stripe refuses, so nothing is half-deleted.
  let subscriptionsCanceled = 0;
  let stripeCustomerDeleted: string | null = null;
  let stripeError: string | undefined;
  const mapping = await firestore.doc(`users/${uid}/private/stripe`).get();
  const customerId = mapping.exists ? mapping.data()?.customerId : undefined;
  if (isStripeId(customerId, "cus")) {
    try {
      if (!stripe) throw new Error("stripe not configured");
      for (const sub of await stripe.listSubscriptions(customerId)) {
        if (!isBillableSubscription(sub.status) || !isStripeId(sub.id, "sub")) continue;
        await stripe.cancelSubscription(sub.id);
        subscriptionsCanceled++;
      }
      await stripe.deleteCustomer(customerId);
      stripeCustomerDeleted = customerId;
    } catch (err) {
      const detail =
        err instanceof Error && err.message === "stripe not configured"
          ? err.message
          : stripeErrorText(err);
      if (deps.stripeFailure !== "continue") throw new StripeCleanupError(customerId, detail);
      stripeError = `${customerId}: ${detail}`;
    }
  }

  await firestore.recursiveDelete(firestore.doc(`users/${uid}`));

  const shared = await firestore.collection("sharedPresets").where("ownerUid", "==", uid).get();
  for (const d of shared.docs) await firestore.recursiveDelete(d.ref);

  // B-6: feedback submissions store the uid (and an optional email).
  const feedback = await firestore.collection("feedback").where("uid", "==", uid).get();
  for (const d of feedback.docs) await firestore.recursiveDelete(d.ref);

  try {
    await bucket.deleteFiles({ prefix: `users/${uid}/`, force: true });
  } catch (err) {
    if (!isNotFound(err)) throw err;
  }

  let authUserDeleted = false;
  try {
    await auth.deleteUser(uid);
    authUserDeleted = true;
  } catch (err) {
    if (!isNotFound(err)) throw err;
  }

  return {
    uid,
    sharedPresetsDeleted: shared.docs.length,
    authUserDeleted,
    subscriptionsCanceled,
    stripeCustomerDeleted,
    ...(stripeError ? { stripeError } : {}),
    feedbackDeleted: feedback.docs.length,
  };
}
