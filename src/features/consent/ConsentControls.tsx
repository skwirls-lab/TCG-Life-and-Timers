"use client";
/** Consent status + change control on /privacy (LEG-004: consent can be withdrawn any time). */
import { useEffect } from "react";
import { Button } from "@/components/ui";
import { telemetryConfigured, useConsent } from "@/lib/analytics";
import { t } from "@/lib/i18n";
import { useMounted } from "./useMounted";

export function ConsentControls() {
  const choice = useConsent((s) => s.choice);
  const mounted = useMounted();
  useEffect(() => {
    useConsent.getState().hydrate();
  }, []);
  if (!mounted || choice === null) return null;
  const configured = telemetryConfigured();
  if (!configured) {
    return (
      <p className="text-sm text-fg-muted" data-testid="consent-status" data-state="unconfigured">
        {t("legal.consent.status.unconfigured")}
      </p>
    );
  }
  const set = useConsent.getState().set;
  return (
    <div className="flex flex-col gap-2" data-testid="consent-controls">
      <p className="text-sm font-medium" data-testid="consent-status" data-state={choice}>
        {t(`legal.consent.status.${choice}`)}
      </p>
      <div className="flex gap-2">
        {choice === "granted" ? (
          <Button variant="outline" onClick={() => set("denied")} data-testid="consent-withdraw">
            {t("legal.consent.withdraw")}
          </Button>
        ) : (
          <Button variant="primary" onClick={() => set("granted")} data-testid="consent-grant">
            {t("legal.consent.grant")}
          </Button>
        )}
      </div>
    </div>
  );
}
