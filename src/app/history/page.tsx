import type { Metadata } from "next";
import { HistoryPage } from "@/features/history-current/HistoryPage";
import { t } from "@/lib/i18n";

export const metadata: Metadata = { title: t("history.title") };

export default function Page() {
  return <HistoryPage />;
}
