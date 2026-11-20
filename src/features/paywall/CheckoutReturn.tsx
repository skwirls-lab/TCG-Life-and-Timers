"use client";
/**
 * /pro?checkout=success|cancel (PAY-002): the Stripe Checkout return. Success shows "activating"
 * until the entitlement listener reports Pro (lib/entitlements/activation.ts), or after ~20 s a
 * "taking longer than usual" note with Restore purchases. Cancel shows a gentle note.
 */
import { useEffect, useState } from "react";
import { trackPurchaseReturn } from "@/lib/entitlements/purchaseTracking";
import type { ActivationState } from "@/lib/entitlements/activation";
import { t } from "@/lib/i18n";
import { RestorePurchases } from "./RestorePurchases";

export type CheckoutReturnKind = "success" | "cancel";

export function CheckoutReturn({ kind }: { kind: CheckoutReturnKind }) {
  const [state, setState] = useState<ActivationState>("activating");

  useEffect(() => {
    if (kind !== "success") return;
    trackPurchaseReturn(); // LEG-004: no-op without config + consent
    let stop: (() => void) | null = null;
    let cancelled = false;
    void import("@/lib/entitlements/activation").then((m) => {
      if (!cancelled) stop = m.watchActivation(setState);
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [kind]);

  if (kind === "cancel")
    return (
      <p
        role="status"
        data-testid="pro-return-cancel"
        className="rounded-2xl bg-surface-2 p-3 text-fg"
      >
        {t("pay.page.cancel")}
      </p>
    );

  return (
    <div
      role="status"
      data-testid="pro-return-success"
      data-state={state}
      className={
        state === "slow"
          ? "flex flex-col gap-2 rounded-2xl bg-surface-2 p-3 text-fg"
          : "rounded-2xl bg-success/15 p-3 text-fg"
      }
    >
      <p>
        {state === "active"
          ? t("pay.page.activated")
          : state === "slow"
            ? t("pay.page.slow")
            : t("pay.page.activating")}
      </p>
      {state === "slow" && <RestorePurchases testId="pro-return-restore" />}
    </div>
  );
}
