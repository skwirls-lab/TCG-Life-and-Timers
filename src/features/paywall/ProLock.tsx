"use client";
/**
 * `<ProLock feature>`: renders its children normally when the feature is available; otherwise
 * shows them inert with a LockBadge, and a tap anywhere opens the paywall (PAY-004).
 */
import type { ReactNode } from "react";
import { LockBadge } from "@/components/ui";
import { useProGate } from "@/lib/entitlements/gate";
import type { ProFeature } from "@/lib/entitlements/features";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/ui/cn";

export function ProLock({
  feature,
  children,
  className,
  testId,
}: {
  feature: ProFeature;
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  const { allowed, open } = useProGate(feature);
  if (allowed) return <>{children}</>;
  return (
    <div className={cn("relative", className)} data-testid={testId} data-locked="1">
      <div inert className="opacity-60">
        {children}
      </div>
      <button
        type="button"
        onClick={open}
        aria-label={`${t("common.proFeature")}: ${t(`pay.feature.${feature}`)}`}
        className="absolute inset-0 flex items-start justify-end rounded-xl p-1 focus-visible:outline-2 focus-visible:outline-accent"
        data-testid={testId ? `${testId}-lock` : undefined}
      >
        <LockBadge />
      </button>
    </div>
  );
}
