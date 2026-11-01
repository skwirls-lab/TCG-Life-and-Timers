import type { Metadata } from "next";
import { ProScreen } from "@/features/paywall/ProScreen";
import { t } from "@/lib/i18n";

export const metadata: Metadata = { title: `${t("pay.page.title")} · ${t("app.name")}` };

/** Static page; checkout return state (`?status=`) is read on the client. */
export default function ProPage() {
  return <ProScreen />;
}
