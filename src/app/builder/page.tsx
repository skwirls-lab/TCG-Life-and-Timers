import type { Metadata } from "next";
import { BuilderList } from "@/features/builder/BuilderList";
import { t } from "@/lib/i18n";

export const metadata: Metadata = { title: t("builder.title") };

export default function BuilderPage() {
  return <BuilderList />;
}
