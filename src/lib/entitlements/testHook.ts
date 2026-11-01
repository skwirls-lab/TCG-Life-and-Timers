"use client";
/**
 * Test-only paywall hook (TEST_HOOKS builds only; production builds compile it to a no-op):
 *   pw=1    policy TIERED (free user) — the paywall is "enabled" without the env flag
 *   pw=pro  policy TIERED + Pro
 *   pw=0    back to the build default
 * The choice is kept in sessionStorage so later navigations and reloads in the same tab keep it.
 * Also exposes `window.__tcgPay.state()` for e2e assertions.
 */
import { defaultPolicy } from "./policy";
import { useEntitlements } from "./store";

const KEY = "tcg.test.pw";

declare global {
  interface Window {
    __tcgPay?: { state: typeof useEntitlements.getState };
  }
}

export type PwMode = "1" | "pro" | "0";

export function parsePw(v: string | null | undefined): PwMode | null {
  return v === "1" || v === "pro" || v === "0" ? v : null;
}

/** Apply a pw mode to the entitlement store (pure enough to unit-test). */
export function applyPwMode(mode: PwMode): void {
  const s = useEntitlements.getState();
  if (mode === "0") {
    s.setPolicy(defaultPolicy());
    s.setPro(false);
    return;
  }
  s.setPolicy("TIERED");
  if (mode === "pro") s.setPro(true);
}

/**
 * Read `pw` from the URL (or the tab's earlier choice) and apply it. Returns the mode applied.
 * `enabled` defaults to the TEST_HOOKS build flag.
 */
export function applyPaywallTestHook(
  search: URLSearchParams,
  enabled: boolean = process.env.NEXT_PUBLIC_TEST_HOOKS === "1",
): PwMode | null {
  if (!enabled || typeof window === "undefined") return null;
  window.__tcgPay = { state: useEntitlements.getState };
  let mode = parsePw(search.get("pw"));
  try {
    if (mode) window.sessionStorage.setItem(KEY, mode);
    else mode = parsePw(window.sessionStorage.getItem(KEY));
  } catch {
    // sessionStorage unavailable: URL param only
  }
  if (mode) applyPwMode(mode);
  return mode;
}
