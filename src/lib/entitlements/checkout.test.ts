// @req PAY-002 @req PAY-004
import { describe, expect, it, vi } from "vitest";
import type { AuthUser } from "@/lib/auth/types";
import { fakeRemote } from "../../../tests/unit/support/fakeRemote";
import {
  CHECKOUT_FUNCTION,
  PORTAL_FUNCTION,
  REFRESH_FUNCTION,
  errorReason,
  openPortal,
  restorePurchases,
  startCheckout,
  type CheckoutDeps,
} from "./checkout";

const google: AuthUser = {
  uid: "u1",
  email: "a@example.com",
  displayName: "A",
  photoURL: null,
  isAnonymous: false,
};
const anon: AuthUser = { ...google, uid: "anon1", email: null, isAnonymous: true };

/** An HttpsError as the Functions SDK throws it (code + details.reason). */
const httpsError = (code: string, reason: string) =>
  Object.assign(new Error(reason), { code: `functions/${code}`, details: { reason } });

function setup(user: AuthUser | null = google, extra: Partial<CheckoutDeps> = {}) {
  const remote = fakeRemote();
  let current = user;
  const navigate = vi.fn();
  const signIn = vi.fn(async () => {
    current = current ? { ...current, isAnonymous: false } : google;
  });
  const deps: Partial<CheckoutDeps> = {
    remote,
    currentUser: () => current,
    signIn,
    origin: () => "https://tcgtempo.web.app",
    navigate,
    ...extra,
  };
  return { remote, deps, navigate, signIn, setUser: (u: AuthUser | null) => (current = u) };
}

describe("startCheckout (createCheckoutSession callable)", () => {
  // @req PAY-002
  it("calls createCheckoutSession with the price and origin, then goes to Checkout", async () => {
    const { remote, deps, navigate } = setup();
    remote.callResult = { url: "https://checkout.stripe.com/c/cs_1" };
    await expect(startCheckout("price_month1", deps)).resolves.toEqual({
      status: "redirected",
      url: "https://checkout.stripe.com/c/cs_1",
    });
    expect(remote.calls).toEqual([
      {
        name: CHECKOUT_FUNCTION,
        data: { priceId: "price_month1", returnOrigin: "https://tcgtempo.web.app" },
      },
    ]);
    expect(navigate).toHaveBeenCalledWith("https://checkout.stripe.com/c/cs_1");
    expect(remote.docs.size).toBe(0); // no Firestore writes any more (no extension)
  });

  // @req PAY-002 @req PAY-004
  it("alreadyPro opens the Billing Portal instead", async () => {
    const { remote, deps, navigate } = setup();
    remote.callResultFor = {
      [CHECKOUT_FUNCTION]: { status: "alreadyPro" },
      [PORTAL_FUNCTION]: { url: "https://billing.stripe.com/p/session_1" },
    };
    await expect(startCheckout("price_month1", deps)).resolves.toEqual({
      status: "alreadyPro",
      portal: { status: "redirected", url: "https://billing.stripe.com/p/session_1" },
    });
    expect(remote.calls.map((c) => c.name)).toEqual([CHECKOUT_FUNCTION, PORTAL_FUNCTION]);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith("https://billing.stripe.com/p/session_1");
  });

  // @req PAY-002 @req AUTH-003
  it("signs a guest in with Google first (anonymous users must upgrade)", async () => {
    const { remote, deps, signIn } = setup(anon);
    remote.callResult = { url: "https://checkout.stripe.com/c/x" };
    await expect(startCheckout("price_1", deps)).resolves.toMatchObject({ status: "redirected" });
    expect(signIn).toHaveBeenCalledTimes(1);
  });

  it("stays put when sign-in doesn't complete (redirect flow / cancelled)", async () => {
    const { remote, deps } = setup(null, { signIn: vi.fn(async () => {}) });
    await expect(startCheckout("price_1", deps)).resolves.toEqual({ status: "needsSignIn" });
    expect(remote.calls).toEqual([]);
  });

  it("maps server errors (sign-in-required, others) and a missing url", async () => {
    const { remote, deps, navigate } = setup();
    remote.failNext.call = httpsError("failed-precondition", "sign-in-required");
    await expect(startCheckout("price_1", deps)).resolves.toEqual({ status: "needsSignIn" });
    remote.failNext.call = httpsError("invalid-argument", "price-not-allowed");
    await expect(startCheckout("price_1", deps)).resolves.toEqual({
      status: "error",
      error: "price-not-allowed",
    });
    remote.callResult = { url: "javascript:alert(1)" };
    await expect(startCheckout("price_1", deps)).resolves.toEqual({
      status: "error",
      error: "no checkout url",
    });
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe("openPortal (createPortalSession callable)", () => {
  // @req PAY-004
  it("navigates to the portal url", async () => {
    const { remote, deps, navigate } = setup();
    remote.callResult = { url: "https://billing.stripe.com/p/1" };
    await expect(openPortal(deps)).resolves.toEqual({
      status: "redirected",
      url: "https://billing.stripe.com/p/1",
    });
    expect(remote.calls).toEqual([
      { name: PORTAL_FUNCTION, data: { returnOrigin: "https://tcgtempo.web.app" } },
    ]);
    expect(navigate).toHaveBeenCalledWith("https://billing.stripe.com/p/1");
  });

  // @req PAY-004
  it("reports noCustomer, failures and signed-out users", async () => {
    const { remote, deps, navigate, setUser } = setup();
    remote.failNext.call = httpsError("not-found", "no-customer");
    await expect(openPortal(deps)).resolves.toEqual({ status: "noCustomer" });
    remote.failNext.call = new Error("internal");
    await expect(openPortal(deps)).resolves.toEqual({ status: "unavailable" });
    remote.callResult = null;
    await expect(openPortal(deps)).resolves.toEqual({ status: "unavailable" });
    setUser(null);
    await expect(openPortal(deps)).resolves.toEqual({ status: "unavailable" });
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe("restorePurchases (refreshEntitlements callable)", () => {
  // @req PAY-004
  it("returns the server's answer, and the rate limit", async () => {
    const { remote, deps } = setup();
    remote.callResult = { pro: true, source: "subscription" };
    await expect(restorePurchases(deps)).resolves.toEqual({ status: "ok", pro: true });
    expect(remote.calls).toEqual([{ name: REFRESH_FUNCTION, data: {} }]);
    remote.callResult = { pro: false, source: "none" };
    await expect(restorePurchases(deps)).resolves.toEqual({ status: "ok", pro: false });
    remote.failNext.call = httpsError("resource-exhausted", "rate-limited");
    await expect(restorePurchases(deps)).resolves.toEqual({ status: "rateLimited" });
    remote.failNext.call = new Error("offline");
    await expect(restorePurchases(deps)).resolves.toEqual({ status: "error", error: "offline" });
  });

  it("needs a signed-in account", async () => {
    const { remote, deps } = setup(anon);
    await expect(restorePurchases(deps)).resolves.toEqual({ status: "needsSignIn" });
    expect(remote.calls).toEqual([]);
  });

  it("reads the reason from HttpsError details only", () => {
    expect(errorReason(httpsError("x", "no-customer"))).toBe("no-customer");
    expect(errorReason(new Error("x"))).toBeNull();
    expect(errorReason(null)).toBeNull();
  });
});
