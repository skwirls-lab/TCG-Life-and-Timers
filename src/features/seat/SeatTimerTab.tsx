"use client";
/**
 * Seat menu Timer tab (SEAT-003, TMR-022, TURN-002; TIMER-UI lane): remaining / used time, turn
 * stats, manual adjustments (logged as "adjusted" in history), set exact, concede.
 */
import { useState } from "react";
import { Button, Keypad } from "@/components/ui";
import { formatClock, turnStats, type Game, type SeatId } from "@/engine";
import { MIN, SEC, parseMinutesInput } from "@/features/timer/model";
import { t } from "@/lib/i18n";
import { useDispatch, useGameValue } from "@/state/gameStore";
import { useClock } from "@/state/useClock";

export interface SeatTimerTabProps {
  seatId: SeatId;
}

/** The Timer tab is always offered: turn stats and concede work without clocks too. */
export function seatTimerTabVisible(_game: Game): boolean {
  return true;
}

const ADJUSTS = [-5 * MIN, -MIN, -30 * SEC, 30 * SEC, MIN, 5 * MIN] as const;

const fmt = (ms: number) => formatClock(ms, { showTenths: false });

function signed(ms: number): string {
  const abs = Math.abs(ms);
  const v = abs >= MIN ? `${abs / MIN}m` : `${abs / SEC}s`;
  return `${ms < 0 ? "−" : "+"}${v}`;
}

export function SeatTimerTab({ seatId }: SeatTimerTabProps) {
  const dispatch = useDispatch();
  const clock = useClock(seatId);
  const [setting, setSetting] = useState(false);
  const info = useGameValue((g) => {
    const stats = turnStats(g, seatId);
    const seat = g.seats.find((s) => s.id === seatId);
    return {
      mode: g.timer.mode,
      countup: g.timer.mode === "countup",
      eliminated: seat?.eliminated ?? false,
      ended: g.status === "ended",
      turns: stats.turns,
      average: stats.averageMs,
    };
  });
  if (!info) return null;
  const clocks = info.mode !== "off";

  return (
    <div className="flex flex-col gap-4 py-2" data-testid="seat-timer-tab">
      {clocks && clock ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-surface-2 p-3">
            <div className="text-sm text-fg-muted">
              {t(info.countup ? "timer.seat.used" : "timer.seat.remaining")}
            </div>
            <div className="text-4xl font-bold tabular" data-testid="seat-timer-remaining">
              {clock.display}
            </div>
          </div>
          <div className="rounded-2xl bg-surface-2 p-3">
            <div className="text-sm text-fg-muted">{t("timer.seat.used")}</div>
            <div className="text-4xl font-bold tabular" data-testid="seat-timer-used">
              {fmt(clock.usedMs)}
            </div>
          </div>
        </div>
      ) : (
        <p className="text-fg-muted" data-testid="seat-timer-off">
          {t("timer.seat.off")}
        </p>
      )}
      <p className="text-sm text-fg-muted" data-testid="seat-timer-stats">
        {info.average !== null
          ? t("timer.seat.stats", { turns: info.turns, average: fmt(info.average) })
          : t("timer.seat.turns", { turns: info.turns })}
      </p>

      {clocks && (
        <section aria-label={t("timer.seat.adjust")} className="flex flex-col gap-2">
          <h3 className="text-base font-semibold">{t("timer.seat.adjust")}</h3>
          <div className="grid grid-cols-3 gap-2">
            {ADJUSTS.map((d) => (
              <Button
                key={d}
                data-testid={`seat-timer-adjust-${d}`}
                aria-label={t("timer.seat.adjustBy", { delta: signed(d) })}
                className="tabular"
                onClick={() => dispatch({ type: "TIMER_ADJUST", seatId, deltaMs: d })}
              >
                {signed(d)}
              </Button>
            ))}
          </div>
          {setting ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-fg-muted">{t("timer.settings.custom.hint")}</p>
              <Keypad
                mode="set"
                testId="seat-timer-keypad"
                submitLabel={t("timer.settings.custom.submit")}
                onSubmit={(r) => {
                  const ms = parseMinutesInput(String(r.value));
                  if (ms === null) return;
                  dispatch({ type: "TIMER_SET", seatId, bankMs: ms });
                  setSetting(false);
                }}
              />
            </div>
          ) : (
            <Button data-testid="seat-timer-set" onClick={() => setSetting(true)}>
              {t("timer.seat.setExact")}
            </Button>
          )}
        </section>
      )}

      {!info.eliminated && !info.ended && (
        <Button
          variant="outline"
          className="border-danger/60 text-danger"
          data-testid="seat-timer-concede"
          onClick={() => dispatch({ type: "CONCEDE", seatId })}
        >
          {t("timer.seat.concede")}
        </Button>
      )}
    </div>
  );
}
