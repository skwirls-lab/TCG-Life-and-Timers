"use client";
/**
 * /pro (T7.4, PAY-002, PAY-004): status, Free vs Pro table, plans, restore / manage, and the
 * Stripe Checkout return states (`?checkout=success&session_id=…` | `?checkout=cancel`, read on
 * the client after mount; see CheckoutReturn).
 */
import { PageShell } from "@/components/ui";
import { useQueryParam } from "@/features/tools/hooks";
import { useEntitlements } from "@/lib/entitlements/store";
import { useEntitlementSync } from "@/lib/entitlements/sync";
import { t } from "@/lib/i18n";
import { CheckoutReturn, type CheckoutReturnKind } from "./CheckoutReturn";
import { ComparisonTable } from "./ComparisonTable";
import { PurchasePanel } from "./PurchasePanel";

export function ProScreen() {
  useEntitlementSync();
  const policy = useEntitlements((s) => s.policy);
  const pro = useEntitlements((s) => s.pro);
  const checkout = useQueryParam("checkout");
  const ret: CheckoutReturnKind | null =
    checkout === "success" || checkout === "cancel" ? checkout : null;

  const statusText =
    policy === "ALL_FREE"
      ? t("pay.page.status.allFree")
      : pro
        ? t("pay.page.status.pro")
        : t("pay.page.status.free");

  return (
    <PageShell title={t("pay.page.title")} testId="pro-page">
      <div className="flex flex-col gap-4 pt-4">
        {ret && <CheckoutReturn kind={ret} />}
        <p data-testid="pro-status" data-pro={pro ? "1" : "0"} data-policy={policy}>
          {statusText}
        </p>
        <p className="text-fg-muted">{t("pay.sheet.intro")}</p>
        <ComparisonTable />
        <PurchasePanel testId="pro" />
        <p className="text-xs text-fg-muted">{t("pay.page.legal")}</p>
      </div>
    </PageShell>
  );
}
