// @req PAY-002 @req PAY-004
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "@/lib/auth/types";
import { fakeRemote } from "../../../tests/unit/support/fakeRemote";
import {
  PORTAL_FUNCTION,
  checkoutSessionData,
  openBillingPortal,
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

function setup(user: AuthUser | null = google, extra: Partial<CheckoutDeps> = {}) {
  const remote = fakeRemote();
  let current = user;
  const navigate = vi.fn();
  const deps: Partial<CheckoutDeps> = {
    remote,
    currentUser: () => current,
    signIn: vi.fn(async () => {
      current = current ? { ...current, isAnonymous: false } : google;
    }),
    origin: () => "https://app.test",
    navigate,
    timeoutMs: 1000,
    ...extra,
  };
  return { remote, deps, navigate, setUser: (u: AuthUser | null) => (current = u) };
}

/** Let the checkout add its doc, then let the "extension" answer. */
async function extensionAnswers(
  remote: ReturnType<typeof fakeRemote>,
  data: Record<string, unknown>,
) {
  await vi.waitFor(() => expect(remote.listeners).toHaveLength(1));
  remote.serverWrite(remote.listeners[0]!.path, data);
}

afterEach(() => vi.useRealTimers());

describe("startCheckout (T7.2)", () => {
  // @req PAY-002
  it("writes the checkout session doc and redirects to the extension's url", async () => {
    const { remote, deps, navigate } = setup();
    const p = startCheckout("price_month1", "subscription", deps);
    await extensionAnswers(remote, { url: "https://example.com/stripe" });
    await expect(p).resolves.toEqual({ status: "redirected", url: "https://example.com/stripe" });
    expect(navigate).toHaveBeenCalledWith("https://example.com/stripe");
    const [path, doc] = [...remote.docs.entries()][0]!;
    expect(path).toMatch(/^customers\/u1\/checkout_sessions\/doc\d+$/);
    expect(doc).toMatchObject({
      price: "price_month1",
      success_url: "https://app.test/pro?status=success",
      cancel_url: "https://app.test/pro?status=cancel",
      mode: "subscription",
    });
    expect(remote.listeners).toHaveLength(0); // unsubscribed
  });

  // @req PAY-002
  it("uses payment mode for lifetime and surfaces extension errors", async () => {
    const { remote, deps, navigate } = setup();
    const p = startCheckout("price_life1", "payment", deps);
    await extensionAnswers(remote, { error: { message: "No such price" } });
    await expect(p).resolves.toEqual({ status: "error", error: "No such price" });
    expect([...remote.docs.values()][0]).toMatchObject({ mode: "payment" });
    expect(navigate).not.toHaveBeenCalled();
  });

  it("ignores snapshots without url/error and reports listener errors", async () => {
    const { remote, deps } = setup();
    const p = startCheckout("price_m", "subscription", deps);
    await vi.waitFor(() => expect(remote.listeners).toHaveLength(1));
    const l = remote.listeners[0]!;
    l.next({ exists: false, data: null, fromCache: true });
    remote.serverWrite(l.path, { price: "price_m" });
    l.error("permission-denied");
    await expect(p).resolves.toEqual({ status: "error", error: "permission-denied" });
  });

  it("times out when the extension never answers", async () => {
    vi.useFakeTimers();
    const { remote, deps } = setup();
    const p = startCheckout("price_m", "subscription", deps);
    await vi.waitFor(() => expect(remote.listeners).toHaveLength(1));
    await vi.advanceTimersByTimeAsync(1001);
    await expect(p).resolves.toEqual({ status: "timeout" });
    expect(remote.listeners).toHaveLength(0);
  });

  // @req PAY-004
  it("asks a signed-out or anonymous user to sign in with Google first", async () => {
    const out = setup(null, { signIn: vi.fn(async () => {}) });
    await expect(startCheckout("price_m", "subscription", out.deps)).resolves.toEqual({
      status: "needsSignIn",
    });
    expect(out.remote.docs.size).toBe(0);

    const linked = setup(anon);
    const p = startCheckout("price_m", "subscription", linked.deps);
    await extensionAnswers(linked.remote, { url: "https://example.com/s" });
    await expect(p).resolves.toMatchObject({ status: "redirected" });
    expect(linked.deps.signIn).toHaveBeenCalledTimes(1);
    expect([...linked.remote.docs.keys()][0]).toMatch(/^customers\/anon1\//);
  });

  it("reports write failures and invalid prices as errors", async () => {
    const { remote, deps } = setup();
    remote.failNext.addDoc = new Error("offline");
    await expect(startCheckout("price_m", "subscription", deps)).resolves.toEqual({
      status: "error",
      error: "offline",
    });
    const bad = await startCheckout("not-a-price", "subscription", deps);
    expect(bad.status).toBe("error");
  });

  it("builds the rules-shaped session doc", () => {
    expect(checkoutSessionData("price_x", "payment", "http://localhost:3000")).toEqual({
      price: "price_x",
      success_url: "http://localhost:3000/pro?status=success",
      cancel_url: "http://localhost:3000/pro?status=cancel",
      mode: "payment",
    });
  });
});

describe("openBillingPortal", () => {
  it("redirects to the portal link from the extension callable", async () => {
    const { remote, deps, navigate } = setup();
    remote.callResult = { url: "https://billing.example.com/p" };
    await expect(openBillingPortal(deps)).resolves.toEqual({
      status: "redirected",
      url: "https://billing.example.com/p",
    });
    expect(remote.calls).toEqual([
      { name: PORTAL_FUNCTION, data: { returnUrl: "https://app.test/pro" } },
    ]);
    expect(navigate).toHaveBeenCalledWith("https://billing.example.com/p");
  });

  it("is unavailable without the extension, a url, or a Google user", async () => {
    const { remote, deps } = setup();
    remote.failNext.call = new Error("not-found");
    await expect(openBillingPortal(deps)).resolves.toEqual({ status: "unavailable" });
    remote.callResult = {};
    await expect(openBillingPortal(deps)).resolves.toEqual({ status: "unavailable" });
    remote.callResult = null;
    await expect(openBillingPortal(deps)).resolves.toEqual({ status: "unavailable" });
    const signedOut = setup(null);
    await expect(openBillingPortal(signedOut.deps)).resolves.toEqual({ status: "unavailable" });
  });
});
