"use client";
/**
 * Gating helpers (T7.1, PAY-004). UI never checks tiers directly: it asks `useProGate(feature)`
 * (React) or `requirePro(feature)` / `requireLimit(key, count, feature)` (event handlers and async
 * save paths). A denied check opens the paywall sheet with the tapped feature highlighted.
 */
import { useCallback } from "react";
import type { FREE_LIMITS, ProFeature } from "./features";
import { openPaywall } from "./paywall";
import { can, limit } from "./policy";
import { useEntitlements } from "./store";

export interface ProGate {
  allowed: boolean;
  /** Open the paywall for this feature. */
  open: () => void;
}

export function useProGate(feature: ProFeature): ProGate {
  const allowed = useEntitlements((s) => can(s, feature));
  const open = useCallback(() => openPaywall(feature), [feature]);
  return { allowed, open };
}

/** True when `feature` is available; otherwise opens the paywall and returns false. */
export function requirePro(feature: ProFeature): boolean {
  if (can(useEntitlements.getState(), feature)) return true;
  openPaywall(feature);
  return false;
}

/**
 * True when one more item fits under the free limit `key` (`count` = items that exist now);
 * otherwise opens the paywall for `feature` and returns false.
 */
export function requireLimit(
  key: keyof typeof FREE_LIMITS,
  count: number,
  feature: ProFeature,
): boolean {
  if (count < limit(useEntitlements.getState(), key)) return true;
  openPaywall(feature);
  return false;
}
