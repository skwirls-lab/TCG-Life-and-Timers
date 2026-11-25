"use client";
/**
 * The launcher's Pro entry points: a small "Go Pro" / "Support TCGTempo" card (dismissible for
 * 14 days, remembered in localStorage) for free users, and a subtle "Pro" badge for Pro users.
 * While the paywall is off (ALL_FREE) the card frames Pro as support: nothing is locked.
 * Nothing is shown until start-up entitlement sync has decided, so a Pro user never sees "Go Pro".
 */
import { BadgeCheck, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { tPro } from "@/lib/i18n/pro";
import { useProStatus } from "./useProStatus";

export const PRO_CARD_DISMISS_KEY = "tcg.pro.cardDismissedAt";
export const PRO_CARD_SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

/** Pure: is the card still snoozed at `now`? (A bad or future value doesn't hide it forever.) */
export function cardSnoozed(raw: string | null, now: number): boolean {
  const at = raw === null ? NaN : Number(raw);
  if (!Number.isFinite(at)) return false;
  return now >= at && now - at < PRO_CARD_SNOOZE_MS;
}

function readSnoozed(): boolean {
  try {
    return cardSnoozed(localStorage.getItem(PRO_CARD_DISMISS_KEY), Date.now());
  } catch {
    return false; // storage unavailable: show it (dismissing still hides it for this visit)
  }
}

export function LauncherProCard() {
  const { pro, policy, known } = useProStatus();
  // null until mounted: the static HTML can't know local storage
  const [snoozed, setSnoozed] = useState<boolean | null>(null);
  useEffect(() => {
    const id = requestAnimationFrame(() => setSnoozed(readSnoozed()));
    return () => cancelAnimationFrame(id);
  }, []);

  if (pro || !known || snoozed !== false) return null;
  const support = policy === "ALL_FREE";
  const dismiss = () => {
    setSnoozed(true);
    try {
      localStorage.setItem(PRO_CARD_DISMISS_KEY, String(Date.now()));
    } catch {
      /* not persisted: hidden for this visit only */
    }
  };

  return (
    <aside
      className="relative flex items-center gap-3 rounded-2xl bg-gradient-to-br from-accent/20 to-accent/5 p-3 pr-12 ring-1 ring-accent/40"
      aria-label={tPro("pro.name")}
      data-testid="launcher-pro-card"
      data-policy={policy}
    >
      <span
        aria-hidden
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg"
      >
        <Sparkles size={20} />
      </span>
      <Link
        href="/pro"
        className="flex min-h-12 min-w-0 flex-1 flex-col justify-center rounded-xl after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-2 focus-visible:outline-accent"
        data-testid="launcher-pro-link"
      >
        <span className="font-semibold">
          {support ? tPro("pro.card.support.title") : tPro("pro.card.upgrade.title")}
          <span className="ml-2 text-sm font-medium text-accent">
            {support ? tPro("pro.card.cta.support") : tPro("pro.card.cta.upgrade")} ›
          </span>
        </span>
        <span className="text-sm leading-snug text-fg-muted">
          {support ? tPro("pro.card.support.body") : tPro("pro.card.upgrade.body")}
        </span>
      </Link>
      <button
        type="button"
        onClick={dismiss}
        aria-label={tPro("pro.card.dismiss")}
        title={tPro("pro.card.dismiss")}
        className="absolute right-1 top-1 z-10 flex size-11 items-center justify-center rounded-full text-fg-muted hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent"
        data-testid="launcher-pro-dismiss"
      >
        <X aria-hidden size={18} />
      </button>
    </aside>
  );
}

/** A subtle "Pro" pill for Pro users (links to their plan). */
export function LauncherProBadge() {
  const { pro } = useProStatus();
  if (!pro) return null;
  return (
    <Link
      href="/pro"
      aria-label={tPro("pro.badge.label")}
      className="inline-flex min-h-8 items-center gap-1 rounded-full bg-accent/15 px-3 text-sm font-semibold text-accent ring-1 ring-accent/40 focus-visible:outline-2 focus-visible:outline-accent"
      data-testid="launcher-pro-badge"
    >
      <BadgeCheck aria-hidden size={16} />
      {tPro("pro.badge")}
    </Link>
  );
}
