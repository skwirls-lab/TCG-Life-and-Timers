"use client";
/**
 * Current Game tab: header card (HIST-001), standings with filter (HIST-010), List | Chart toggle
 * with the event log (HIST-011..013) and the life chart (HIST-002).
 */
import { useEffect, useState } from "react";
import { ChevronDown, History, Skull, Trophy } from "lucide-react";
import { Segmented } from "@/components/ui";
import { GameIcon } from "@/components/icons/GameIcon";
import { activeDuration, enabledCounters, primaryCounter, standings, type Game } from "@/engine";
import { getDb } from "@/lib/db";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/ui/cn";
import { useGameStore } from "@/state/gameStore";
import { EventLog } from "./EventLog";
import { formatDuration, formatRelativeStart, headerView } from "./format";
import { LifeChart } from "./LifeChart";

/** Wall clock that ticks every `ms` (0 until mounted, so render stays pure). */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const raf = requestAnimationFrame(tick);
    const iv = setInterval(tick, ms);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(iv);
    };
  }, [ms]);
  return now;
}

/** A-11f (HIST-001): "Game N" = saved games on this device other than this one, + 1. */
function useGameNumber(gameId: string): number | undefined {
  const [n, setN] = useState<number | undefined>(undefined);
  useEffect(() => {
    let live = true;
    getDb()
      .records.filter((r) => r.id !== gameId)
      .count()
      .then((c) => live && setN(c + 1))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [gameId]);
  return n;
}

function HeaderCard({ game, now }: { game: Game; now: number }) {
  const [open, setOpen] = useState(false);
  const number = useGameNumber(game.id);
  const h = headerView(game, number);
  const primary = primaryCounter(game.preset);
  const elapsed = activeDuration(game, game.status === "ended" ? (game.endedAt ?? now) : now);
  const rules = enabledCounters(game).filter((c) => c.threshold);
  return (
    <section className="mt-4 rounded-2xl bg-surface p-4" data-testid="history-header">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold" data-testid="history-game-title">
            {h.title}
          </h2>
          <p className="text-fg-muted">{now ? formatRelativeStart(h.startedAt, now) : " "}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{h.players}</span>
            <span className="inline-flex items-center gap-1" data-testid="history-start-value">
              <GameIcon id={primary.icon} size={18} />
              <span>{h.startValue}</span>
            </span>
            <span>{h.presetName}</span>
          </p>
          <p className="mt-1 text-fg-muted tabular" data-testid="history-elapsed">
            {t("history.elapsed", { time: formatDuration(elapsed) })}
          </p>
        </div>
        <button
          type="button"
          aria-expanded={open}
          aria-label={t("history.details")}
          onClick={() => setOpen((o) => !o)}
          className="flex size-12 items-center justify-center rounded-xl hover:bg-surface-2"
          data-testid="history-header-expand"
        >
          <ChevronDown aria-hidden className={cn("transition", open && "rotate-180")} />
        </button>
      </div>
      {open && (
        <ul
          className="mt-3 space-y-1 border-t border-border pt-3 text-fg-muted"
          data-testid="history-details"
        >
          {rules.map((c) => (
            <li key={c.id}>
              {t("history.detail.threshold", {
                name: c.name,
                comparator: c.threshold!.comparator === "<=" ? "≤" : "≥",
                value: game.thresholdOverrides[c.id] ?? c.threshold!.value,
                outcome: t(
                  c.threshold!.outcome === "lose" ? "history.detail.lose" : "history.detail.win",
                ),
              })}
            </li>
          ))}
          <li>{t("history.detail.timer", { mode: game.timer.mode })}</li>
          <li>
            {t("history.detail.turnTracking", {
              state: t(game.options.turnTracking ? "history.on" : "history.off"),
            })}
          </li>
        </ul>
      )}
    </section>
  );
}

function Standings({
  game,
  filter,
  onFilter,
}: {
  game: Game;
  filter: string | null;
  onFilter: (id: string | null) => void;
}) {
  const rows = standings(game);
  return (
    <section className="mt-4" aria-labelledby="standings-title">
      <h2 id="standings-title" className="mb-1 text-lg text-fg-muted">
        {t("history.standings")}
      </h2>
      <p className="mb-2 text-sm text-fg-muted">{t("history.filterHint")}</p>
      <ul className="overflow-hidden rounded-2xl bg-surface" data-testid="history-standings">
        {rows.map((r, i) => {
          const subtitle = r.seat.commanders.filter(Boolean).join(" / ") || r.seat.deckName;
          const active = filter === r.seat.id;
          return (
            <li key={r.seat.id} className={cn(i > 0 && "border-t border-border")}>
              <button
                type="button"
                aria-pressed={active}
                title={t("history.filterSeat", { name: r.seat.name })}
                data-testid={`standing-${r.seat.id}`}
                data-eliminated={r.eliminated ? "true" : "false"}
                onClick={() => onFilter(active ? null : r.seat.id)}
                className={cn(
                  "flex min-h-16 w-full items-center gap-3 pr-4 text-left",
                  active && "bg-surface-3",
                )}
              >
                <span
                  aria-hidden
                  className="h-16 w-1.5 shrink-0"
                  style={{ background: r.seat.color }}
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span
                    className={cn(
                      "flex items-center gap-2 truncate text-lg",
                      r.eliminated && "text-fg-subtle",
                    )}
                  >
                    {r.seat.name}
                    {r.winner && (
                      <Trophy
                        size={16}
                        className="text-warning"
                        role="img"
                        aria-label={t("history.winner")}
                      />
                    )}
                  </span>
                  {subtitle && (
                    <span
                      className="truncate text-sm text-fg-muted"
                      data-testid="standing-subtitle"
                    >
                      {subtitle}
                    </span>
                  )}
                </span>
                {r.eliminated && (
                  <Skull
                    size={20}
                    className="text-fg-subtle"
                    role="img"
                    aria-label={t("history.eliminated")}
                  />
                )}
                <span
                  className={cn("text-2xl font-semibold tabular", r.eliminated && "text-fg-subtle")}
                  data-testid={`standing-${r.seat.id}-value`}
                >
                  {r.value}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function CurrentGamePanel() {
  const session = useGameStore((s) => s.session);
  const loadState = useGameStore((s) => s.loadState);
  const [filter, setFilter] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "chart">("list");
  const now = useNow(1000);

  if (!session) {
    return (
      <div
        className="mt-12 flex flex-col items-center gap-3 text-center"
        data-testid={
          loadState === "loading" || loadState === "idle" ? "history-loading" : "history-empty"
        }
      >
        <History size={44} aria-hidden className="text-fg-muted" />
        {loadState === "loaded" ? (
          <>
            <p className="text-xl">{t("history.empty")}</p>
            <p className="text-fg-muted">{t("history.emptyHint")}</p>
          </>
        ) : (
          <p className="text-fg-muted">{t("history.loading")}</p>
        )}
      </div>
    );
  }
  const game = session.game;
  const filterName = filter ? game.seats.find((s) => s.id === filter)?.name : undefined;

  return (
    <div data-testid="history-current">
      <HeaderCard game={game} now={now} />
      <Standings game={game} filter={filter} onFilter={setFilter} />
      <div className="mt-5">
        <Segmented
          label={t("history.view")}
          value={view}
          onChange={setView}
          testId="history-view"
          options={[
            { value: "list", label: t("history.list") },
            { value: "chart", label: t("history.chart") },
          ]}
        />
      </div>
      {filterName && (
        <div className="mt-3 flex items-center justify-between rounded-xl bg-surface-2 px-3 py-1">
          <span>{t("history.filtering", { name: filterName })}</span>
          <button
            type="button"
            className="min-h-12 px-2 font-semibold text-accent"
            onClick={() => setFilter(null)}
            data-testid="history-clear-filter"
          >
            {t("history.clearFilter")}
          </button>
        </div>
      )}
      {view === "list" ? (
        <EventLog session={session} filter={filter} />
      ) : (
        <LifeChart game={game} now={now} />
      )}
    </div>
  );
}
