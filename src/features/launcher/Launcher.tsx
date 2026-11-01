"use client";
/**
 * Launcher `/` (T1.12): Resume card (GAME-016), "Quick start: same as last game" (GAME-001),
 * New game → /setup, and links to History, Tools, Settings and Profiles.
 */
import { Dices, History, Layers, Play, Plus, Settings, Users, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui";
import type { NewGameConfig } from "@/engine";
import { usePageBoot } from "@/features/app-effects/usePageBoot";
import { loadLastConfig } from "@/features/setup/gameConfig";
import { startNewGame } from "@/features/setup/startGame";
import { t } from "@/lib/i18n";
import { useGameStore } from "@/state/gameStore";
import { canResume, quickStartSummary, resumeSummary } from "./summary";
import { useNow } from "./useNow";

function NavTile({
  href,
  icon,
  label,
  testId,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  testId: string;
}) {
  return (
    <Link
      href={href}
      data-testid={testId}
      className="flex min-h-20 flex-col items-center justify-center gap-1 rounded-2xl bg-surface p-3 text-base text-fg transition hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent"
    >
      <span aria-hidden className="text-fg-muted">
        {icon}
      </span>
      {label}
    </Link>
  );
}

export function Launcher() {
  usePageBoot();
  const router = useRouter();
  const game = useGameStore((s) => s.session?.game);
  const loadState = useGameStore((s) => s.loadState);
  const notice = useGameStore((s) => s.notice);
  const dismissNotice = useGameStore((s) => s.dismissNotice);
  const now = useNow();
  const [last, setLast] = useState<NewGameConfig | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    loadLastConfig()
      .then((c) => alive && setLast(c))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const quickStart = async () => {
    if (!last || busy) return;
    setBusy(true);
    try {
      // null: the Who-won prompt was closed, so the current game stays (HIST-031)
      if (await startNewGame(last)) router.push("/play");
    } finally {
      setBusy(false);
    }
  };

  const resumable = canResume(game) ? game : null;
  const summary = resumable ? resumeSummary(resumable, now) : null;
  const quick = last ? quickStartSummary(last) : null;

  return (
    <main
      className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-5 px-4 py-8 safe-area"
      data-testid="launcher"
    >
      <header className="text-center">
        <h1 className="text-3xl font-semibold">{t("app.name")}</h1>
        <p className="mt-1 text-fg-muted">{t("app.tagline")}</p>
      </header>

      {notice === "corrupt" && (
        <div
          role="alert"
          data-testid="launcher-corrupt-notice"
          className="flex items-center gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-3"
        >
          <p className="flex-1 text-sm">{t("engine.corruptNotice")}</p>
          <Button size="sm" variant="ghost" onClick={dismissNotice}>
            {t("common.close")}
          </Button>
        </div>
      )}

      {summary && (
        <Link
          href="/play"
          data-testid="launcher-resume"
          className="flex items-center gap-4 rounded-3xl bg-accent/15 p-5 ring-1 ring-accent/50 transition hover:bg-accent/25 focus-visible:outline-2 focus-visible:outline-accent"
        >
          <span className="flex size-12 items-center justify-center rounded-full bg-accent text-accent-fg">
            <Play aria-hidden />
          </span>
          <span className="flex flex-col">
            <span className="text-xl font-semibold">{t("shell.launcher.resume")}</span>
            <span className="text-sm text-fg-muted" data-testid="launcher-resume-summary">
              {t("shell.launcher.resumeSummary", {
                preset: summary.presetName,
                players: summary.players,
                elapsed: summary.elapsed,
              })}
            </span>
          </span>
        </Link>
      )}

      <div className="flex flex-col gap-3">
        {quick && (
          <Button
            size="lg"
            variant={summary ? "secondary" : "primary"}
            block
            icon={<Zap aria-hidden />}
            onClick={() => void quickStart()}
            disabled={busy}
            data-testid="launcher-quick"
            className="h-auto flex-col py-3"
          >
            <span>{t("shell.launcher.quickStart")}</span>
            <span className="text-sm font-normal">
              {t("shell.launcher.quickSummary", {
                preset: quick.presetName,
                players: quick.players,
              })}
            </span>
          </Button>
        )}
        <Button
          size="lg"
          variant={summary || quick ? "secondary" : "primary"}
          block
          icon={<Plus aria-hidden />}
          onClick={() => router.push("/setup")}
          data-testid="launcher-new"
        >
          {t("launcher.newGame")}
        </Button>
      </div>

      <nav aria-label={t("shell.launcher.more")} className="grid grid-cols-2 gap-3">
        <NavTile
          href="/history"
          icon={<History />}
          label={t("shell.launcher.history")}
          testId="launcher-link-history"
        />
        <NavTile
          href="/tools"
          icon={<Dices />}
          label={t("shell.launcher.tools")}
          testId="launcher-link-tools"
        />
        <NavTile
          href="/settings"
          icon={<Settings />}
          label={t("shell.launcher.settings")}
          testId="launcher-link-settings"
        />
        <NavTile
          href="/profiles"
          icon={<Users />}
          label={t("shell.launcher.profiles")}
          testId="launcher-link-profiles"
        />
        <NavTile
          href="/builder"
          icon={<Layers />}
          label={t("shell.launcher.presets")}
          testId="launcher-link-presets"
        />
      </nav>
      {loadState === "loading" && (
        <p className="text-center text-sm text-fg-subtle" aria-live="polite">
          {t("shell.launcher.loading")}
        </p>
      )}
      {/* ART-005 / LEG-003: credits are one tap from the start screen */}
      <footer className="mt-auto flex justify-center">
        <Link
          href="/about"
          data-testid="launcher-link-about"
          className="inline-flex min-h-12 items-center px-4 text-sm text-fg-muted underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-accent"
        >
          {t("shell.launcher.about")}
        </Link>
      </footer>
    </main>
  );
}
