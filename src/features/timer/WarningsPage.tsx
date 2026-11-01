"use client";
/**
 * Settings › Timers › Low-time warnings (TMR-031, §13.1-C): presets, plus add / remove thresholds
 * with per-threshold sound / vibrate / flash. Edits apply live (the clocks' runtime config, or the
 * next game's timer defaults). Custom edits and the "more" preset need `timerAdvancedModes`.
 */
import { Trash2 } from "lucide-react";
import { ChipRow, IconButton, Toggle } from "@/components/ui";
import { formatClock, timerWarnings, type TimerConfig } from "@/engine";
import { Select, type SelectOption } from "@/features/settings/Select";
import type { SettingsContext } from "@/features/settings/registry";
import { openPaywall } from "@/lib/entitlements/paywall";
import { t, type MessageKey } from "@/lib/i18n";
import { WARNING_PRESETS, shortDuration, warningPresetId } from "./model";
import {
  WARNING_FLAGS,
  addChoices,
  addWarning,
  presetWarnings,
  removeWarning,
  toggleWarningFlag,
} from "./warnings";

type TimerPatch = Partial<TimerConfig>;

interface Props {
  ctx: SettingsContext;
  onPatch: (patch: TimerPatch) => void;
}

export function WarningsPage({ ctx, onPatch }: Props) {
  const cfg = ctx.draft.timer;
  const list = timerWarnings(cfg);
  const pro = ctx.can("timerAdvancedModes");
  /** Custom edits are Pro (locked → paywall). */
  const edit = (patch: () => TimerPatch) =>
    pro ? onPatch(patch()) : openPaywall("timerAdvancedModes");
  const presetId = warningPresetId(cfg.warningsMs);
  const presetLocked = (id: string) => id === "more" && !pro;
  const options: SelectOption<string>[] = Object.keys(WARNING_PRESETS).map((id) => ({
    value: id,
    label: t(`timer.warnings.${id}` as MessageKey) + (presetLocked(id) ? " 🔒" : ""),
  }));
  if (presetId === "custom")
    options.push({ value: "custom", label: t("timer.warnings.custom"), disabled: true });

  return (
    <div className="mt-4 flex flex-col gap-4" data-testid="timer-warnings">
      <p className="text-sm text-fg-muted">{t("timer.settings.warnings.subtitle")}</p>
      <div className="flex min-h-14 items-center gap-3">
        <span className="flex-1 text-lg">{t("timer.warnings.preset")}</span>
        <Select
          label={t("timer.warnings.preset")}
          value={presetId}
          testId="timer-warnings-preset"
          options={options}
          onChange={(id) => {
            const ms = WARNING_PRESETS[id];
            if (!ms) return;
            if (presetLocked(id)) openPaywall("timerAdvancedModes");
            else onPatch(presetWarnings(ms));
          }}
        />
      </div>

      {list.length === 0 ? (
        <p className="text-base text-fg-muted" data-testid="timer-warnings-empty">
          {t("timer.warnings.off")}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((w, i) => {
            const time = formatClock(w.ms, { showTenths: false });
            return (
              <li
                key={w.ms}
                className="flex flex-col gap-2 rounded-2xl bg-surface p-3"
                data-testid={`timer-warning-${i}`}
                data-ms={w.ms}
              >
                <div className="flex items-center gap-2">
                  <span className="flex-1 text-xl font-semibold tabular">{time}</span>
                  <IconButton
                    label={t("timer.warnings.remove", { time })}
                    data-testid={`timer-warning-${i}-remove`}
                    onClick={() => edit(() => removeWarning(cfg, w.ms))}
                  >
                    <Trash2 aria-hidden />
                  </IconButton>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  {WARNING_FLAGS.map((flag) => (
                    <label key={flag} className="flex items-center gap-2 text-base">
                      <Toggle
                        label={t(`timer.warnings.flag.${flag}`, { time })}
                        checked={w[flag]}
                        testId={`timer-warning-${i}-${flag}`}
                        onChange={(on) => edit(() => toggleWarningFlag(cfg, w.ms, flag, on))}
                      />
                      <span aria-hidden>{t(`timer.warnings.flagShort.${flag}`)}</span>
                    </label>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {addChoices(cfg).length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-lg">{t("timer.warnings.add")}</span>
          <ChipRow
            label={t("timer.warnings.add")}
            testId="timer-warning-add"
            value={null}
            options={addChoices(cfg).map((ms) => ({
              value: ms,
              label: shortDuration(ms),
              locked: !pro,
            }))}
            onChange={(ms) => edit(() => addWarning(cfg, ms))}
          />
        </div>
      )}
    </div>
  );
}
