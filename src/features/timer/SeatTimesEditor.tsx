"use client";
/**
 * TMR-060 "Different time per seat": a toggle and, when on, every seat by name with a time
 * stepper (default = the base time). Shared by the setup Clock section and Settings › Timers.
 * Values are extra time per seat (`TimerConfig.seatExtraMs`); the stepper shows absolute time.
 */
import { Stepper, Toggle } from "@/components/ui";
import { formatClock, type TimerConfig } from "@/engine";
import { t } from "@/lib/i18n";
import { extraFor, formatExtra, modeFamily, seatTimeMs, seatTimeStep } from "./seatTimes";

export interface SeatTimeRow {
  /** Stable key (setup seat key or engine seat id). */
  key: string;
  name: string;
  extraMs: number;
}

interface Props {
  config: TimerConfig;
  on: boolean;
  rows: readonly SeatTimeRow[];
  onToggle: (on: boolean) => void;
  onSeat: (key: string, extraMs: number) => void;
  testId?: string;
}

export function SeatTimesEditor({
  config,
  on,
  rows,
  onToggle,
  onSeat,
  testId = "seat-times",
}: Props) {
  const family = modeFamily(config.mode);
  if (!family) return null;
  const step = seatTimeStep(config.mode);
  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      <div className="flex min-h-14 items-center gap-3">
        <span className="flex flex-1 flex-col">
          <span>{t("timer.settings.seatTimes.title")}</span>
          <span className="text-sm text-fg-muted">{t("timer.settings.seatTimes.subtitle")}</span>
        </span>
        <Toggle
          checked={on}
          onChange={onToggle}
          label={t("timer.settings.seatTimes.title")}
          testId={`${testId}-toggle`}
        />
      </div>
      {on && (
        <>
          <p className="text-sm text-fg-muted">
            {t(
              family === "turn"
                ? "timer.settings.seatTimes.turnHint"
                : "timer.settings.seatTimes.hint",
            )}
          </p>
          <ul className="flex flex-col gap-1">
            {rows.map((r, i) => {
              const value = seatTimeMs(config, r.extraMs);
              return (
                <li
                  key={r.key}
                  className="flex min-h-14 items-center gap-2"
                  data-testid={`${testId}-row-${i}`}
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{r.name}</span>
                    {r.extraMs !== 0 && (
                      <span
                        className="text-sm text-fg-muted tabular"
                        data-testid={`${testId}-extra-${i}`}
                      >
                        {formatExtra(r.extraMs)}
                      </span>
                    )}
                  </span>
                  <Stepper
                    value={value}
                    min={step}
                    max={10 * 60 * 60_000}
                    step={step}
                    label={r.name}
                    testId={`${testId}-${i}`}
                    format={(ms) => formatClock(ms, { showTenths: false })}
                    onChange={(ms) => onSeat(r.key, extraFor(config, ms))}
                  />
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
