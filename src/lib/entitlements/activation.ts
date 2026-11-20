"use client";
/**
 * The Checkout success return (/pro?checkout=success&session_id=…, PAY-002): show "activating",
 * ask the server once to re-read the purchase from Stripe (`refreshEntitlements`, in case the
 * webhook is slow), then wait for the entitlement listener (./sync.ts) to flip `pro`.
 * After ACTIVATION_TIMEOUT_MS without Pro the state becomes "slow" (the page offers Restore
 * purchases) but keeps listening, so a late webhook still turns it into "active".
 */
import { useAuth } from "@/lib/auth/store";
import { useEntitlements } from "./store";

export const ACTIVATION_TIMEOUT_MS = 20_000;

export type ActivationState = "activating" | "active" | "slow";

export interface ActivationDeps {
  isPro: () => boolean;
  /** Calls back on every `pro` change; returns an unsubscribe. */
  subscribePro: (cb: (pro: boolean) => void) => () => void;
  /** Resolves once a (non-anonymous) account is signed in; never resolves without one. */
  waitForAccount: () => Promise<void>;
  /** One server re-check (errors are ignored: the listener and the timeout still apply). */
  refresh: () => Promise<unknown>;
  timeoutMs: number;
}

export function defaultActivationDeps(): ActivationDeps {
  return {
    isPro: () => useEntitlements.getState().pro,
    subscribePro: (cb) => useEntitlements.subscribe((s, prev) => s.pro !== prev.pro && cb(s.pro)),
    waitForAccount: () =>
      new Promise<void>((resolve) => {
        const ok = () => {
          const { user, initialized } = useAuth.getState();
          return initialized && !!user && !user.isAnonymous;
        };
        if (ok()) return resolve();
        const unsub = useAuth.subscribe(() => {
          if (!ok()) return;
          unsub();
          resolve();
        });
      }),
    refresh: async () => {
      const { restorePurchases } = await import("./checkout");
      return restorePurchases();
    },
    timeoutMs: ACTIVATION_TIMEOUT_MS,
  };
}

/** Starts watching; `onState` gets every state change. Returns a stop function. */
export function watchActivation(
  onState: (s: ActivationState) => void,
  deps: ActivationDeps = defaultActivationDeps(),
): () => void {
  let state: ActivationState | null = null;
  let stopped = false;
  const set = (s: ActivationState) => {
    if (stopped || state === s || state === "active") return;
    state = s;
    onState(s);
  };
  const finish = () => {
    set("active");
    stop();
  };
  set("activating");
  const unsub = deps.subscribePro((pro) => pro && finish());
  const timer = setTimeout(() => set("slow"), deps.timeoutMs);
  const stop = () => {
    stopped = true;
    clearTimeout(timer);
    unsub();
  };
  if (deps.isPro()) {
    finish();
    return stop;
  }
  void deps
    .waitForAccount()
    .then(() => (stopped ? undefined : deps.refresh()))
    .catch(() => undefined);
  return stop;
}
