import type { Metadata } from "next";
import { ManaPage } from "@/features/tools/ManaPage";
import { t } from "@/lib/i18n";

export const metadata: Metadata = { title: t("tools.mana.title") };

export default function Page() {
  return <ManaPage />;
}
