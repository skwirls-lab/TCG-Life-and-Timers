"use client";
/**
 * Plans + "Restore purchase(s)" + "Manage subscription" (PAY-002, PAY-004). Buttons are disabled,
 * with the reason shown, when this deployment can't sell (no cloud config / no Stripe price ids)
 * or the device is offline. Guests restore by signing in; signed-in users get Restore purchases
 * (a server re-check against Stripe).
 */
import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui";
import { signInWithGoogle, useAuth } from "@/lib/auth/store";
import { rememberCheckoutPlan } from "@/lib/entitlements/purchaseTracking";
import { useEntitlements } from "@/lib/entitlements/store";
import {
  PLACEHOLDER_PRICES,
  plansToShow,
  readPlans,
  salesStatus,
  type Plan,
  type SalesStatus,
} from "@/lib/entitlements/pricing";
import { isCloudConfigured } from "@/lib/firebase/config";
import { t, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/ui/cn";
import { RestorePurchases } from "./RestorePurchases";

function subscribeOnline(cb: () => void): () => void {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

const STATUS_TEXT: Record<Exclude<SalesStatus, "ready">, MessageKey> = {
  cloudMissing: "pay.plans.cloudMissing",
  pricesMissing: "pay.plans.notConfigured",
};

type Busy = { kind: "idle" } | { kind: "working"; text: string } | { kind: "error"; text: string };

export function PurchasePanel({ testId = "paywall" }: { testId?: string }) {
  const online = useOnline();
  const cloud = isCloudConfigured();
  const plans = plansToShow(readPlans());
  const status = salesStatus(cloud, plans);
  const pro = useEntitlements((s) => s.pro);
  const user = useAuth((s) => s.user);
  const [busy, setBusy] = useState<Busy>({ kind: "idle" });
  const signedIn = !!user && !user.isAnonymous;

  const buy = async (plan: Plan) => {
    if (!plan.priceId) return;
    setBusy({ kind: "working", text: t("pay.checkout.redirecting") });
    rememberCheckoutPlan(plan.id); // §19.5 purchase attribution on the success return
    const { startCheckout } = await import("@/lib/entitlements/checkout");
    const res = await startCheckout(plan.priceId);
    if (res.status === "redirected") return;
    if (res.status === "alreadyPro") {
      if (res.portal.status === "redirected") return;
      setBusy({ kind: "error", text: t("pay.checkout.alreadyPro") });
    } else if (res.status === "needsSignIn")
      setBusy({ kind: "error", text: t("pay.checkout.signInFirst") });
    else setBusy({ kind: "error", text: t("pay.checkout.error", { error: res.error }) });
  };

  const manage = async () => {
    setBusy({ kind: "working", text: t("pay.manage.opening") });
    const { openPortal } = await import("@/lib/entitlements/checkout");
    const res = await openPortal();
    if (res.status === "noCustomer") setBusy({ kind: "error", text: t("pay.manage.noCustomer") });
    else if (res.status === "unavailable")
      setBusy({ kind: "error", text: t("pay.manage.unavailable") });
  };

  const blockedText =
    status !== "ready" ? t(STATUS_TEXT[status]) : !online ? t("pay.plans.offline") : null;

  return (
    <section className="flex flex-col gap-3" aria-label={t("pay.plans.title")}>
      <h3 className="text-lg font-semibold">{t("pay.plans.title")}</h3>
      {blockedText && (
        <p
          className="rounded-2xl bg-surface-2 p-3 text-sm text-fg-muted"
          data-testid={`${testId}-not-configured`}
          data-reason={status !== "ready" ? status : "offline"}
        >
          {blockedText}
        </p>
      )}
      <div
        className={cn(
          "grid grid-cols-1 gap-2",
          plans.length >= 3 ? "sm:grid-cols-3" : "sm:grid-cols-2",
        )}
      >
        {plans.map((plan) => {
          const name = t(`pay.plan.${plan.id}`);
          return (
            <div
              key={plan.id}
              className="flex flex-col gap-2 rounded-2xl bg-surface-2 p-3"
              data-testid={`${testId}-plan-${plan.id}`}
            >
              <span className="font-semibold">{name}</span>
              <span className="text-xl tabular">
                {t(`pay.plan.${plan.id}.per`, { price: plan.display })}
              </span>
              <Button
                variant="primary"
                disabled={!plan.priceId || status !== "ready" || !online || busy.kind === "working"}
                onClick={() => void buy(plan)}
                data-testid={`${testId}-buy-${plan.id}`}
              >
                {t("pay.plan.choose", { plan: name })}
              </Button>
            </div>
          );
        })}
      </div>
      {plans.some((p) => p.display === PLACEHOLDER_PRICES[p.id]) && (
        <p className="text-xs text-fg-muted">{t("pay.plans.placeholder")}</p>
      )}
      {busy.kind !== "idle" && (
        <p
          role={busy.kind === "error" ? "alert" : "status"}
          className={busy.kind === "error" ? "text-sm text-danger" : "text-sm text-fg-muted"}
          data-testid={`${testId}-status-text`}
        >
          {busy.text}
        </p>
      )}
      {!signedIn && (
        <div className="flex flex-col gap-1">
          <Button
            variant="outline"
            disabled={!cloud || !online}
            onClick={() => void signInWithGoogle()}
            data-testid={`${testId}-restore`}
          >
            {t("pay.restore")}
          </Button>
          <p className="text-xs text-fg-muted">{t("pay.restore.help")}</p>
        </div>
      )}
      {signedIn && (
        <RestorePurchases testId={`${testId}-restore-purchases`} disabled={!online || !cloud} />
      )}
      {signedIn && pro && (
        <Button
          variant="outline"
          disabled={!online}
          onClick={() => void manage()}
          data-testid={`${testId}-manage`}
        >
          {t("pay.manage")}
        </Button>
      )}
    </section>
  );
}
