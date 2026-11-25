"use client";
/**
 * Account → "TCGTempo Pro": the plan and its renewal / end date with Manage subscription for Pro
 * users; "Free plan" with Upgrade (or, while the paywall is off, "Support TCGTempo") otherwise.
 */
import { BadgeCheck, ChevronRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { Button, SectionHeader } from "@/components/ui";
import { t } from "@/lib/i18n";
import { tPro } from "@/lib/i18n/pro";
import { planName, renewalLine, useManageSubscription, useProStatus } from "./useProStatus";

export function AccountProSection() {
  const { pro, policy, details } = useProStatus();
  const manage = useManageSubscription();
  const subscription = pro && details?.plan !== "lifetime" && details?.plan !== "manual";
  const renewal = renewalLine(details);
  const support = policy === "ALL_FREE";

  return (
    <section aria-label={tPro("pro.name")} data-testid="account-pro" data-pro={pro ? "1" : "0"}>
      <SectionHeader title={tPro("pro.name")} />
      {pro ? (
        <div className="flex flex-col gap-2">
          <Link
            href="/pro"
            className="flex min-h-16 items-center gap-3 rounded-xl py-2 hover:bg-surface/60"
            data-testid="account-pro-details"
          >
            <span className="flex size-8 items-center justify-center text-accent">
              <BadgeCheck aria-hidden size={24} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-lg leading-tight" data-testid="account-pro-plan">
                {tPro("pro.badge")} · {planName(details)}
              </span>
              <span
                className={
                  details?.cancelAtPeriodEnd ? "text-sm text-warning" : "text-sm text-fg-muted"
                }
                data-testid="account-pro-renewal"
              >
                {renewal ?? tPro("pro.account.details")}
              </span>
            </span>
            <ChevronRight aria-hidden className="text-fg-muted" />
          </Link>
          {subscription && (
            <Button
              variant="outline"
              disabled={manage.disabled}
              onClick={() => void manage.open()}
              data-testid="account-pro-manage"
            >
              {manage.state.kind === "working" ? t("pay.manage.opening") : t("pay.manage")}
            </Button>
          )}
          {manage.state.kind === "error" && (
            <p role="alert" className="text-sm text-danger" data-testid="account-pro-manage-error">
              {manage.state.reason === "noCustomer"
                ? t("pay.manage.noCustomer")
                : t("pay.manage.unavailable")}
            </p>
          )}
        </div>
      ) : (
        <Link
          href="/pro"
          className="flex min-h-16 items-center gap-3 rounded-xl py-2 hover:bg-surface/60"
          data-testid="account-pro-upgrade"
        >
          <span className="flex size-8 items-center justify-center text-accent">
            <Sparkles aria-hidden size={22} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-lg leading-tight">
              {support ? tPro("pro.account.support") : tPro("pro.account.upgrade")}
            </span>
            <span className="text-sm text-fg-muted" data-testid="account-pro-plan">
              {support ? tPro("pro.account.allFree") : tPro("pro.account.free")}
            </span>
          </span>
          <ChevronRight aria-hidden className="text-fg-muted" />
        </Link>
      )}
    </section>
  );
}
