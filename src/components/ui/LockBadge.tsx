import { Lock } from "lucide-react";
import { t } from "@/lib/i18n";

export function LockBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-xs text-warning"
      aria-label={t("common.proFeature")}
    >
      <Lock size={12} aria-hidden /> Pro
    </span>
  );
}
