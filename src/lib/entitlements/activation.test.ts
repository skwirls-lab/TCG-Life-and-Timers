// The Checkout success page: activating → active (listener flips) or → slow after ~20 s.
// @req PAY-002 @req PAY-003
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/lib/auth/store";
import {
  ACTIVATION_TIMEOUT_MS,
  defaultActivationDeps,
  watchActivation,
  type ActivationDeps,
  type ActivationState,
} from "./activation";
import { useEntitlements } from "./store";

function harness(over: Partial<ActivationDeps> = {}) {
  let pro = false;
  const subs = new Set<(p: boolean) => void>();
  let account: () => void = () => {};
  const accountReady = new Promise<void>((r) => (account = r));
  const refresh = vi.fn(async () => ({ status: "ok", pro: false }));
  const deps: ActivationDeps = {
    isPro: () => pro,
    subscribePro: (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    waitForAccount: () => accountReady,
    refresh,
    timeoutMs: ACTIVATION_TIMEOUT_MS,
    ...over,
  };
  const states: ActivationState[] = [];
  return {
    deps,
    states,
    refresh,
    subs,
    signIn: () => account(),
    setPro: (p: boolean) => {
      pro = p;
      for (const cb of [...subs]) cb(p);
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
  useEntitlements.setState({ pro: false });
  useAuth.setState({ user: null, initialized: false });
});

describe("watchActivation", () => {
  it("refreshes once the account is known, then turns active when the listener flips", async () => {
    vi.useFakeTimers();
    const h = harness();
    const stop = watchActivation((s) => h.states.push(s), h.deps);
    expect(h.states).toEqual(["activating"]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.refresh).not.toHaveBeenCalled(); // auth not restored yet
    h.signIn();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.refresh).toHaveBeenCalledTimes(1);
    h.setPro(true);
    expect(h.states).toEqual(["activating", "active"]);
    expect(h.subs.size).toBe(0); // stopped listening
    await vi.advanceTimersByTimeAsync(ACTIVATION_TIMEOUT_MS * 2);
    expect(h.states).toEqual(["activating", "active"]); // no "slow" after success
    expect(h.refresh).toHaveBeenCalledTimes(1);
    stop();
  });

  it("shows 'slow' after the timeout, and still turns active on a late webhook", async () => {
    vi.useFakeTimers();
    const h = harness();
    watchActivation((s) => h.states.push(s), h.deps);
    h.signIn();
    await vi.advanceTimersByTimeAsync(ACTIVATION_TIMEOUT_MS - 1);
    expect(h.states).toEqual(["activating"]);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.states).toEqual(["activating", "slow"]);
    h.setPro(true);
    expect(h.states).toEqual(["activating", "slow", "active"]);
  });

  it("is active immediately when already Pro (no refresh)", async () => {
    const h = harness();
    h.setPro(true);
    watchActivation((s) => h.states.push(s), h.deps);
    expect(h.states).toEqual(["activating", "active"]);
    h.signIn();
    await Promise.resolve();
    expect(h.refresh).not.toHaveBeenCalled();
  });

  it("ignores a failing refresh and stops cleanly", async () => {
    vi.useFakeTimers();
    const h = harness({ refresh: vi.fn(async () => Promise.reject(new Error("offline"))) });
    const stop = watchActivation((s) => h.states.push(s), h.deps);
    h.signIn();
    await vi.advanceTimersByTimeAsync(0);
    stop();
    await vi.advanceTimersByTimeAsync(ACTIVATION_TIMEOUT_MS);
    h.setPro(true);
    expect(h.states).toEqual(["activating"]);
  });

  it("default deps follow the entitlement and auth stores", async () => {
    const d = defaultActivationDeps();
    const seen: boolean[] = [];
    const unsub = d.subscribePro((p) => seen.push(p));
    useEntitlements.setState({ pro: true });
    expect(d.isPro()).toBe(true);
    unsub();
    useEntitlements.setState({ pro: false });
    expect(seen).toEqual([true]);
    let ready = false;
    void d.waitForAccount().then(() => (ready = true));
    useAuth.setState({
      initialized: true,
      user: { uid: "a", email: null, displayName: null, photoURL: null, isAnonymous: true },
    });
    await Promise.resolve();
    expect(ready).toBe(false); // anonymous doesn't count
    useAuth.setState({
      user: { uid: "g", email: "g@x", displayName: null, photoURL: null, isAnonymous: false },
    });
    await Promise.resolve();
    expect(ready).toBe(true);
    expect(d.timeoutMs).toBe(20_000);
  });
});
