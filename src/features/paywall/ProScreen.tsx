"use client";
/**
 * /pro (T7.4, PAY-002, PAY-004): status, Free vs Pro table, plans, restore / manage, and the
 * Stripe Checkout return states (`?status=success|cancel`, read on the client after mount).
 */
import { PageShell } from "@/components/ui";
import { useQueryParam } from "@/features/tools/hooks";
import { useEffect } from "react";
import { trackPurchaseReturn } from "@/lib/entitlements/purchaseTracking";
import { useEntitlements } from "@/lib/entitlements/store";
import { useEntitlementSync } from "@/lib/entitlements/sync";
import { t } from "@/lib/i18n";
import { ComparisonTable } from "./ComparisonTable";
import { PurchasePanel } from "./PurchasePanel";

type Return = "success" | "cancel" | null;

export function ProScreen() {
  useEntitlementSync();
  const policy = useEntitlements((s) => s.policy);
  const pro = useEntitlements((s) => s.pro);
  const status = useQueryParam("status");
  const ret: Return = status === "success" || status === "cancel" ? status : null;
  useEffect(() => {
    if (ret === "success") trackPurchaseReturn(); // LEG-004: no-op without config + consent
  }, [ret]);

  const statusText =
    policy === "ALL_FREE"
      ? t("pay.page.status.allFree")
      : pro
        ? t("pay.page.status.pro")
        : t("pay.page.status.free");

  return (
    <PageShell title={t("pay.page.title")} testId="pro-page">
      <div className="flex flex-col gap-4 pt-4">
        {ret && (
          <p
            role="status"
            data-testid={`pro-return-${ret}`}
            className={
              ret === "success"
                ? "rounded-2xl bg-success/15 p-3 text-fg"
                : "rounded-2xl bg-surface-2 p-3 text-fg"
            }
          >
            {ret === "success" ? t("pay.page.success") : t("pay.page.cancel")}
          </p>
        )}
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
