"use client";
/**
 * Mounted by the Settings page (T2.5 / T2.8):
 * - SET-013: pauses running clocks while Settings is open (config.autoPauseMenus); the board's
 *   PAUSED overlay is the resume prompt on return.
 * - "Restart the clocks?" confirm for structure changes after START (§13.1-C).
 * - Custom duration keypad (time per player h:mm / match timer minutes).
 */
import { useEffect } from "react";
import type { TimerConfig } from "@/engine";
import { Button, Keypad, Sheet } from "@/components/ui";
import { t } from "@/lib/i18n";
import { useGameStore } from "@/state/gameStore";
import { pauseForMenus, restartClocks } from "./actions";
import { parseMinutesInput } from "./model";
import { applyTimerPatch } from "./timerSettings";
import { useTimerSettingsUi } from "./timerSettingsUi";

interface Props {
  /** Applies a timer patch (the settings model: active game or next game's defaults). */
  onPatch?: (patch: Partial<TimerConfig>) => void;
  /** The edited config (for the match timer's extra turns). */
  config?: TimerConfig;
}

export function TimerSettingsHost({ onPatch = applyTimerPatch, config }: Props) {
  const restart = useTimerSettingsUi((s) => s.restart);
  const custom = useTimerSettingsUi((s) => s.custom);
  const close = useTimerSettingsUi((s) => s.close);
  const hasGame = useGameStore((s) => s.session !== null);

  // SET-013 (also when the game is loaded after the page mounted).
  useEffect(() => {
    if (hasGame) pauseForMenus();
  }, [hasGame]);
  useEffect(() => () => close(), [close]);

  return (
    <>
      <Sheet
        open={restart !== null}
        onClose={close}
        title={t("timer.settings.restart.title")}
        testId="timer-restart-confirm"
      >
        <p className="mb-4 text-base">{t("timer.settings.restart.body")}</p>
        <div className="flex gap-3">
          <Button className="flex-1" onClick={close} data-testid="timer-restart-cancel">
            {t("common.cancel")}
          </Button>
          <Button
            className="flex-1"
            variant="danger"
            data-testid="timer-restart-continue"
            onClick={() => {
              if (restart) restartClocks(restart);
              close();
            }}
          >
            {t("timer.settings.restart.continue")}
          </Button>
        </div>
      </Sheet>
      <Sheet
        open={custom !== null}
        onClose={close}
        title={t(custom === "match" ? "timer.settings.custom.match" : "timer.settings.custom.bank")}
        testId="timer-custom"
      >
        <p className="mb-3 text-sm text-fg-muted">{t("timer.settings.custom.hint")}</p>
        <Keypad
          mode="set"
          testId="timer-custom-keypad"
          submitLabel={t("timer.settings.custom.submit")}
          onSubmit={(r) => {
            const ms = parseMinutesInput(String(r.value));
            if (ms === null || !custom) return;
            const cfg = config ?? useGameStore.getState().session?.game.timer.config;
            if (custom === "match") {
              onPatch({ match: { totalMs: ms, extraTurns: cfg?.match?.extraTurns ?? 0 } });
            } else {
              onPatch({ [custom]: ms });
            }
            if (!useTimerSettingsUi.getState().restart) close();
          }}
        />
      </Sheet>
    </>
  );
}
