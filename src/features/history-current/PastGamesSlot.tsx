"use client";
/**
 * Placeholder for the Past Games segment (HIST-003, HIST-020..024). The HISTORY lane replaces
 * this component in W4; keep the export name.
 */
import { History } from "lucide-react";
import { t } from "@/lib/i18n";

export function PastGamesPanel() {
  return (
    <div
      className="mt-10 flex flex-col items-center gap-3 text-center text-fg-muted"
      data-testid="past-games"
    >
      <History size={40} aria-hidden />
      <p>{t("history.pastSoon")}</p>
    </div>
  );
}
