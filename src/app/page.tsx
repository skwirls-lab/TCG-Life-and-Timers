import { t } from "@/lib/i18n";

export default function Home() {
  return (
    <main
      className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center"
      data-testid="launcher"
    >
      <h1 className="text-3xl font-semibold">{t("app.name")}</h1>
      <p className="text-fg-muted">{t("app.tagline")}</p>
      <p className="text-fg-subtle">{t("launcher.comingSoon")}</p>
    </main>
  );
}
