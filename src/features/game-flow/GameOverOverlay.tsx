"use client";
/** GAME-014 game-over overlay: winner(s), duration, turns, elimination order; Rematch / New setup. */
import { RotateCcw, Settings2, Skull, Trophy, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import type { Game } from "@/engine";
import { formatClock } from "@/features/launcher/summary";
import { t } from "@/lib/i18n";
import { useDispatch } from "@/state/gameStore";
import { gameOverStats } from "./flow";
import { useFlowUi } from "./flowUi";

export function GameOverOverlay({ game }: { game: Game }) {
  const router = useRouter();
  const dispatch = useDispatch();
  const key = `${game.id}:${game.endedAt ?? 0}`;
  const closed = useFlowUi((s) => s.closedGameOver.includes(key));
  const close = useFlowUi((s) => s.closeGameOver);
  if (game.status !== "ended" || closed) return null;
  const stats = gameOverStats(game);
  const title =
    stats.winners.length === 0
      ? t("shell.gameOver.noWinner")
      : t("shell.gameOver.winner", { names: stats.winners.join(" & ") });
  return (
    <div
      className="fixed inset-0 z-[55] flex items-center justify-center bg-black/80 p-4"
      data-testid="game-over"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("shell.gameOver.title")}
        className="flex max-h-[92dvh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-[2rem] bg-surface p-5 text-fg shadow-2xl"
      >
        <div className="flex items-start gap-3">
          <Trophy aria-hidden className="mt-1 shrink-0 text-warning" size={32} />
          <div className="flex-1">
            <p className="text-sm uppercase tracking-wide text-fg-muted">
              {t("shell.gameOver.title")}
            </p>
            <h2 className="text-2xl font-bold" data-testid="game-over-winner">
              {title}
            </h2>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-surface-2 p-3">
            <dt className="text-sm text-fg-muted">{t("shell.gameOver.duration")}</dt>
            <dd className="text-xl tabular" data-testid="game-over-duration">
              {formatClock(stats.durationMs)}
            </dd>
          </div>
          <div className="rounded-2xl bg-surface-2 p-3">
            <dt className="text-sm text-fg-muted">{t("shell.gameOver.turns")}</dt>
            <dd className="text-xl tabular" data-testid="game-over-turns">
              {stats.turns}
            </dd>
          </div>
        </dl>
        {stats.eliminated.length > 0 && (
          <section aria-label={t("shell.gameOver.eliminations")}>
            <h3 className="mb-1 text-sm text-fg-muted">{t("shell.gameOver.eliminations")}</h3>
            <ol className="flex flex-col gap-1" data-testid="game-over-eliminations">
              {stats.eliminated.map((e, i) => (
                <li key={`${e.seatId}-${i}`} className="flex items-center gap-2 text-base">
                  <Skull size={16} aria-hidden className="shrink-0 text-fg-muted" />
                  <span className="font-medium">{e.name}</span>
                  <span className="truncate text-sm text-fg-muted">{e.cause}</span>
                </li>
              ))}
            </ol>
          </section>
        )}
        <div className="flex flex-col gap-2">
          <Button
            variant="primary"
            size="lg"
            icon={<RotateCcw aria-hidden />}
            onClick={() => dispatch({ type: "RESET_GAME" })}
            data-testid="game-over-rematch"
          >
            {t("shell.gameOver.rematch")}
          </Button>
          <div className="flex gap-2">
            <Button
              className="flex-1"
              icon={<Settings2 aria-hidden />}
              onClick={() => router.push("/setup")}
              data-testid="game-over-new"
            >
              {t("shell.gameOver.newSetup")}
            </Button>
            <Button
              className="flex-1"
              variant="ghost"
              icon={<X aria-hidden />}
              onClick={() => close(key)}
              data-testid="game-over-close"
            >
              {t("shell.gameOver.viewBoard")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
