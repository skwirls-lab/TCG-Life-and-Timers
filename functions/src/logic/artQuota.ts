/**
 * Server-side cloud art quota (B-4, ART-024). Storage rules cannot count objects, so a function
 * recounts `users/{uid}/art/*` objects whenever one is finalized or deleted (and whenever the
 * user's entitlement changes) and:
 *   - writes users/{uid}/private/quota = { artCount, artLimit, updatedAt } (client-readable);
 *   - sets / clears the `artQuotaFull` custom claim, which storage.rules uses to refuse NEW
 *     objects once the limit is reached (no cross-service rules call needed);
 *   - backstop: when an upload pushed the count over the limit (stale token, parallel uploads),
 *     deletes THAT new object. Existing images are never deleted (e.g. a lapsed Pro keeps them).
 *
 * Limits apply only while config/billing.paywallEnabled is true (free 10 / Pro 200, mirroring
 * src/lib/entitlements/features.ts); otherwise artLimit is null and nothing is refused.
 * Dependencies are structural (D-016).
 */
import { isNotFound, isSafeUid } from "./deleteUserData";
import type { ClaimsAuthLike } from "./syncEntitlements";

export const FREE_ART_LIMIT = 10;
export const PRO_ART_LIMIT = 200;

interface DocLike {
  get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>;
  set(data: Record<string, unknown>): Promise<unknown>;
}
export interface FileLike {
  name: string;
  metadata?: { timeCreated?: string };
  delete(): Promise<unknown>;
}
export interface ArtQuotaDeps {
  firestore: { doc(path: string): DocLike };
  bucket: { getFiles(query: { prefix: string }): Promise<[FileLike[], ...unknown[]]> };
  auth?: ClaimsAuthLike;
  serverTimestamp: () => unknown;
}
export interface ArtQuotaResult {
  uid: string;
  artCount: number;
  artLimit: number | null;
  /** Objects deleted by the backstop. */
  removed: string[];
  quotaFull: boolean;
  /** The Auth user is gone: nothing was written. */
  userDeleted?: boolean;
}

/** `users/{uid}/art/{file}` → uid (null for any other path). */
export function artOwner(objectName: string | undefined): string | null {
  const m = /^users\/([^/]+)\/art\/[^/]+$/.exec(objectName ?? "");
  return m && isSafeUid(m[1]!) ? m[1]! : null;
}

async function field(deps: ArtQuotaDeps, path: string, key: string): Promise<unknown> {
  const snap = await deps.firestore.doc(path).get();
  return snap.exists ? snap.data()?.[key] : undefined;
}

export async function artLimitFor(deps: ArtQuotaDeps, uid: string): Promise<number | null> {
  if ((await field(deps, "config/billing", "paywallEnabled")) !== true) return null;
  const pro = (await field(deps, `users/${uid}/private/entitlements`, "pro")) === true;
  return pro ? PRO_ART_LIMIT : FREE_ART_LIMIT;
}

export async function recomputeArtQuota(
  deps: ArtQuotaDeps,
  uid: string,
  opts: { newObject?: string } = {},
): Promise<ArtQuotaResult> {
  if (!isSafeUid(uid)) throw new Error(`invalid uid: ${JSON.stringify(uid)}`);
  // Account deletion removes the objects (firing onObjectDeleted): never recreate data then.
  let user: { customClaims?: Record<string, unknown> | null } | null = null;
  if (deps.auth) {
    try {
      user = await deps.auth.getUser(uid);
    } catch (err) {
      if (!isNotFound(err)) throw err;
      return { uid, artCount: 0, artLimit: null, removed: [], quotaFull: false, userDeleted: true };
    }
  }
  const artLimit = await artLimitFor(deps, uid);
  const [files] = await deps.bucket.getFiles({ prefix: `users/${uid}/art/` });
  let live = files;
  const removed: string[] = [];
  if (artLimit !== null && opts.newObject && live.length > artLimit) {
    const extra = live.find((f) => f.name === opts.newObject);
    if (extra) {
      await extra.delete().catch((err: unknown) => {
        if (!isNotFound(err)) throw err;
      });
      removed.push(extra.name);
      live = live.filter((f) => f !== extra);
    }
  }
  const artCount = live.length;
  const quotaFull = artLimit !== null && artCount >= artLimit;
  await deps.firestore
    .doc(`users/${uid}/private/quota`)
    .set({ artCount, artLimit, updatedAt: deps.serverTimestamp() });

  if (deps.auth && user) {
    try {
      const claims = { ...(user.customClaims ?? {}) };
      if ((claims.artQuotaFull === true) !== quotaFull) {
        if (quotaFull) claims.artQuotaFull = true;
        else delete claims.artQuotaFull;
        await deps.auth.setCustomUserClaims(uid, claims);
      }
    } catch (err) {
      if (!isNotFound(err)) throw err;
    }
  }
  return { uid, artCount, artLimit, removed, quotaFull };
}
