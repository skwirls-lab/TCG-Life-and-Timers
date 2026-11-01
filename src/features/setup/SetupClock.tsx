"use client";
/**
 * Setup "Clock" section (GAME-001 options step, §13.1-C, D-058): timer mode, time per player,
 * increment / delay, time per turn and the timeout action for the new game. Advanced modes (and
 * "Add time once") are gated by `timerAdvancedModes`: a locked choice opens the paywall.
 */
import { ChipRow } from "@/components/ui";
import { TIMEOUT_ACTIONS, TIMER_MODES, type TimerConfig, type TimerMode } from "@/engine";
import { Select } from "@/features/settings/Select";
import {
  ADVANCED_MODES,
  BANK_MINUTES,
  BANK_MODES,
  MIN,
  PER_TURN_MODES,
  PER_TURN_MS,
  STEP_SECONDS,
  shortDuration,
} from "@/features/timer/model";
import { useCan } from "@/lib/entitlements/store";
import { openPaywall } from "@/lib/entitlements/paywall";
import { t } from "@/lib/i18n";

interface Props {
  timer: TimerConfig;
  onChange: (patch: Partial<TimerConfig>) => void;
}

const LOCK = " 🔒";

export function SetupClock({ timer, onChange }: Props) {
  const advanced = useCan("timerAdvancedModes");
  const mode = timer.mode;
  const bankKey = mode === "perTurnReserve" ? "reserveMs" : "bankMs";
  const showBank = BANK_MODES.includes(mode) || mode === "perTurnReserve";
  const showStep = mode === "bankIncrement" || mode === "bankDelay";
  const showPerTurn = PER_TURN_MODES.includes(mode);
  const limited = mode !== "off" && mode !== "countup";
  const isLocked = (m: TimerMode) => ADVANCED_MODES.includes(m) && !advanced;

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
            label: t(`timer.mode.${m}`) + (isLocked(m) ? LOCK : ""),
          }))}
          onChange={(m) =>
            isLocked(m) ? openPaywall("timerAdvancedModes") : onChange({ mode: m })
          }
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
              label: t(`timer.timeout.${a}`) + (a === "addOnce" && !advanced ? LOCK : ""),
            }))}
            onChange={(a) =>
              a === "addOnce" && !advanced
                ? openPaywall("timerAdvancedModes")
                : onChange({ timeoutAction: a })
            }
          />
        </div>
      )}
    </section>
  );
}
