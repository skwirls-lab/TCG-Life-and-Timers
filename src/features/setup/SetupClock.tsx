"use client";
/**
 * Setup "Clock" section (GAME-001 options step, §13.1-C, D-058): timer mode, time per player,
 * increment / delay, time per turn and the timeout action for the new game. Every clock option
 * is free.
 */
import { ChipRow, Toggle } from "@/components/ui";
import { BLOCKERS_TIMEOUTS, TIMEOUT_ACTIONS, TIMER_MODES, type TimerConfig } from "@/engine";
import { Select } from "@/features/settings/Select";
import {
  BANK_MINUTES,
  BANK_MODES,
  MIN,
  PER_TURN_MODES,
  PER_TURN_MS,
  STEP_SECONDS,
  shortDuration,
} from "@/features/timer/model";
import { BLOCKERS_SECONDS, blockersSettings, seatTimesOn } from "@/features/timer/seatTimes";
import { SeatTimesEditor, type SeatTimeRow } from "@/features/timer/SeatTimesEditor";
import { t } from "@/lib/i18n";

interface Props {
  timer: TimerConfig;
  onChange: (patch: Partial<TimerConfig>) => void;
  /** TMR-060: the seats (setup order) with their extra clock time. */
  seats?: readonly SeatTimeRow[];
  onSeatExtra?: (key: string, extraMs: number) => void;
}

export function SetupClock({ timer, onChange, seats = [], onSeatExtra }: Props) {
  const mode = timer.mode;
  const bankKey = mode === "perTurnReserve" ? "reserveMs" : "bankMs";
  const showBank = BANK_MODES.includes(mode) || mode === "perTurnReserve";
  const showStep = mode === "bankIncrement" || mode === "bankDelay";
  const showPerTurn = PER_TURN_MODES.includes(mode);
  const limited = mode !== "off" && mode !== "countup";

  return (
    <section className="flex flex-col gap-3" data-testid="setup-clock">
      <h3 className="text-lg">{t("shell.setup.clock.title")}</h3>
      <div className="flex min-h-14 items-center gap-3">
        <span className="flex-1">{t("timer.settings.mode.title")}</span>
        <Select
          label={t("timer.settings.mode.title")}
          value={mode}
          testId="setup-clock-mode"
          options={TIMER_MODES.map((m) => ({
            value: m,
            label: t(`timer.mode.${m}`),
          }))}
          onChange={(m) => onChange({ mode: m })}
        />
      </div>
      {showBank && (
        <div className="flex flex-col gap-2">
          <span>
            {t("timer.settings.bank.title")}{" "}
            <span className="text-sm text-fg-muted">({t("shell.setup.clock.minutes")})</span>
          </span>
          <ChipRow
            label={t("timer.settings.bank.title")}
            testId="setup-clock-bank"
            value={timer[bankKey] % MIN === 0 ? timer[bankKey] / MIN : null}
            options={BANK_MINUTES.map((m) => ({ value: m }))}
            onChange={(m) => onChange({ [bankKey]: m * MIN })}
          />
        </div>
      )}
      {showStep && (
        <div className="flex flex-col gap-2">
          <span>
            {t(
              mode === "bankDelay" ? "timer.settings.step.delay" : "timer.settings.step.increment",
            )}{" "}
            <span className="text-sm text-fg-muted">({t("timer.settings.step.subtitle")})</span>
          </span>
          <ChipRow
            label={t(
              mode === "bankDelay" ? "timer.settings.step.delay" : "timer.settings.step.increment",
            )}
            testId="setup-clock-step"
            value={Math.round((mode === "bankDelay" ? timer.delayMs : timer.incrementMs) / 1000)}
            options={STEP_SECONDS.map((s) => ({ value: s }))}
            onChange={(s) =>
              onChange(mode === "bankDelay" ? { delayMs: s * 1000 } : { incrementMs: s * 1000 })
            }
          />
        </div>
      )}
      {showPerTurn && (
        <div className="flex flex-col gap-2">
          <span>{t("timer.settings.perTurn.title")}</span>
          <ChipRow
            label={t("timer.settings.perTurn.title")}
            testId="setup-clock-perTurn"
            value={timer.perTurnMs}
            options={PER_TURN_MS.map((ms) => ({ value: ms, label: shortDuration(ms) }))}
            onChange={(ms) => onChange({ perTurnMs: ms })}
          />
        </div>
      )}
      {limited && (
        <div className="flex min-h-14 items-center gap-3">
          <span className="flex-1">{t("timer.settings.timeoutAction.title")}</span>
          <Select
            label={t("timer.settings.timeoutAction.title")}
            value={timer.timeoutAction}
            testId="setup-clock-timeout"
            options={TIMEOUT_ACTIONS.map((a) => ({
              value: a,
              label: t(`timer.timeout.${a}`),
            }))}
            onChange={(a) => onChange({ timeoutAction: a })}
          />
        </div>
      )}
      {limited && (
        <SeatTimesEditor
          config={timer}
          on={seatTimesOn(timer)}
          rows={seats}
          testId="setup-seat-times"
          onToggle={(on) => onChange({ seatExtraMs: on ? {} : undefined })}
          onSeat={(key, ms) => onSeatExtra?.(key, ms)}
        />
      )}
      {mode !== "off" && <BlockersSetup timer={timer} onChange={onChange} />}
    </section>
  );
}

/** Declare-blockers window: on/off, length and the 0:00 house rule (free). */
export function BlockersSetup({ timer, onChange }: Props) {
  const b = blockersSettings(timer);
  return (
    <div className="flex flex-col gap-1" data-testid="setup-blockers">
      <div className="flex min-h-14 items-center gap-3">
        <span className="flex flex-1 flex-col">
          <span>{t("timer.settings.blockersWindow.title")}</span>
          <span className="text-sm text-fg-muted">
            {t("timer.settings.blockersWindow.subtitle")}
          </span>
        </span>
        <Toggle
          checked={b.on}
          onChange={(on) => onChange({ blockersWindow: on })}
          label={t("timer.settings.blockersWindow.title")}
          testId="setup-blockers-toggle"
        />
      </div>
      {b.on && (
        <>
          <div className="flex min-h-14 items-center gap-3">
            <span className="flex-1">{t("timer.settings.blockersMs.title")}</span>
            <Select
              label={t("timer.settings.blockersMs.title")}
              value={String(b.seconds)}
              testId="setup-blockers-ms"
              options={BLOCKERS_SECONDS.map((s) => ({
                value: String(s),
                label: t("timer.settings.seconds", { n: s }),
              }))}
              onChange={(s) => onChange({ blockersMs: Number(s) * 1000 })}
            />
          </div>
          <div className="flex min-h-14 items-center gap-3">
            <span className="flex-1">{t("timer.settings.blockersTimeout.title")}</span>
            <Select
              label={t("timer.settings.blockersTimeout.title")}
              value={b.timeout}
              testId="setup-blockers-timeout"
              options={BLOCKERS_TIMEOUTS.map((v) => ({
                value: v,
                label: t(`timer.blockersTimeout.${v}`),
              }))}
              onChange={(v) => onChange({ blockersTimeout: v })}
            />
          </div>
        </>
      )}
    </div>
  );
}
