import Link from "next/link";
import { AppMark } from "@/components/brand/AppMark";
import { t } from "@/lib/i18n";

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-8 text-center">
      <AppMark size={72} />
      <p className="text-lg font-semibold">{t("app.name")}</p>
      <h1 className="text-2xl font-semibold">{t("brand.offline.title")}</h1>
      <p className="text-fg-muted">{t("brand.offline.body")}</p>
      <Link
        href="/"
        prefetch={false}
        className="inline-flex min-h-12 items-center rounded-xl px-4 font-medium text-accent underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-accent"
      >
        {t("brand.offline.home")}
      </Link>
    </main>
  );
}
