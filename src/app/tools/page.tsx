import type { Metadata } from "next";
import { ToolsPage } from "@/features/tools/ToolsPage";
import { t } from "@/lib/i18n";

export const metadata: Metadata = { title: t("tools.title") };

export default function Page() {
  return <ToolsPage />;
}
