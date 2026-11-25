"use client";
/**
 * What the user's Pro is (plan, renewal / end date), for the "You're Pro" displays (/pro, the
 * paywall sheet, Settings, Account). Read from the optional fields of the server entitlements doc
 * (functions/src/logic/syncEntitlements.ts); an older doc without them still reads as Pro, just
 * without a plan or dates.
 *
 * Kept apart from ./store.ts so /play's first load (which carries the `pro` store) doesn't carry
 * this (PERF-003); ./sync.ts writes it next to `pro`.
 */
import { create } from "zustand";

export type ProPlan = "monthly" | "yearly" | "lifetime" | "manual";

export interface ProDetails {
  /** null when the doc predates the plan field (or the plan is unknown) */
  plan: ProPlan | null;
  /** epoch ms: renews on, or (with cancelAtPeriodEnd) ends on */
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: boolean;
  /** "subscription" | "lifetime" | "manual" | "none" (unknown values read as "none") */
  source: string;
}

const PLANS: readonly string[] = ["monthly", "yearly", "lifetime", "manual"];

/** epoch ms from a number (ms) or a Firestore Timestamp-like value; else null. */
function millis(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? v : null;
  if (v && typeof v === "object") {
    const o = v as { toMillis?: unknown; seconds?: unknown };
    if (typeof o.toMillis === "function") return millis((o.toMillis as () => unknown).call(v));
    if (typeof o.seconds === "number") return millis(o.seconds * 1000);
  }
  return null;
}

/** Pure: the display details of an entitlement doc, or null when it doesn't grant Pro. */
export function detailsFromDoc(
  data: Record<string, unknown> | null | undefined,
): ProDetails | null {
  if (data?.pro !== true) return null;
  const source = typeof data.source === "string" ? data.source : "none";
  const plan =
    typeof data.plan === "string" && PLANS.includes(data.plan)
      ? (data.plan as ProPlan)
      : source === "manual" || source === "lifetime"
        ? source
        : null;
  return {
    plan,
    currentPeriodEnd:
      plan === "lifetime" || plan === "manual" ? null : millis(data.currentPeriodEnd),
    cancelAtPeriodEnd: data.cancelAtPeriodEnd === true,
    source,
  };
}

/** Cache round-trip (./cache.ts): anything malformed reads as "no details". */
export function parseDetails(v: unknown): ProDetails | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  return detailsFromDoc({ ...o, pro: true });
}

interface DetailsStore {
  details: ProDetails | null;
  /**
   * true once entitlement sync has decided this session (from the cache or the server), so a
   * Pro user isn't shown "Go Pro" during start-up. Builds without cloud config never sync.
   */
  known: boolean;
  setDetails: (details: ProDetails | null) => void;
}

export const useProDetails = create<DetailsStore>((set) => ({
  details: null,
  known: false,
  setDetails: (details) => set({ details, known: true }),
}));

declare global {
  interface Window {
    __tcgProDetails?: typeof useProDetails;
  }
}
// TEST_HOOKS builds: e2e sets the details (the test build has no cloud to sync them from).
if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_TEST_HOOKS === "1")
  window.__tcgProDetails = useProDetails;
