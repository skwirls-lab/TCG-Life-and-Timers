/**
 * Account deletion (AUTH-005): removes every trace of a user.
 *   - Stripe:    when a Stripe client is configured (optional env STRIPE_SECRET_KEY), every
 *                still-billable subscription mirrored under customers/{uid}/subscriptions is
 *                canceled FIRST, so a deleted account never keeps billing (B-3). A Stripe failure
 *                aborts before anything is deleted (the user can retry). Without a key, DEPLOY.md
 *                requires the extension's "Automatically delete Stripe customer objects" option.
 *   - Firestore: users/{uid}/** and customers/{uid}/** (recursive: profiles, decks, custom game
 *                types, saved setups ("Presets"), games, art, private docs), sharedPresets owned by uid,
 *                feedback docs carrying the uid (B-6)
 *   - Storage:   every object under users/{uid}/
 *   - Auth:      the user record (already-deleted users are ignored)
 *
 * Dependencies are structural so the same code runs with the deployed admin SDK and with the
 * admin SDK the tests initialize against the emulators (D-005). Idempotent: safe to re-run, which
 * matters because the callable deletes the Auth user and that in turn fires onUserDeleted.
 */

import { isBillableSubscription, isSubscriptionId, type StripeLike } from "./stripe";

export interface DocRefLike {
  readonly path: string;
}
export interface FirestoreLike<R extends DocRefLike = DocRefLike> {
  doc(path: string): R;
  recursiveDelete(ref: R): Promise<void>;
  collection(path: string): {
    where(
      field: string,
      op: "==",
      value: string,
    ): { get(): Promise<{ docs: ReadonlyArray<{ ref: R }> }> };
    get(): Promise<{
      docs: ReadonlyArray<{ id: string; data(): Record<string, unknown> | undefined }>;
    }>;
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
  /** Optional (B-3): cancels billable subscriptions before the customer docs are deleted. */
  stripe?: StripeLike | null;
}
export interface DeleteUserDataResult {
  uid: string;
  sharedPresetsDeleted: number;
  authUserDeleted: boolean;
  /** Subscriptions canceled in Stripe (0 when no Stripe client is configured). */
  subscriptionsCanceled?: number;
  feedbackDeleted?: number;
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

  // B-3: stop billing before the mirrored customer docs (and the user's access to the billing
  // portal) disappear. Aborts the deletion when Stripe refuses, so nothing is half-deleted.
  let subscriptionsCanceled = 0;
  if (stripe) {
    const subs = await firestore.collection(`customers/${uid}/subscriptions`).get();
    for (const d of subs.docs) {
      // Doc ids are Stripe subscription ids (sub_…); anything else is not a real subscription.
      if (!isBillableSubscription(d.data()?.status) || !isSubscriptionId(d.id)) continue;
      await stripe.cancelSubscription(d.id);
      subscriptionsCanceled++;
    }
  }

  await firestore.recursiveDelete(firestore.doc(`users/${uid}`));
  await firestore.recursiveDelete(firestore.doc(`customers/${uid}`));

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
    feedbackDeleted: feedback.docs.length,
  };
}
