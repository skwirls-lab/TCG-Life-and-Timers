"use client";
/**
 * The single paywall mount point (T7.1). Mount once (Providers); open it from anywhere with
 * `usePaywall.getState().open(feature)` / `openPaywall(feature)` / `useProGate(feature).open()`.
 *
 * On mount it also:
 *   - applies the test-only `pw=` URL param (TEST_HOOKS builds only; see entitlements/testHook),
 *   - starts entitlement sync (`startPayments`, idempotent) 1.5 s after first paint when this
 *     deployment has Firebase config, through a dynamic import (keeps the SDK out of the board).
 * The sheet itself is lazy-loaded the first time it opens.
 */
import { lazy, Suspense, useEffect } from "react";
import { usePaywall } from "@/lib/entitlements/paywall";
import { applyPaywallTestHook } from "@/lib/entitlements/testHook";
import { isCloudConfigured } from "@/lib/firebase/config";

const PaywallSheet = lazy(() => import("./PaywallSheet"));

export function PaywallHost() {
  const isOpen = usePaywall((s) => s.isOpen);
  const feature = usePaywall((s) => s.feature);
  const close = usePaywall((s) => s.close);

  useEffect(() => {
    applyPaywallTestHook(new URLSearchParams(window.location.search));
  }, []);

  useEffect(() => {
    // Warm the sheet chunk so the paywall also opens offline (the SW caches what was loaded).
    const warm = window.setTimeout(() => void import("./PaywallSheet").catch(() => {}), 3000);
    return () => window.clearTimeout(warm);
  }, []);

  useEffect(() => {
    if (!isCloudConfigured()) return;
    const timer = window.setTimeout(() => {
      void import("@/lib/entitlements/sync")
        .then((m) => m.startPayments())
        .catch((e: unknown) => console.warn("[pay] start failed", e));
    }, 1500);
    return () => window.clearTimeout(timer);
  }, []);

  if (!isOpen) return null;
  return (
    <Suspense fallback={null}>
      <PaywallSheet open={isOpen} feature={feature} onClose={close} />
    </Suspense>
  );
}
