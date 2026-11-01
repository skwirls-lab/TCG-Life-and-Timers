import type { Metadata } from "next";
import { PresetEditor } from "@/features/builder/PresetEditor";
import { t } from "@/lib/i18n";

export const metadata: Metadata = { title: t("builder.editor.editTitle") };

/** The preset id comes from `?id=` and is read on the client (static, offline-friendly page). */
export default function BuilderEditPage() {
  return <PresetEditor />;
}
