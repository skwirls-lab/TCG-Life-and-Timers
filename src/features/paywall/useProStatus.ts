"use client";
/**
 * The Pro status every entry point shows: is this user actually subscribed (`pro`, the server
 * entitlement, not `can(...)`), the policy (ALL_FREE while the paywall is off, so the copy says
 * "Support TCGTempo" and never claims a feature is locked), and the plan details.
 */
import { useState } from "react";
import { useProDetails, type ProDetails } from "@/lib/entitlements/details";
import type { Policy } from "@/lib/entitlements/policy";
import { useEntitlements } from "@/lib/entitlements/store";
import { isCloudConfigured } from "@/lib/firebase/config";
import { tPro, proDate } from "@/lib/i18n/pro";

export interface ProStatus {
  pro: boolean;
  policy: Policy;
  details: ProDetails | null;
  /** false while start-up sync hasn't decided yet (don't offer "Go Pro" to a Pro user) */
  known: boolean;
}

export function useProStatus(): ProStatus {
  const pro = useEntitlements((s) => s.pro);
  const policy = useEntitlements((s) => s.policy);
  const details = useProDetails((s) => s.details);
  const synced = useProDetails((s) => s.known);
  return { pro, policy, details, known: pro || synced || !isCloudConfigured() };
}

/** "Monthly" / "Yearly" / "Lifetime" / "Gift", or "Pro" for an older doc without a plan. */
export function planName(details: ProDetails | null): string {
  return details?.plan ? tPro(`pro.plan.${details.plan}`) : tPro("pro.plan.unknown");
}

/** "Renews on …" / "Cancels on …" / "Never expires" / null (no date known). */
export function renewalLine(details: ProDetails | null): string | null {
  if (!details) return null;
  if (details.plan === "lifetime") return tPro("pro.state.lifetime");
  if (details.plan === "manual") return tPro("pro.state.manual");
  if (details.currentPeriodEnd === null) return null;
  const date = proDate(details.currentPeriodEnd);
  return details.cancelAtPeriodEnd
    ? tPro("pro.state.cancels", { date })
    : tPro("pro.state.renews", { date });
}

export type ManageState =
  { kind: "idle" } | { kind: "working" } | { kind: "error"; reason: "noCustomer" | "unavailable" };

/** "Manage subscription": the Stripe Billing Portal (lazy-loads the checkout module). */
export function useManageSubscription(): { state: ManageState; open: () => Promise<void> } {
  const [state, setState] = useState<ManageState>({ kind: "idle" });
  const open = async () => {
    setState({ kind: "working" });
    const { openPortal } = await import("@/lib/entitlements/checkout");
    const res = await openPortal();
    if (res.status === "noCustomer" || res.status === "unavailable")
      setState({ kind: "error", reason: res.status });
  };
  return { state, open };
}
