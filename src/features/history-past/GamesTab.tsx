"use client";
/** HIST-020 Games list (+ HIST-007 free view limit row). */
import { Clock, Lock, Trophy, Users } from "lucide-react";
import Link from "next/link";
import type { GameRecord } from "@/lib/records";
import { t, tp } from "@/lib/i18n";
import { cn } from "@/lib/ui/cn";
import { dateText, durationText, outcomeText, winnerPlayers } from "./format";

interface Props {
  records: GameRecord[];
  numbers: Map<string, number>;
  /** HIST-007: how many are viewable (Infinity for Pro / all-free). */
  limit: number;
  onOpen: (id: string) => void;
}

export function GamesTab({ records, numbers, limit, onOpen }: Props) {
  const shown = records.slice(0, limit);
  const more = records.length - shown.length;
  return (
    <div className="mt-3" data-testid="past-games-list">
      <ul className="flex flex-col gap-2">
        {shown.map((r) => {
          const winners = winnerPlayers(r);
          const accent = winners[0]?.color;
          const n = numbers.get(r.id) ?? 0;
          return (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onOpen(r.id)}
                data-testid="game-card"
                data-game-id={r.id}
                className="flex w-full overflow-hidden rounded-2xl bg-surface text-left hover:bg-surface-2"
              >
                <span
                  aria-hidden
                  className={cn("w-1.5 shrink-0", !accent && "bg-surface-3")}
                  style={accent ? { background: accent } : undefined}
                />
                <span className="flex min-w-0 flex-1 flex-col gap-1 p-3">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-lg font-semibold">
                      {t("historyPast.game.title", { number: n })}
                    </span>
                    <span className="truncate text-sm text-fg-muted">{dateText(r.endedAt)}</span>
                  </span>
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-muted">
                    <span className="inline-flex items-center gap-1">
                      <Users size={14} aria-hidden />
                      {tp("history.players", r.playerCount)}
                    </span>
                    <span>{r.presetName}</span>
                    {r.startValue > 0 && (
                      <span>{t("historyPast.game.start", { value: r.startValue })}</span>
                    )}
                    <span
                      className="inline-flex items-center gap-1"
                      data-testid="game-card-duration"
                    >
                      <Clock size={14} aria-hidden />
                      {durationText(r.durationMs)}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "flex items-center gap-1.5 truncate",
                      winners.length ? "text-fg" : "text-fg-subtle",
                    )}
                    data-testid="game-card-winner"
                  >
                    {winners.length > 0 && (
                      <Trophy size={16} aria-hidden className="shrink-0 text-warning" />
                    )}
                    {outcomeText(r)}
                  </span>
                  <span className="truncate text-sm text-fg-muted">
                    {r.players.map((p) => p.name).join(" · ")}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
        {more > 0 && (
          <li>
            <Link
              href="/account"
              className="flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-dashed border-warning/60 px-3 text-center text-warning"
              data-testid="games-more-locked"
            >
              <Lock size={16} aria-hidden />
              {tp("historyPast.moreLocked", more)}
            </Link>
          </li>
        )}
      </ul>
    </div>
  );
}
