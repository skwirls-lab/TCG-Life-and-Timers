"use client";
/**
 * Toolbar clock controls (T2.5 / T2.7), mounted by the board Toolbar in place of the W2 Clock
 * placeholder:
 * - clocks off: the disabled Clock button (unchanged placeholder; configure in Settings → Timers)
 * - clocks configured, not started: a big START pill (TMR-001/002)
 * - running / paused: Pause / Resume (TMR-020)
 * - match timer (TMR-032): the round clock, then "TIME · +N" with the extra turns left.
 */
import { Pause, Play, Timer } from "lucide-react";
import { useTickNow } from "./useTickNow";
import { matchRemaining, formatClock } from "@/engine";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/ui/cn";
import { useDispatch, useGameStore, useGameValue } from "@/state/gameStore";
import { startClocks } from "./actions";

const btn =
  "relative inline-flex size-12 shrink-0 select-none items-center justify-center rounded-xl text-fg transition active:scale-95 focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40";

export function ClockToolbar({ vertical }: { vertical: boolean }) {
  const dispatch = useDispatch();
  const state = useGameValue((g) => ({
    mode: g.timer.mode,
    status: g.timer.status,
    ended: g.status === "ended",
    match: g.timer.match !== undefined,
  }));
  if (!state) return null;

  if (state.mode === "off") {
    return (
      <button
        type="button"
        aria-label={t("timer.toolbar.off")}
        title={t("timer.toolbar.off")}
        data-testid="toolbar-clock"
        className={btn}
        disabled
      >
        <Timer size={24} />
      </button>
    );
  }

  let control;
  if (state.status === "idle" && !state.ended) {
    control = (
      <button
        type="button"
        data-testid="timer-start"
        aria-label={t("timer.start")}
        onClick={startClocks}
        className={cn(
          "inline-flex shrink-0 select-none items-center justify-center gap-1.5 rounded-full bg-success font-extrabold uppercase tracking-wider text-black shadow-lg active:scale-95",
          vertical ? "min-h-28 w-12 py-3 [writing-mode:vertical-rl]" : "h-12 px-4",
          "text-base",
        )}
      >
        <Play aria-hidden size={20} className={cn(vertical && "rotate-90")} />
        {t("timer.start")}
      </button>
    );
  } else if (state.status === "running" || state.status === "paused") {
    const paused = state.status === "paused";
    const label = paused ? t("timer.toolbar.resume") : t("timer.toolbar.pause");
    control = (
      <button
        type="button"
        aria-label={label}
        title={label}
        data-testid="toolbar-clock"
        data-state={state.status}
        className={cn(btn, paused && "bg-accent text-accent-fg")}
        onClick={() =>
          dispatch(paused ? { type: "TIMER_RESUME" } : { type: "TIMER_PAUSE", reason: "user" })
        }
      >
        {paused ? <Play size={24} /> : <Pause size={24} />}
      </button>
    );
  } else {
    control = (
      <button
        type="button"
        aria-label={t("timer.toolbar.ended")}
        title={t("timer.toolbar.ended")}
        data-testid="toolbar-clock"
        className={btn}
        disabled
      >
        <Timer size={24} />
      </button>
    );
  }

  return (
    <>
      {control}
      {state.match && <MatchClock vertical={vertical} />}
    </>
  );
}

/** TMR-032: round clock; after time is called, "TIME · +N" extra turns (counted down on passes). */
function MatchClock({ vertical }: { vertical: boolean }) {
  const game = useGameStore((s) => s.session?.game);
  const now = useTickNow(game?.timer.status === "running");
  if (!game) return null;
  const m = matchRemaining(game, now);
  if (!m) return null;
  return (
    <div
      data-testid="match-clock"
      data-called={m.timeCalled || undefined}
      role="timer"
      aria-label={
        m.timeCalled
          ? t("timer.match.calledLabel", { n: m.extraTurnsRemaining })
          : t("timer.match.label", { time: formatClock(m.remainingMs, { showTenths: false }) })
      }
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full px-3 font-bold tabular",
        vertical ? "min-h-12 w-10 py-2 [writing-mode:vertical-rl]" : "h-10",
        m.timeCalled ? "bg-danger text-white" : "bg-surface-2 text-fg",
      )}
    >
      {m.timeCalled ? (
        <span data-testid="match-time-called">
          {t("timer.match.called", { n: m.extraTurnsRemaining })}
        </span>
      ) : (
        <span data-testid="match-clock-time">
          {formatClock(m.remainingMs, { showTenths: false })}
        </span>
      )}
    </div>
  );
}
