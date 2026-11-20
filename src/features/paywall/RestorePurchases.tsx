"use client";
/**
 * "Restore purchases" for a signed-in account (PAY-004): asks the server to re-read the purchase
 * from Stripe (`refreshEntitlements`); the entitlement listener then flips Pro on this device.
 * Hidden for guests (they restore by signing in, PurchasePanel).
 */
import { useState } from "react";
import { Button } from "@/components/ui";
import { useAuth } from "@/lib/auth/store";
import { isCloudConfigured } from "@/lib/firebase/config";
import { t, type MessageKey } from "@/lib/i18n";

type State =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "done"; key: MessageKey; error?: string; alert?: boolean };

export function RestorePurchases({
  testId,
  disabled = false,
}: {
  testId: string;
  disabled?: boolean;
}) {
  const user = useAuth((s) => s.user);
  const [state, setState] = useState<State>({ kind: "idle" });
  if (!isCloudConfigured() || !user || user.isAnonymous) return null;

  const run = async () => {
    setState({ kind: "working" });
    const { restorePurchases } = await import("@/lib/entitlements/checkout");
    const r = await restorePurchases();
    if (r.status === "ok")
      setState({
        kind: "done",
        key: r.pro ? "pay.restorePurchases.pro" : "pay.restorePurchases.none",
      });
    else if (r.status === "rateLimited")
      setState({ kind: "done", key: "pay.restorePurchases.rateLimited" });
    else if (r.status === "needsSignIn")
      setState({ kind: "done", key: "pay.checkout.signInFirst", alert: true });
    else setState({ kind: "done", key: "pay.restorePurchases.error", error: r.error, alert: true });
  };

  return (
    <div className="flex flex-col gap-1">
      <Button
        variant="outline"
        disabled={disabled || state.kind === "working"}
        onClick={() => void run()}
        data-testid={testId}
      >
        {state.kind === "working" ? t("pay.restorePurchases.working") : t("pay.restorePurchases")}
      </Button>
      {state.kind === "done" && (
        <p
          role={state.alert ? "alert" : "status"}
          className={state.alert ? "text-sm text-danger" : "text-sm text-fg-muted"}
          data-testid={`${testId}-result`}
        >
          {t(state.key, { error: state.error ?? "" })}
        </p>
      )}
    </div>
  );
}
