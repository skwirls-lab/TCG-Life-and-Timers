import { FREE_LIMITS, PRO_LIMITS, type ProFeature } from "./features";

export type Policy = "ALL_FREE" | "TIERED";

export interface EntitlementState {
  policy: Policy;
  pro: boolean;
}

/** Default policy: everything free until the paywall is enabled by env (T7.1). */
// Next.js inlines only literal `process.env.NEXT_PUBLIC_*` reads in client bundles (D-050).
export function defaultPolicy(
  env: Record<string, string | undefined> = {
    NEXT_PUBLIC_PAYWALL_ENABLED: process.env.NEXT_PUBLIC_PAYWALL_ENABLED,
  },
): Policy {
  return env.NEXT_PUBLIC_PAYWALL_ENABLED === "1" ? "TIERED" : "ALL_FREE";
}

export function can(state: EntitlementState, _feature: ProFeature): boolean {
  if (state.policy === "ALL_FREE") return true;
  return state.pro;
}

export function limit(state: EntitlementState, key: keyof typeof FREE_LIMITS): number {
  if (state.policy === "ALL_FREE" || state.pro) {
    if (key === "cloudArtImages") return PRO_LIMITS.cloudArtImages;
    return Number.POSITIVE_INFINITY;
  }
  return FREE_LIMITS[key];
}
