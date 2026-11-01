/**
 * Account deletion (AUTH-005): removes every trace of a user.
 *   - Firestore: users/{uid}/** and customers/{uid}/** (recursive), sharedPresets owned by uid
 *   - Storage:   every object under users/{uid}/
 *   - Auth:      the user record (already-deleted users are ignored)
 *
 * Dependencies are structural so the same code runs with the deployed admin SDK and with the
 * admin SDK the tests initialize against the emulators (D-005). Idempotent: safe to re-run, which
 * matters because the callable deletes the Auth user and that in turn fires onUserDeleted.
 */

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
}
export interface DeleteUserDataResult {
  uid: string;
  sharedPresetsDeleted: number;
  authUserDeleted: boolean;
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
  const { firestore, bucket, auth } = deps;

  await firestore.recursiveDelete(firestore.doc(`users/${uid}`));
  await firestore.recursiveDelete(firestore.doc(`customers/${uid}`));

  const shared = await firestore.collection("sharedPresets").where("ownerUid", "==", uid).get();
  for (const d of shared.docs) await firestore.recursiveDelete(d.ref);

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

  return { uid, sharedPresetsDeleted: shared.docs.length, authUserDeleted };
}
