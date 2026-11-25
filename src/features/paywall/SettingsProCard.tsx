"use client";
/**
 * "TCGTempo Pro" at the top of Settings, with the account's status: "Upgrade" (paywall on) or
 * "Go Pro" (paywall off: framed as support, nothing is locked) for free users; "Pro · Manage
 * subscription" with the plan for Pro users. The card opens /pro; for a Pro subscription a
 * separate Manage button opens the billing portal directly. (The "Support this app" row at the
 * bottom of Settings stays.)
 */
import { BadgeCheck, ChevronRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { t } from "@/lib/i18n";
import { tPro } from "@/lib/i18n/pro";
import { cn } from "@/lib/ui/cn";
import { planName, renewalLine, useManageSubscription, useProStatus } from "./useProStatus";

export function SettingsProCard() {
  const { pro, policy, details, known } = useProStatus();
  const manage = useManageSubscription();
  const subscription = pro && details?.plan !== "lifetime" && details?.plan !== "manual";
  const support = policy === "ALL_FREE";
  // Pro: "Pro · Monthly" + "Renews on …" (an older doc without a plan: "Pro · Manage subscription")
  const renewal = pro ? renewalLine(details) : null;
  const subtitle = !known
    ? null
    : pro
      ? details?.plan
        ? tPro("pro.settings.pro", { plan: planName(details) })
        : tPro("pro.settings.proManage")
      : support
        ? tPro("pro.settings.support")
        : tPro("pro.settings.upgrade");
  const action = !known
    ? null
    : pro
      ? null
      : support
        ? tPro("pro.settings.action.support")
        : tPro("pro.settings.action.upgrade");

  return (
    <div className="mt-4 flex flex-col gap-1">
      <div
        className={cn(
          "flex items-center gap-2 rounded-2xl p-3 ring-1",
          pro
            ? "bg-surface ring-accent/40"
            : "bg-gradient-to-br from-accent/20 to-accent/5 ring-accent/40",
        )}
        data-testid="settings-pro-card"
        data-pro={pro ? "1" : "0"}
        data-policy={policy}
      >
        <Link
          href="/pro"
          className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-xl focus-visible:outline-2 focus-visible:outline-accent"
          data-testid="settings-pro-link"
        >
          <span
            aria-hidden
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg"
          >
            {pro ? <BadgeCheck size={22} /> : <Sparkles size={20} />}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-lg font-semibold leading-tight">{tPro("pro.name")}</span>
            {subtitle && (
              <span
                className="text-sm leading-snug text-fg-muted"
                data-testid="settings-pro-status"
              >
                {subtitle}
              </span>
            )}
            {renewal && (
              <span
                className={cn(
                  "text-sm leading-snug",
                  details?.cancelAtPeriodEnd ? "text-warning" : "text-fg-muted",
                )}
                data-testid="settings-pro-renewal"
              >
                {renewal}
              </span>
            )}
          </span>
          {action ? (
            <span className="shrink-0 rounded-full bg-accent px-3 py-1.5 text-sm font-semibold text-accent-fg">
              {action}
            </span>
          ) : (
            !subscription && <ChevronRight aria-hidden className="shrink-0 text-fg-muted" />
          )}
        </Link>
        {subscription && (
          <button
            type="button"
            onClick={() => void manage.open()}
            disabled={manage.disabled}
            aria-label={t("pay.manage")}
            className="min-h-11 shrink-0 rounded-full px-3 text-sm font-semibold text-accent ring-1 ring-accent/50 hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
            data-testid="settings-pro-manage"
          >
            {tPro("pro.settings.action.manage")}
          </button>
        )}
      </div>
      {manage.state.kind === "error" && (
        <p
          role="alert"
          className="px-1 text-sm text-danger"
          data-testid="settings-pro-manage-error"
        >
          {manage.state.reason === "noCustomer"
            ? t("pay.manage.noCustomer")
            : t("pay.manage.unavailable")}
        </p>
      )}
    </div>
  );
}
