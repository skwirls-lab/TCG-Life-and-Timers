"use client";
/**
 * Stripe Checkout, the Billing Portal and "Restore purchases" through the app's own Cloud
 * Functions (PAY-002, PAY-004, D-082; functions/src/logic/billing.ts):
 *   - startCheckout(priceId): the buyer must be signed in with Google (anonymous users link first,
 *     AUTH-003); `createCheckoutSession` answers a Checkout URL, or `alreadyPro`, in which case
 *     the portal opens instead.
 *   - openPortal(): `createPortalSession` → the Stripe Billing Portal ("Manage subscription").
 *   - restorePurchases(): `refreshEntitlements` re-reads the purchase from Stripe (rate-limited
 *     server-side to once per 30 s).
 * The Functions SDK is loaded lazily by the remote port (never in the /play bundle, PERF-003).
 */
import { signInWithGoogle, useAuth } from "@/lib/auth/store";
import type { AuthUser } from "@/lib/auth/types";
import { firebaseRemote, type RemotePort } from "./remote";

export const CHECKOUT_FUNCTION = "createCheckoutSession";
export const PORTAL_FUNCTION = "createPortalSession";
export const REFRESH_FUNCTION = "refreshEntitlements";

export interface CheckoutDeps {
  remote: RemotePort;
  currentUser: () => AuthUser | null;
  /** Google sign-in (links an anonymous user). May navigate away (redirect flow). */
  signIn: () => Promise<void>;
  origin: () => string;
  navigate: (url: string) => void;
}

export type CheckoutResult =
  | { status: "redirected"; url: string }
  /** Already subscribed: the Billing Portal was opened instead (or is unavailable). */
  | { status: "alreadyPro"; portal: PortalResult }
  | { status: "needsSignIn" }
  | { status: "error"; error: string };

export type PortalResult =
  { status: "redirected"; url: string } | { status: "noCustomer" } | { status: "unavailable" };

export type RestoreResult =
  | { status: "ok"; pro: boolean }
  | { status: "rateLimited" }
  | { status: "needsSignIn" }
  | { status: "error"; error: string };

const defaultDeps = (): CheckoutDeps => ({
  remote: firebaseRemote(),
  currentUser: () => useAuth.getState().user,
  signIn: signInWithGoogle,
  origin: () => window.location.origin,
  navigate: (url) => window.location.assign(url),
});

const isBuyer = (u: AuthUser | null): u is AuthUser => !!u && !u.isAnonymous;

/** The server's stable error reason (HttpsError details.reason), if any. */
export function errorReason(err: unknown): string | null {
  const details = (err as { details?: unknown } | null)?.details;
  const reason = (details as { reason?: unknown } | null)?.reason;
  return typeof reason === "string" ? reason : null;
}

function errorText(err: unknown): string {
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) return String(err.message);
  return String(err);
}

const urlOf = (res: unknown): string | null => {
  const url = (res as { url?: unknown } | null)?.url;
  return typeof url === "string" && /^https?:\/\//.test(url) ? url : null;
};

export async function openPortal(overrides: Partial<CheckoutDeps> = {}): Promise<PortalResult> {
  const deps = { ...defaultDeps(), ...overrides };
  if (!deps.currentUser()) return { status: "unavailable" };
  try {
    const url = urlOf(await deps.remote.call(PORTAL_FUNCTION, { returnOrigin: deps.origin() }));
    if (!url) return { status: "unavailable" };
    deps.navigate(url);
    return { status: "redirected", url };
  } catch (err) {
    return errorReason(err) === "no-customer"
      ? { status: "noCustomer" }
      : { status: "unavailable" };
  }
}

export async function startCheckout(
  priceId: string,
  overrides: Partial<CheckoutDeps> = {},
): Promise<CheckoutResult> {
  const deps = { ...defaultDeps(), ...overrides };
  if (!isBuyer(deps.currentUser())) {
    await deps.signIn();
    if (!isBuyer(deps.currentUser())) return { status: "needsSignIn" };
  }
  try {
    const res = await deps.remote.call(CHECKOUT_FUNCTION, {
      priceId,
      returnOrigin: deps.origin(),
    });
    if ((res as { status?: unknown } | null)?.status === "alreadyPro")
      return { status: "alreadyPro", portal: await openPortal(deps) };
    const url = urlOf(res);
    if (!url) return { status: "error", error: "no checkout url" };
    deps.navigate(url);
    return { status: "redirected", url };
  } catch (err) {
    if (errorReason(err) === "sign-in-required") return { status: "needsSignIn" };
    return { status: "error", error: errorText(err) };
  }
}

export async function restorePurchases(
  overrides: Partial<Pick<CheckoutDeps, "remote" | "currentUser">> = {},
): Promise<RestoreResult> {
  const deps = { ...defaultDeps(), ...overrides };
  if (!isBuyer(deps.currentUser())) return { status: "needsSignIn" };
  try {
    const res = (await deps.remote.call(REFRESH_FUNCTION, {})) as { pro?: unknown } | null;
    return { status: "ok", pro: res?.pro === true };
  } catch (err) {
    if (errorReason(err) === "rate-limited") return { status: "rateLimited" };
    return { status: "error", error: errorText(err) };
  }
}
