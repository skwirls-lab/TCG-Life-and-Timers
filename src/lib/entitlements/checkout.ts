"use client";
/**
 * Stripe Checkout through the "Run Payments with Stripe" extension (T7.2, PAY-002):
 *   1. the buyer must be signed in with Google (anonymous users link first, AUTH-003),
 *   2. add `customers/{uid}/checkout_sessions/{id}` {price, success_url, cancel_url, mode}
 *      (the only client-writable extension doc; firestore.rules D-015),
 *   3. wait for the extension to write `url` (or `error`) on that doc, then redirect.
 * "Manage subscription" uses the extension's portal-link callable.
 */
import { signInWithGoogle, useAuth } from "@/lib/auth/store";
import type { AuthUser } from "@/lib/auth/types";
import { checkoutSessionDataSchema, paths } from "@/lib/firebase/docs";
import type { CheckoutMode } from "./pricing";
import { firebaseRemote, type RemotePort } from "./remote";

export const CHECKOUT_TIMEOUT_MS = 30_000;
export const PORTAL_FUNCTION = "ext-firestore-stripe-payments-createPortalLink";

export interface CheckoutDeps {
  remote: RemotePort;
  currentUser: () => AuthUser | null;
  /** Google sign-in (links an anonymous user). May navigate away (redirect flow). */
  signIn: () => Promise<void>;
  origin: () => string;
  navigate: (url: string) => void;
  timeoutMs: number;
}

export type CheckoutResult =
  | { status: "redirected"; url: string }
  | { status: "needsSignIn" }
  | { status: "error"; error: string }
  | { status: "timeout" };

const defaultDeps = (): CheckoutDeps => ({
  remote: firebaseRemote(),
  currentUser: () => useAuth.getState().user,
  signIn: signInWithGoogle,
  origin: () => window.location.origin,
  navigate: (url) => window.location.assign(url),
  timeoutMs: CHECKOUT_TIMEOUT_MS,
});

const isBuyer = (u: AuthUser | null): u is AuthUser => !!u && !u.isAnonymous;

/** The checkout_sessions document for `price` (validated against the rules' schema). */
export function checkoutSessionData(price: string, mode: CheckoutMode, origin: string) {
  return checkoutSessionDataSchema.parse({
    price,
    success_url: `${origin}/pro?status=success`,
    cancel_url: `${origin}/pro?status=cancel`,
    mode,
  });
}

function errorText(err: unknown): string {
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) return String(err.message);
  return String(err);
}

/** Wait for the extension to fill in `url` or `error` on the session doc. */
function waitForSession(
  remote: RemotePort,
  path: string,
  timeoutMs: number,
): Promise<{ url: string } | { error: string } | null> {
  return new Promise((resolve) => {
    let done = false;
    let unsub: () => void = () => {};
    const finish = (v: { url: string } | { error: string } | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      unsub();
      resolve(v);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    unsub = remote.onDoc(
      path,
      (snap) => {
        const d = snap.data;
        if (!d) return;
        if (typeof d.url === "string" && d.url) finish({ url: d.url });
        else if (d.error) finish({ error: errorText(d.error) });
      },
      (err) => finish({ error: errorText(err) }),
    );
    if (done) unsub();
  });
}

export async function startCheckout(
  price: string,
  mode: CheckoutMode,
  overrides: Partial<CheckoutDeps> = {},
): Promise<CheckoutResult> {
  const deps = { ...defaultDeps(), ...overrides };
  let user = deps.currentUser();
  if (!isBuyer(user)) {
    await deps.signIn();
    user = deps.currentUser();
    if (!isBuyer(user)) return { status: "needsSignIn" };
  }
  try {
    const data = checkoutSessionData(price, mode, deps.origin());
    const id = await deps.remote.addDoc(paths.checkoutSessions(user.uid), data);
    const res = await waitForSession(
      deps.remote,
      paths.checkoutSession(user.uid, id),
      deps.timeoutMs,
    );
    if (res === null) return { status: "timeout" };
    if ("error" in res) return { status: "error", error: res.error };
    deps.navigate(res.url);
    return { status: "redirected", url: res.url };
  } catch (err) {
    return { status: "error", error: errorText(err) };
  }
}

export type PortalResult = { status: "redirected"; url: string } | { status: "unavailable" };

/** Stripe customer portal ("Manage subscription"); unavailable without the extension. */
export async function openBillingPortal(
  overrides: Partial<Pick<CheckoutDeps, "remote" | "origin" | "navigate" | "currentUser">> = {},
): Promise<PortalResult> {
  const deps = { ...defaultDeps(), ...overrides };
  if (!isBuyer(deps.currentUser())) return { status: "unavailable" };
  try {
    const res = (await deps.remote.call(PORTAL_FUNCTION, {
      returnUrl: `${deps.origin()}/pro`,
    })) as { url?: unknown } | null;
    if (!res || typeof res.url !== "string" || !res.url) return { status: "unavailable" };
    deps.navigate(res.url);
    return { status: "redirected", url: res.url };
  } catch {
    return { status: "unavailable" };
  }
}
