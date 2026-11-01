import type { Metadata } from "next";
import { ScratchCountersPage } from "@/features/tools/ScratchCountersPage";
import { t } from "@/lib/i18n";

export const metadata: Metadata = { title: t("tools.counters.title") };

export default function Page() {
  return <ScratchCountersPage />;
}
