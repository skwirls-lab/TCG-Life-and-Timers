"use client";
/**
 * "You're Pro" (PAY-002, PAY-004): shown by /pro and the paywall sheet instead of the plans when
 * the account is Pro. Plan, renewal / end date (or "Cancels on …"), what's included, Manage
 * subscription (the Stripe Billing Portal) and Restore purchases. No purchase buttons.
 * An older entitlement doc without the plan fields shows "Pro" without dates.
 */
import { BadgeCheck, Check } from "lucide-react";
import { Button } from "@/components/ui";
import { PRO_FEATURES } from "@/lib/entitlements/features";
import { isCloudConfigured } from "@/lib/firebase/config";
import { t } from "@/lib/i18n";
import { tPro } from "@/lib/i18n/pro";
import { useOnline } from "./useOnline";
import { RestorePurchases } from "./RestorePurchases";
import { planName, renewalLine, useManageSubscription, useProStatus } from "./useProStatus";

/** The Pro features to list (the store-facing ones; history sub-features are grouped). */
const INCLUDED = PRO_FEATURES.filter(
  (f) => f !== "historyFiltersAll" && f !== "historyDecks" && f !== "historyPlayerDetail",
);

export function ProState({ testId }: { testId: string }) {
  const { policy, details } = useProStatus();
  const online = useOnline();
  const cloud = isCloudConfigured();
  const manage = useManageSubscription();
  const renewal = renewalLine(details);
  const subscription = details?.plan !== "lifetime" && details?.plan !== "manual";

  return (
    <section
      className="flex flex-col gap-4"
      aria-labelledby={`${testId}-pro-title`}
      data-testid={`${testId}-pro-state`}
      data-plan={details?.plan ?? ""}
    >
      <div className="flex flex-col gap-3 rounded-3xl bg-accent/10 p-4 ring-1 ring-accent/40">
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg">
            <BadgeCheck aria-hidden size={24} />
          </span>
          <div className="flex min-w-0 flex-col">
            <h3 id={`${testId}-pro-title`} className="text-xl font-semibold">
              {tPro("pro.state.title")}
            </h3>
            <p className="text-sm text-fg-muted">{tPro("pro.state.thanks")}</p>
          </div>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt className="text-fg-muted">{tPro("pro.state.plan")}</dt>
          <dd className="font-semibold" data-testid={`${testId}-pro-plan`}>
            {planName(details)}
          </dd>
        </dl>
        {renewal && (
          <p
            className={details?.cancelAtPeriodEnd ? "font-medium text-warning" : "text-fg"}
            data-testid={`${testId}-pro-renewal`}
            data-cancels={details?.cancelAtPeriodEnd ? "1" : "0"}
          >
            {renewal}
          </p>
        )}
        {details?.cancelAtPeriodEnd && (
          <p className="text-sm text-fg-muted">{tPro("pro.state.cancelsHint")}</p>
        )}
        {policy === "ALL_FREE" && (
          <p className="text-sm text-fg-muted">{tPro("pro.state.allFree")}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {subscription && (
          <Button
            variant="primary"
            disabled={!cloud || !online || manage.state.kind === "working"}
            onClick={() => void manage.open()}
            data-testid={`${testId}-manage`}
          >
            {manage.state.kind === "working" ? t("pay.manage.opening") : t("pay.manage")}
          </Button>
        )}
        {manage.state.kind === "error" && (
          <p role="alert" className="text-sm text-danger" data-testid={`${testId}-manage-error`}>
            {manage.state.reason === "noCustomer"
              ? t("pay.manage.noCustomer")
              : t("pay.manage.unavailable")}
          </p>
        )}
        <RestorePurchases testId={`${testId}-restore-purchases`} disabled={!online || !cloud} />
      </div>

      <div className="flex flex-col gap-2">
        <h4 className="text-lg font-semibold">{tPro("pro.state.included")}</h4>
        <ul className="flex flex-col gap-1.5" data-testid={`${testId}-pro-included`}>
          {INCLUDED.map((f) => (
            <li key={f} className="flex items-start gap-2">
              <Check aria-hidden size={18} className="mt-0.5 shrink-0 text-success" />
              <span>{t(`pay.feature.${f}`)}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
