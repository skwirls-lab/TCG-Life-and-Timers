/**
 * Runtime glue for cloud art (T5.4): decides when to upload / download using the signed-in user
 * and the entitlement quota, and loads Firebase Storage lazily (PERF-003). Only Google
 * (non-anonymous) accounts sync, matching the metadata sync engine (SYNC-001).
 */
import { useAuth } from "@/lib/auth/store";
import { getDb, type TcgDb } from "@/lib/db";
import { limit } from "@/lib/entitlements/policy";
import { useEntitlements } from "@/lib/entitlements/store";
import {
  deleteArtEverywhere,
  downloadArtBlob,
  firebaseArtStorage,
  uploadPendingArt,
  type ArtStorageApi,
  type UploadResult,
} from "./cloud";

export interface CloudUser {
  uid: string;
  isAnonymous: boolean;
}

export interface ArtCloudEnv {
  user(): CloudUser | null;
  limit(): number;
  loadApi(): Promise<ArtStorageApi | null>;
  db(): TcgDb;
  /** Subscribe to user changes (sign-in starts an upload pass). */
  onUserChange(cb: () => void): () => void;
}

async function loadFirebaseApi(): Promise<ArtStorageApi | null> {
  const { getStorageClient } = await import("@/lib/firebase/client");
  const storage = await getStorageClient();
  if (!storage) return null;
  const fns = await import("firebase/storage");
  return firebaseArtStorage(fns, storage);
}

function defaultEnv(): ArtCloudEnv {
  return {
    user: () => useAuth.getState().user,
    limit: () => limit(useEntitlements.getState(), "cloudArtImages"),
    loadApi: loadFirebaseApi,
    db: getDb,
    onUserChange: (cb) => useAuth.subscribe(cb),
  };
}

let env: ArtCloudEnv = defaultEnv();
let apiPromise: Promise<ArtStorageApi | null> | null = null;
let running: Promise<UploadResult | null> | null = null;
let rerun = false;
let unwatch: (() => void) | null = null;
let lastUid: string | null = null;

/** Test hook / alternative wiring. Resets module state. */
export function configureArtCloud(overrides: Partial<ArtCloudEnv> = {}): void {
  unwatch?.();
  unwatch = null;
  env = { ...defaultEnv(), ...overrides };
  apiPromise = null;
  running = null;
  rerun = false;
  lastUid = null;
}

function syncUser(): CloudUser | null {
  const u = env.user();
  return u && !u.isAnonymous ? u : null;
}

function api(): Promise<ArtStorageApi | null> {
  apiPromise ??= env.loadApi().catch(() => null);
  return apiPromise;
}

/** Whether cloud art applies right now (a signed-in Google account). */
export function artCloudActive(): boolean {
  return syncUser() !== null;
}

/**
 * Upload pending images now (serialized; a call during a run schedules one more pass and
 * shares the result, which accumulates `uploaded` over the passes).
 * Resolves to null when not signed in or Storage is unavailable.
 */
export function syncArtNow(): Promise<UploadResult | null> {
  if (running) {
    rerun = true;
    return running;
  }
  running = (async () => {
    const result: UploadResult = { uploaded: [], overQuota: [], failed: [] };
    do {
      rerun = false;
      const user = syncUser();
      if (!user) return null;
      const storage = await api();
      if (!storage) return null;
      const pass = await uploadPendingArt({
        api: storage,
        uid: user.uid,
        limit: env.limit(),
        db: env.db(),
      });
      result.uploaded.push(...pass.uploaded);
      // the latest pass is authoritative for what is still local-only
      result.overQuota = pass.overQuota;
      result.failed = pass.failed;
    } while (rerun);
    return result;
  })().finally(() => {
    running = null;
  });
  return running;
}

/** Download a remote-only image's blob (ART-022 on-demand). False when not possible. */
export async function downloadArt(id: string): Promise<boolean> {
  if (!syncUser()) return false;
  const storage = await api();
  if (!storage) return false;
  return downloadArtBlob(id, { api: storage, db: env.db() });
}

/** Delete an image locally and from Storage when signed in. */
export async function deleteArt(id: string): Promise<void> {
  const user = syncUser();
  const storage = user ? await api() : null;
  await deleteArtEverywhere(id, { api: storage, uid: user?.uid, db: env.db() });
}

/** Start an upload pass whenever a (new) Google account signs in. Idempotent. */
export function watchArtCloud(): void {
  if (unwatch) return;
  const check = () => {
    const uid = syncUser()?.uid ?? null;
    if (uid && uid !== lastUid) void syncArtNow();
    lastUid = uid;
  };
  unwatch = env.onUserChange(check);
  check();
}
