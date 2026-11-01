"use client";
/** The paywall sheet (T7.1, PAY-004): "This is a Pro feature", Free vs Pro, plans, restore. */
import { useRouter } from "next/navigation";
import { Button, LockBadge, Sheet } from "@/components/ui";
import { afterOverlayClose } from "@/features/settings/afterOverlayClose";
import type { ProFeature } from "@/lib/entitlements/features";
import { useEntitlements } from "@/lib/entitlements/store";
import { t } from "@/lib/i18n";
import { ComparisonTable } from "./ComparisonTable";
import { PurchasePanel } from "./PurchasePanel";

export interface PaywallSheetProps {
  open: boolean;
  feature: ProFeature | null;
  onClose: () => void;
}

export default function PaywallSheet({ open, feature, onClose }: PaywallSheetProps) {
  const pro = useEntitlements((s) => s.pro);
  const router = useRouter();
  const seeAll = () => {
    onClose();
    // Navigate after the sheet popped its Back-button history entry (useBackClose).
    afterOverlayClose(() => router.push("/pro"));
  };
  return (
    <Sheet open={open} onClose={onClose} title={t("pay.sheet.title")} testId="paywall">
      <div className="flex flex-col gap-4" data-feature={feature ?? ""}>
        {feature && (
          <div className="flex flex-col gap-1 rounded-2xl border border-warning/40 bg-warning/10 p-3">
            <p className="flex items-center gap-2 font-semibold" data-testid="paywall-locked">
              <LockBadge />
              {t("pay.sheet.locked")}
            </p>
            <p data-testid="paywall-feature">{t(`pay.feature.${feature}`)}</p>
          </div>
        )}
        {pro ? (
          <p className="text-success" data-testid="paywall-is-pro">
            {t("pay.sheet.isPro")}
          </p>
        ) : (
          <p className="text-fg-muted">{t("pay.sheet.intro")}</p>
        )}
        <ComparisonTable feature={feature} />
        <PurchasePanel testId="paywall" />
        <Button variant="ghost" onClick={seeAll} data-testid="paywall-see-all">
          {t("pay.sheet.seeAll")}
        </Button>
      </div>
    </Sheet>
  );
}
