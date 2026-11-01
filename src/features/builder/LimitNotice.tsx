"use client";
/** Free-tier custom preset limit (§17.2): Pro lock badge + paywall placeholder (T7.1 wires it). */
import { LockBadge } from "@/components/ui";
import { t } from "@/lib/i18n";

export function LimitNotice({ limit }: { limit: number }) {
  return (
    <div
      data-testid="builder-limit"
      className="mt-4 flex flex-col gap-1 rounded-2xl border border-warning/40 bg-warning/10 p-4"
    >
      <p className="flex items-center gap-2 font-semibold">
        <LockBadge />
        {t("builder.limitTitle", { limit })}
      </p>
      <p className="text-sm text-fg-muted">{t("builder.limitBody")}</p>
    </div>
  );
}
