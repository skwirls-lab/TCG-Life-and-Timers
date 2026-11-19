"use client";
/**
 * Auth state (T4.1: AUTH-001, AUTH-002, AUTH-004). Guests never need this: until a cloud feature
 * is used nothing here loads Firebase. The driver is injected (`configureAuth`) so transitions are
 * unit-tested with fakes; the default driver dynamically imports firebase/auth.
 */
import { create } from "zustand";
import { isCloudConfigured, sameOriginAuth } from "@/lib/firebase/config";
import { isStandalone } from "@/lib/device/fullscreen";
import {
  CANCELLED_CODES,
  errorCode,
  POPUP_FALLBACK_CODES,
  type AuthDriver,
  type AuthStatus,
  type AuthUser,
} from "./types";

export interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  /** Firebase error code of the last failed action (cancellations are not errors). */
  error: string | null;
  /** True once the first auth state (and any redirect result) is known. */
  initialized: boolean;
}

export const useAuth = create<AuthState>(() => ({
  status: isCloudConfigured() ? "signedOut" : "unconfigured",
  user: null,
  error: null,
  initialized: false,
}));

export interface SignOutOptions {
  /** AUTH-004: also clear the account's synced data from this device (the active game stays). */
  removeLocalData?: boolean;
}

export interface AuthEnv {
  cloudConfigured: () => boolean;
  loadDriver: () => Promise<AuthDriver | null>;
  /** Mobile browsers and installed PWAs use redirect; desktop uses a popup (AUTH-001). */
  preferRedirect: () => boolean;
  /**
   * Runs before Firebase sign-out: stop sync (so clearing isn't pushed as deletes) and clear the
   * device. Doing it first means a tab closed mid-way is still signed in, never half-cleared.
   */
  beforeSignOut: (opts: SignOutOptions) => Promise<void>;
  /** Runs after sign-out. */
  afterSignOut: (opts: SignOutOptions) => Promise<void>;
}

/** Mobile UA or installed PWA (iOS standalone popups are unreliable, PRD §5.3). */
/**
 * Popup first everywhere: the redirect flow loses its result in browsers that partition
 * third-party storage whenever the auth domain (`<project>.firebaseapp.com`) differs from the
 * app's domain, which looked like "picked an account, came back still signed out" on phones.
 * Redirect is only preferred where popups can't report back (an installed app on iOS) AND the
 * handler is same-origin, so the redirect result survives. A blocked popup still falls back to
 * redirect (POPUP_FALLBACK_CODES).
 */
export function defaultPreferRedirect(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  const standalone = isStandalone((q) => window.matchMedia(q), nav);
  const ios =
    /iPhone|iPad|iPod/i.test(nav.userAgent) ||
    (/Macintosh/.test(nav.userAgent) && nav.maxTouchPoints > 1);
  return standalone && ios && sameOriginAuth();
}

const defaultEnv = (): AuthEnv => ({
  cloudConfigured: () => isCloudConfigured(),
  loadDriver: async () => (await import("./firebaseDriver")).loadFirebaseAuthDriver(),
  preferRedirect: defaultPreferRedirect,
  beforeSignOut: async () => {},
  afterSignOut: async () => {},
});

let env: AuthEnv = defaultEnv();
let driverPromise: Promise<AuthDriver | null> | null = null;
let initPromise: Promise<void> | null = null;
let unsubscribe: (() => void) | null = null;

/** Override parts of the environment (tests, and cloud.ts for the sign-out hooks). */
export function configureAuth(overrides: Partial<AuthEnv> = {}): void {
  env = { ...env, ...overrides };
}

/** Test hook: forget the driver and state. */
export function resetAuthForTests(overrides: Partial<AuthEnv> = {}): void {
  unsubscribe?.();
  unsubscribe = null;
  driverPromise = null;
  initPromise = null;
  env = { ...defaultEnv(), ...overrides };
  useAuth.setState({
    status: env.cloudConfigured() ? "signedOut" : "unconfigured",
    user: null,
    error: null,
    initialized: false,
  });
}

function driver(): Promise<AuthDriver | null> {
  if (!env.cloudConfigured()) return Promise.resolve(null);
  driverPromise ??= env.loadDriver().catch((err: unknown) => {
    driverPromise = null;
    throw err;
  });
  return driverPromise;
}

function setUser(user: AuthUser | null) {
  const cur = useAuth.getState();
  useAuth.setState({
    user,
    status: user ? "signedIn" : cur.status === "signingIn" ? "signingIn" : "signedOut",
  });
}

/** Subscribe to Firebase auth state and finish redirect sign-ins. Idempotent. */
export function initAuth(): Promise<void> {
  if (!env.cloudConfigured()) {
    useAuth.setState({ status: "unconfigured", initialized: true });
    return Promise.resolve();
  }
  initPromise ??= (async () => {
    try {
      const d = await driver();
      if (!d) return;
      let first: () => void = () => {};
      const firstState = new Promise<void>((r) => (first = r));
      unsubscribe = d.onAuthStateChanged((user) => {
        setUser(user);
        first();
      });
      try {
        await d.completeRedirect();
      } catch (err) {
        if (!CANCELLED_CODES.has(errorCode(err))) useAuth.setState({ error: errorCode(err) });
      }
      await firstState;
    } catch (err) {
      useAuth.setState({ error: errorCode(err) });
    } finally {
      useAuth.setState({ initialized: true });
    }
  })();
  return initPromise;
}

async function readyDriver(): Promise<AuthDriver | null> {
  await initAuth();
  return driver();
}

/** AUTH-001: popup on desktop (redirect fallback), redirect on mobile / standalone PWAs. */
export async function signInWithGoogle(): Promise<void> {
  const d = await readyDriver();
  if (!d) return;
  const before = useAuth.getState();
  useAuth.setState({ status: "signingIn", error: null });
  const restore = () =>
    useAuth.setState({ status: d.currentUser() || before.user ? "signedIn" : "signedOut" });
  try {
    if (env.preferRedirect()) {
      await d.signInWithGoogle("redirect"); // navigates away
      return;
    }
    try {
      await d.signInWithGoogle("popup");
    } catch (err) {
      if (!POPUP_FALLBACK_CODES.has(errorCode(err))) throw err;
      await d.signInWithGoogle("redirect");
      return;
    }
    setUser(d.currentUser());
  } catch (err) {
    const code = errorCode(err);
    useAuth.setState({ error: CANCELLED_CODES.has(code) ? null : code });
    restore();
  }
}

/** AUTH-003: an anonymous user upgrades to Google keeping its uid (same flow as sign-in). */
export const linkAnonymousToGoogle = signInWithGoogle;

/**
 * AUTH-002: lazily create an anonymous Firebase user, only when a cloud feature needs an auth
 * uid (feedback, share links). Returns the current user, or null when cloud is unavailable.
 */
export async function ensureAnonymous(): Promise<AuthUser | null> {
  const d = await readyDriver();
  if (!d) return null;
  const cur = d.currentUser();
  if (cur) return cur;
  const user = await d.signInAnonymously();
  setUser(user);
  return user;
}

/** AUTH-004: sign out; optionally remove this account's synced data from the device. */
export async function signOut(opts: SignOutOptions = {}): Promise<void> {
  const d = await readyDriver();
  await env.beforeSignOut(opts);
  if (d) await d.signOut();
  useAuth.setState({ user: null, status: env.cloudConfigured() ? "signedOut" : "unconfigured" });
  await env.afterSignOut(opts);
}

/** Emulator-only test sign-in (exposed as window.__tcgAuth in test builds). */
export async function signInForTests(email: string): Promise<void> {
  const d = await readyDriver();
  if (!d?.signInForTests) throw new Error("signInForTests is only available with emulators");
  await d.signInForTests(email);
  setUser(d.currentUser());
}
