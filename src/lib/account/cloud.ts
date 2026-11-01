"use client";
/**
 * Cloud entry point: `startCloud()` = App Check + auth init + (when signed in with Google) the
 * guest → account merge, the sync engine and cloud art (ART-022). Idempotent; guests who never open an account
 * feature never load Firebase (AUTH-002, PERF-003).
 */
import { create } from "zustand";
import {
  configureAuth,
  initAuth,
  signInForTests,
  signOut,
  useAuth,
  type AuthState,
  type SignOutOptions,
} from "@/lib/auth/store";
import type { AuthUser } from "@/lib/auth/types";
import { getDb as getLocalDb, type TcgDb } from "@/lib/db";
import { can } from "@/lib/entitlements/policy";
import { useEntitlements } from "@/lib/entitlements/store";
import { initAppCheck } from "@/lib/firebase/appCheck";
import { emulatorsEnabled, isCloudConfigured } from "@/lib/firebase/config";
import { clearSyncState, startUserSync } from "@/lib/sync/cloudSync";
import { dexieKv } from "@/lib/sync/dexieLocal";
import type { SyncEngine } from "@/lib/sync/engine";
import type { FirestoreApi } from "@/lib/sync/firestoreRemote";
import { useSyncStatus } from "@/lib/sync/status";
import { useSettingsStore } from "@/state/settingsStore";
import { deleteAccount as deleteAccountCore } from "./export";
import { clearLocalAccountData, snapshotLocal } from "./localData";
import { executeMerge, planMerge, type MergeChoice, type MergePlan } from "./merge";

/** kv key: the uid whose first-sign-in merge already ran on this device. */
export const LINKED_UID_KEY = "account:linkedUid";

interface CloudState {
  phase: "idle" | "merging" | "syncing";
  /** Set while waiting for the user's Merge / Keep cloud only choice (AUTH-003). */
  mergePrompt: MergePlan | null;
}

export const useCloud = create<CloudState>(() => ({ phase: "idle", mergePrompt: null }));

let resolveChoice: ((c: MergeChoice | null) => void) | null = null;

/** Answer the merge prompt. */
export function resolveMerge(choice: MergeChoice): void {
  resolveChoice?.(choice);
}

function askChoice(plan: MergePlan): Promise<MergeChoice | null> {
  return new Promise((resolve) => {
    resolveChoice = (c) => {
      resolveChoice = null;
      useCloud.setState({ mergePrompt: null });
      resolve(c);
    };
    useCloud.setState({ mergePrompt: plan });
  });
}

export interface CloudDeps {
  loadFirestore: () => Promise<{
    fs: FirestoreApi;
    firestore: import("firebase/firestore").Firestore;
  } | null>;
  db: () => TcgDb;
  historySync: () => boolean;
  reloadSettings: () => Promise<unknown>;
  /** Start cloud art (ART-022): uploads/downloads follow the signed-in Google account. */
  startArtCloud: () => Promise<void>;
  /** Start entitlement sync (PAY). */
  startPayments: () => Promise<void>;
}

const defaultDeps = (): CloudDeps => ({
  loadFirestore: async () => {
    const { getDb } = await import("@/lib/firebase/client");
    const firestore = await getDb();
    if (!firestore) return null;
    const fs = await import("firebase/firestore");
    return { fs, firestore };
  },
  db: getLocalDb,
  historySync: () => can(useEntitlements.getState(), "historySync"),
  reloadSettings: () => useSettingsStore.getState().load(),
  // Lazy: the art runtime (and Firebase Storage behind it) loads only for signed-in users.
  startArtCloud: () => import("@/lib/art/cloudRuntime").then((m) => m.watchArtCloud()),
  startPayments: () =>
    import("@/lib/entitlements/sync").then((m) => {
      m.startPayments();
    }),
});

let deps: CloudDeps = defaultDeps();
let startPromise: Promise<void> | null = null;
let engine: SyncEngine | null = null;
let engineUid: string | null = null;
let flow: Promise<void> | null = null;
let flowUid: string | null = null;

const warn = (msg: string, err?: unknown) => {
  if (process.env.NODE_ENV !== "test") console.warn(msg, err ?? "");
};

async function runAccountFlow(user: AuthUser): Promise<void> {
  const ctx = await deps.loadFirestore();
  if (!ctx) return;
  const db = deps.db();
  const kv = dexieKv(db);
  const historySync = deps.historySync();
  if ((await kv.get(LINKED_UID_KEY)) !== user.uid) {
    useCloud.setState({ phase: "merging" });
    const { fetchRemoteItems } = await import("@/lib/sync/firestoreRemote");
    const plan = planMerge(
      await snapshotLocal(db),
      await fetchRemoteItems({ fs: ctx.fs, db: ctx.firestore, uid: user.uid, log: warn }),
    );
    const choice = plan.needsChoice ? await askChoice(plan) : "merge";
    if (choice === null || useAuth.getState().user?.uid !== user.uid) return;
    await executeMerge(plan, choice, { includeRecords: historySync, db });
    if (choice === "cloudOnly") await deps.reloadSettings();
    await kv.set(LINKED_UID_KEY, user.uid);
  }
  if (useAuth.getState().user?.uid !== user.uid) return;
  useCloud.setState({ phase: "syncing" });
  engine = await startUserSync(user, {
    fs: ctx.fs,
    firestore: ctx.firestore,
    db,
    historySync,
    onSettingsApplied: () => void deps.reloadSettings(),
  });
  engineUid = user.uid;
  // Idempotent; it also re-runs an upload pass on every later Google sign-in.
  void deps.startArtCloud().catch((err: unknown) => warn("cloud: art sync failed to start", err));
  // PAY: entitlement sync (idempotent; PaywallHost also starts it).
  void deps.startPayments().catch((err: unknown) => warn("cloud: payments failed to start", err));
}

function onAuthChange(state: AuthState): void {
  const u = state.user;
  if (u && !u.isAnonymous) {
    if (engineUid === u.uid || flowUid === u.uid) return;
    flowUid = u.uid;
    flow = (async () => {
      await stopEngine();
      await runAccountFlow(u);
    })()
      .catch((err: unknown) => {
        warn("cloud: account sync failed to start", err);
        useSyncStatus.getState().set({
          active: true,
          state: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      })
      .finally(() => {
        flow = null;
        flowUid = null;
        if (!engine) useCloud.setState({ phase: "idle" });
      });
  } else if (engine || flow) void stopSync();
}

async function stopEngine(): Promise<void> {
  engine?.stop();
  engine = null;
  engineUid = null;
  useSyncStatus.getState().reset();
}

/** Stop syncing (sign-out / account deletion). Cancels a pending merge prompt. */
export async function stopSync(): Promise<void> {
  resolveChoice?.(null);
  const pending = flow;
  if (pending) await pending.catch(() => {});
  await stopEngine();
  useCloud.setState({ phase: "idle", mergePrompt: null });
}

/**
 * Before Firebase sign-out: stop sync, then forget sync state and (optionally) the account's
 * local data. The "merged" marker goes first so an interrupted clear can never skip the next
 * sign-in's merge prompt.
 */
async function beforeSignOut(opts: SignOutOptions): Promise<void> {
  await stopSync();
  const db = deps.db();
  if (opts.removeLocalData) await db.kv.delete(LINKED_UID_KEY);
  await clearSyncState(db);
  if (opts.removeLocalData) {
    await clearLocalAccountData({ includeRecords: deps.historySync() }, db);
    await deps.reloadSettings();
  }
}

declare global {
  interface Window {
    __tcgAuth?: {
      signInForTests: typeof signInForTests;
      signOut: typeof signOut;
      auth: () => AuthState;
      sync: () => ReturnType<typeof useSyncStatus.getState>;
    };
  }
}

function exposeTestHooks() {
  if (process.env.NEXT_PUBLIC_TEST_HOOKS !== "1" || !emulatorsEnabled()) return;
  if (typeof window === "undefined") return;
  window.__tcgAuth = {
    signInForTests,
    signOut,
    auth: () => useAuth.getState(),
    sync: () => useSyncStatus.getState(),
  };
}

/** App Check + auth + sync. Safe to call many times (pages call it on mount). */
export function startCloud(overrides: Partial<CloudDeps> = {}): Promise<void> {
  startPromise ??= (async () => {
    deps = { ...defaultDeps(), ...overrides };
    configureAuth({ beforeSignOut });
    if (!isCloudConfigured()) {
      await initAuth();
      return;
    }
    exposeTestHooks();
    await initAppCheck().catch((err: unknown) => warn("cloud: App Check init failed", err));
    useAuth.subscribe(onAuthChange);
    await initAuth();
    onAuthChange(useAuth.getState());
  })();
  return startPromise;
}

/** AUTH-005: delete the account server-side, then sign out and clear this device. */
export async function deleteMyAccount(): Promise<void> {
  await deleteAccountCore({
    stopSync,
    callDelete: async () => {
      const { getFunctionsClient } = await import("@/lib/firebase/client");
      const fns = await getFunctionsClient();
      if (!fns) throw new Error("cloud not configured");
      const { httpsCallable } = await import("firebase/functions");
      await httpsCallable(fns, "deleteUserData")({});
    },
    signOutAndClear: () => signOut({ removeLocalData: true }),
  });
}

/** Test hook: forget module state. */
export function resetCloudForTests(): void {
  startPromise = null;
  engine?.stop();
  engine = null;
  engineUid = null;
  flow = null;
  flowUid = null;
  resolveChoice = null;
  deps = defaultDeps();
  useCloud.setState({ phase: "idle", mergePrompt: null });
}
