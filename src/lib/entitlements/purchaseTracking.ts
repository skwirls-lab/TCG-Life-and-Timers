/**
 * §19.5 `purchase` event (LEG-004). The plan is remembered in sessionStorage when Checkout starts
 * (the Stripe round trip returns to the same tab) and consumed on the `/pro?status=success`
 * return, so a refresh of the success page never counts the purchase twice. `track()` drops the
 * event unless analytics is configured and the user consented.
 */
import { track } from "@/lib/analytics/telemetry";
import { PLAN_IDS, type PlanId } from "./pricing";

export const CHECKOUT_PLAN_KEY = "tcg.checkout.plan";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function session(): StorageLike | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null; // storage disabled
  }
}

export function rememberCheckoutPlan(plan: PlanId, storage = session()): void {
  try {
    storage?.setItem(CHECKOUT_PLAN_KEY, plan);
  } catch {
    // quota / privacy mode: the purchase just isn't attributed
  }
}

/** Call once on a checkout success return. Returns the plan that was tracked (or null). */
export function trackPurchaseReturn(storage = session()): PlanId | null {
  let plan: string | null = null;
  try {
    plan = storage?.getItem(CHECKOUT_PLAN_KEY) ?? null;
    storage?.removeItem(CHECKOUT_PLAN_KEY);
  } catch {
    return null;
  }
  if (!plan || !(PLAN_IDS as readonly string[]).includes(plan)) return null;
  track("purchase", { plan });
  return plan as PlanId;
}
