"use client";
/**
 * /pro (T7.4, PAY-002, PAY-004): status, Free vs Pro table, plans, restore / manage, and the
 * Stripe Checkout return states (`?checkout=success&session_id=…` | `?checkout=cancel`, read on
 * the client after mount; see CheckoutReturn). A Pro account sees "You're Pro" (./ProState)
 * instead of the plans.
 *
 * The return query is dropped once read (`router.replace("/pro")`, recorded by the Back trail as
 * a replace), so a reload doesn't replay it; the banner stays for this visit.
 */
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { PageShell } from "@/components/ui";
import { useQueryParam } from "@/features/tools/hooks";
import { useEntitlements } from "@/lib/entitlements/store";
import { useEntitlementSync } from "@/lib/entitlements/sync";
import { t } from "@/lib/i18n";
import { replaceRoute } from "@/lib/nav/useUpNavigation";
import { CheckoutReturn, type CheckoutReturnKind } from "./CheckoutReturn";
import { ComparisonTable } from "./ComparisonTable";
import { PurchasePanel } from "./PurchasePanel";

export function ProScreen() {
  useEntitlementSync();
  const router = useRouter();
  const policy = useEntitlements((s) => s.policy);
  const pro = useEntitlements((s) => s.pro);
  // Read once after mount (useQueryParam doesn't follow later URL changes), so the banner stays
  // after the query is dropped below.
  const checkout = useQueryParam("checkout");
  const ret: CheckoutReturnKind | null =
    checkout === "success" || checkout === "cancel" ? checkout : null;

  const stripped = useRef(false);
  useEffect(() => {
    if (!ret || stripped.current) return;
    stripped.current = true;
    const params = new URLSearchParams(window.location.search);
    for (const k of ["checkout", "session_id"]) params.delete(k);
    const rest = params.toString();
    replaceRoute(router, rest ? `/pro?${rest}` : "/pro");
  }, [ret, router]);

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
        <p
          data-testid="pro-status"
          data-pro={pro ? "1" : "0"}
          data-policy={policy}
          className={pro ? "sr-only" : undefined}
        >
          {statusText}
        </p>
        {!pro && <p className="text-fg-muted">{t("pay.sheet.intro")}</p>}
        {!pro && <ComparisonTable />}
        <PurchasePanel testId="pro" />
        <p className="text-xs text-fg-muted">{t("pay.page.legal")}</p>
      </div>
    </PageShell>
  );
}
