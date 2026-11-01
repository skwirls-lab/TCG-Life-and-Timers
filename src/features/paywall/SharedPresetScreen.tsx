"use client";
/**
 * /p/{code} (T7.3, CUS-007): a shared preset's summary + "Import a copy". Works signed out
 * (sharedPresets are publicly readable by code, SEC-005); the import is local (a new custom
 * preset with a fresh id), then opens it in the builder.
 */
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { GameIcon } from "@/components/icons/GameIcon";
import { Button, PageShell, SectionHeader, useSnackbar } from "@/components/ui";
import { countCustomPresets } from "@/lib/customPresets";
import { requireLimit } from "@/lib/entitlements/gate";
import { isCloudConfigured } from "@/lib/firebase/config";
import { t, tp } from "@/lib/i18n";
import type { FetchSharedResult } from "@/lib/share/share";

type View = { status: "loading" } | { status: "error"; offline: boolean } | FetchSharedResult;

export function SharedPresetScreen() {
  const params = useParams<{ code: string }>();
  const code = typeof params.code === "string" ? params.code : "";
  const router = useRouter();
  const show = useSnackbar((s) => s.show);
  const [view, setView] = useState<View>({ status: "loading" });
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    let alive = true;
    const run = async (): Promise<View> => {
      if (!isCloudConfigured()) return { status: "error", offline: false };
      const m = await import("@/lib/share/share");
      return m.fetchSharedPreset(code);
    };
    run()
      .catch((): View => ({ status: "error", offline: !navigator.onLine }))
      .then((v) => {
        if (alive) setView(v);
      });
    return () => {
      alive = false;
    };
  }, [code]);

  const doImport = async () => {
    if (view.status !== "ok" || importing) return;
    const count = await countCustomPresets().catch(() => 0);
    if (!requireLimit("customPresets", count, "customPresetsUnlimited")) return;
    setImporting(true);
    try {
      const { importShared } = await import("@/lib/share/share");
      const saved = await importShared(view.shared);
      show({ message: t("pay.shared.imported", { name: saved.name }) });
      router.push(`/builder/edit?id=${encodeURIComponent(saved.id)}`);
    } catch (e) {
      setImporting(false);
      show({ message: t("pay.shared.invalid", { error: String(e) }) });
    }
  };

  return (
    <PageShell title={t("pay.shared.title")} backHref="/builder" testId="shared-page">
      <div className="flex flex-col gap-3 pt-4" data-testid="shared-state" data-state={view.status}>
        {view.status === "loading" && <p className="text-fg-muted">{t("pay.shared.loading")}</p>}
        {view.status === "notFound" && (
          <p role="alert" data-testid="shared-not-found">
            {t("pay.shared.notFound")}
          </p>
        )}
        {view.status === "error" && (
          <p role="alert" data-testid="shared-error">
            {view.offline ? t("pay.shared.offline") : t("pay.share.unavailable")}
          </p>
        )}
        {view.status === "invalid" && (
          <p role="alert" data-testid="shared-invalid">
            {t("pay.shared.invalid", { error: view.errors.slice(0, 3).join("; ") })}
          </p>
        )}
        {view.status === "ok" && <Summary view={view} />}
        {view.status === "ok" && (
          <>
            <p className="text-sm text-fg-muted">{t("pay.shared.copyNote")}</p>
            <Button
              variant="primary"
              size="lg"
              disabled={importing}
              onClick={() => void doImport()}
              data-testid="shared-import"
            >
              {importing ? t("pay.shared.importing") : t("pay.shared.import")}
            </Button>
          </>
        )}
      </div>
    </PageShell>
  );
}

function Summary({ view }: { view: Extract<FetchSharedResult, { status: "ok" }> }) {
  const p = view.shared.preset;
  return (
    <>
      <h2 className="text-2xl" data-testid="shared-name">
        {p.name}
      </h2>
      <p className="text-fg-muted" data-testid="shared-game">
        {[p.game, p.format].filter(Boolean).join(" · ")} ·{" "}
        {t("pay.shared.players", { min: p.minPlayers, max: p.maxPlayers })}
      </p>
      {p.description && <p>{p.description}</p>}
      <SectionHeader title={t("pay.shared.counters")} />
      <p className="text-sm text-fg-muted">{tp("builder.counters", p.counters.length)}</p>
      <ul className="flex flex-col gap-1" data-testid="shared-counters">
        {p.counters.map((c) => (
          <li key={c.id} className="flex items-center gap-2 rounded-xl bg-surface p-2">
            <GameIcon id={c.icon} size={20} />
            <span className="flex-1">{c.name}</span>
            {c.kind === "number" && <span className="tabular text-fg-muted">{c.start}</span>}
          </li>
        ))}
      </ul>
      {p.rulesSummary && (
        <>
          <SectionHeader title={t("pay.shared.rules")} />
          <p className="whitespace-pre-line" data-testid="shared-rules">
            {p.rulesSummary}
          </p>
        </>
      )}
    </>
  );
}
