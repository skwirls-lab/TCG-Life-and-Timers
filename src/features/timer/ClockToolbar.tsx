"use client";
/**
 * Toolbar clock controls (T2.5 / T2.7), mounted by the board Toolbar in place of the W2 Clock
 * placeholder:
 * - nothing configured: the disabled Clock button (configure in Settings → Timers)
 * - clocks or a match timer configured, not started: a big START pill (TMR-001/002); a compact
 *   44 px START when the strip is narrow (A-5, ENV-003)
 * - running / paused: Pause / Resume (TMR-020)
 * - match timer (TMR-032): the round clock, then "TIME · +N" with the extra turns left. A match
 *   timer alone (per-seat mode Off: Pokémon, Yu-Gi-Oh!) runs the same way (A-3).
 */
import { Pause, Play, Timer } from "lucide-react";
import { useTickNow } from "./useTickNow";
import { matchRemaining, formatClock, type Game } from "@/engine";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/ui/cn";
import { useDispatch, useGameStore, useGameValue } from "@/state/gameStore";
import { startClocks } from "./actions";

export type ClockControlKind = "off" | "start" | "running" | "paused" | "ended";

/** What the toolbar's clock slot shows (primitive, for store selectors). */
export function clockControlKind(g: Game): ClockControlKind {
  if (g.timer.mode === "off" && g.timer.match === undefined) return "off";
  const s = g.timer.status;
  if (s === "idle" && g.status !== "ended") return "start";
  if (s === "running" || s === "paused") return s;
  return "ended";
}

const btnBase =
  "relative inline-flex shrink-0 select-none items-center justify-center rounded-xl text-fg transition active:scale-95 focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40";

export function ClockControl({ vertical, compact }: { vertical: boolean; compact: boolean }) {
  const dispatch = useDispatch();
  const kind = useGameValue(clockControlKind);
  if (!kind) return null;
  const btn = cn(btnBase, compact ? "size-11" : "size-12");

  if (kind === "off" || kind === "ended") {
    const label = kind === "off" ? t("timer.toolbar.off") : t("timer.toolbar.ended");
    return (
      <button
        type="button"
        aria-label={label}
        title={label}
        data-testid="toolbar-clock"
        className={btn}
        disabled
      >
        <Timer size={24} />
      </button>
    );
  }

  if (kind === "start") {
    return (
      <button
        type="button"
        data-testid="timer-start"
        data-compact={compact || undefined}
        aria-label={t("timer.start")}
        onClick={startClocks}
        className={cn(
          "inline-flex shrink-0 select-none items-center justify-center rounded-full bg-success font-extrabold uppercase text-black shadow-lg active:scale-95",
          compact
            ? "size-11 flex-col gap-0 rounded-xl text-[0.6rem] leading-none tracking-wide"
            : vertical
              ? "min-h-28 w-12 gap-1.5 py-3 text-base tracking-wider [writing-mode:vertical-rl]"
              : "h-12 gap-1.5 px-4 text-base tracking-wider",
        )}
      >
        <Play
          aria-hidden
          size={compact ? 18 : 20}
          className={cn(vertical && !compact && "rotate-90")}
        />
        {t("timer.start")}
      </button>
    );
  }

  const paused = kind === "paused";
  const label = paused ? t("timer.toolbar.resume") : t("timer.toolbar.pause");
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-testid="toolbar-clock"
      data-state={kind}
      className={cn(btn, paused && "bg-accent text-accent-fg")}
      onClick={() =>
        dispatch(paused ? { type: "TIMER_RESUME" } : { type: "TIMER_PAUSE", reason: "user" })
      }
    >
      {paused ? <Play size={24} /> : <Pause size={24} />}
    </button>
  );
}

/** TMR-032: round clock; after time is called, "TIME · +N" extra turns (counted down on passes). */
export function MatchClock({ vertical, compact }: { vertical: boolean; compact: boolean }) {
  const game = useGameStore((s) => s.session?.game);
  const now = useTickNow(game?.timer.status === "running");
  if (!game) return null;
  const m = matchRemaining(game, now);
  if (!m) return null;
  const time = formatClock(m.remainingMs, { showTenths: false });
  return (
    <div
      data-testid="match-clock"
      data-called={m.timeCalled || undefined}
      role="timer"
      aria-label={
        m.timeCalled
          ? t("timer.match.calledLabel", { n: m.extraTurnsRemaining })
          : t("timer.match.label", { time })
      }
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-bold tabular",
        compact
          ? "h-11 min-w-11 rounded-xl px-1 text-xs"
          : vertical
            ? "min-h-12 w-10 px-3 py-2 [writing-mode:vertical-rl]"
            : "h-10 px-3",
        m.timeCalled ? "bg-danger text-white" : "bg-surface-2 text-fg",
      )}
    >
      {m.timeCalled ? (
        <span data-testid="match-time-called">
          {t("timer.match.called", { n: m.extraTurnsRemaining })}
        </span>
      ) : (
        <span data-testid="match-clock-time">{time}</span>
      )}
    </div>
  );
}
