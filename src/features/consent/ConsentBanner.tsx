"use client";
/**
 * Analytics / crash-report consent banner (LEG-004). Shown only when this deployment has telemetry
 * configured and the user has not chosen yet; never over the game board. Default: off. Also starts
 * the store observers that derive §19.5 events (they drop everything without consent).
 * Mount once in Providers: `<ConsentBanner />`.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui";
import { analyticsConfigured, telemetryConfigured, useConsent } from "@/lib/analytics";
import { t } from "@/lib/i18n";
import { useMounted } from "./useMounted";

let observing = false;

/** Event observers load lazily and only when analytics is configured (zero cost otherwise). */
function startObservers(): void {
  if (observing) return;
  observing = true;
  void Promise.all([
    import("@/lib/analytics/observers"),
    import("@/state/gameStore"),
    import("@/lib/entitlements/paywall"),
    import("@/lib/auth/store"),
  ])
    .then(([o, game, paywall, auth]) => {
      o.observeGames(game.useGameStore);
      o.observePaywall(paywall.usePaywall);
      o.observeAuth(auth.useAuth);
    })
    .catch((e: unknown) => console.warn("[analytics] observers failed", e));
}

export function ConsentBanner() {
  const choice = useConsent((s) => s.choice);
  const pathname = usePathname();
  const mounted = useMounted();

  useEffect(() => {
    useConsent.getState().hydrate();
    if (analyticsConfigured()) startObservers();
  }, []);

  const configured = mounted && telemetryConfigured();

  if (!configured || choice !== "unset" || pathname === "/play") return null;
  const set = useConsent.getState().set;
  return (
    <section
      role="region"
      aria-label={t("legal.consent.title")}
      data-testid="consent-banner"
      className="fixed inset-x-3 bottom-3 z-[60] mx-auto flex max-w-xl flex-col gap-3 rounded-2xl border border-border bg-surface-3 p-4 shadow-xl safe-area"
    >
      <h2 className="text-base font-semibold">{t("legal.consent.title")}</h2>
      <p className="text-sm">{t("legal.consent.body")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={() => set("granted")} data-testid="consent-allow">
          {t("legal.consent.allow")}
        </Button>
        <Button variant="outline" onClick={() => set("denied")} data-testid="consent-deny">
          {t("legal.consent.deny")}
        </Button>
        <Link
          href="/privacy"
          className="inline-flex min-h-12 items-center px-2 text-sm font-medium text-accent underline"
          data-testid="consent-learn-more"
        >
          {t("legal.consent.learnMore")}
        </Link>
      </div>
    </section>
  );
}
