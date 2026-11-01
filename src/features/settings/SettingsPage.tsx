"use client";
/**
 * `/settings` (T1.14, SET-001, SET-010..015): a full, upright page generated from the registry.
 * Game-scope rows edit the active game (or the next game's defaults when none is active).
 */
import { useState } from "react";
import { Button, PageShell, SectionHeader, Sheet } from "@/components/ui";
import { usePageBoot } from "@/features/app-effects/usePageBoot";
import { PresetList } from "@/features/setup/PresetList";
import { t } from "@/lib/i18n";
import { afterOverlayClose } from "./afterOverlayClose";
import {
  SECTIONS,
  SECTION_TITLES,
  visibleSettings,
  type ActionId,
  type SubPageId,
} from "./registry";
import { SettingRow, type RowHandlers } from "./SettingRow";
import { ImageCacheSheet } from "./ImageCacheSheet";
import { useSnackbar } from "@/components/ui/Snackbar";
import { shareApp, type ShareResult } from "@/lib/feedback/share";

const SHARE_MESSAGES: Record<
  ShareResult,
  "account.feedback.shared" | "account.feedback.copied" | "account.feedback.shareFailed" | null
> = {
  shared: "account.feedback.shared",
  copied: "account.feedback.copied",
  failed: "account.feedback.shareFailed",
  cancelled: null,
};
import { SettingsSubPage } from "./SubPages";
import { useSettingsModel } from "./useSettingsModel";
// TIMER-UI (W3): section C rows (registers on import) + SET-013 auto-pause, restart confirm, keypad.
import "@/features/timer/timerSettings";
import { TimerSettingsHost } from "@/features/timer/TimerSettingsHost";

export function SettingsPage() {
  usePageBoot();
  const model = useSettingsModel();
  const { ctx } = model;
  const [presetPicker, setPresetPicker] = useState(false);
  const [sub, setSub] = useState<SubPageId | null>(null);

  const [cacheSheet, setCacheSheet] = useState(false);
  const runAction = (action: ActionId) => {
    if (action === "saveDefaults") void model.saveDefaults();
    else if (action === "restoreDefaults") void model.restoreDefaults();
    else if (action === "clearImageCache") setCacheSheet(true);
    else if (action === "share") {
      // SET-040 (A-11e): Web Share, else copy the link.
      void shareApp({
        title: t("account.feedback.shareTitle"),
        text: t("account.feedback.shareText"),
      }).then((r) => {
        const key = SHARE_MESSAGES[r];
        if (key) useSnackbar.getState().show({ message: t(key) });
      });
    }
  };

  const handlers: RowHandlers = {
    apply: model.apply,
    openPresetPicker: () => setPresetPicker(true),
    openSubPage: setSub,
    runAction,
  };

  if (sub) {
    return (
      <SettingsSubPage
        page={sub}
        ctx={ctx}
        onClose={() => setSub(null)}
        applyDraft={model.applyDraft}
        applyTimer={(patch) => model.apply({ kind: "timer", patch })}
      />
    );
  }

  return (
    <PageShell title={t("shell.settings.title")} testId="settings">
      <p className="mt-3 text-sm text-fg-muted" data-testid="settings-scope">
        {ctx.game
          ? t("shell.settings.scope.game", { preset: ctx.preset.name })
          : t("shell.settings.scope.next", { preset: ctx.preset.name })}
      </p>
      {SECTIONS.map((section) => {
        const rows = visibleSettings(section, ctx);
        if (rows.length === 0) return null;
        return (
          <section
            key={section}
            aria-label={t(SECTION_TITLES[section])}
            data-testid={`settings-section-${section}`}
          >
            <SectionHeader title={t(SECTION_TITLES[section])} />
            {rows.map((def) => (
              <SettingRow key={def.id} def={def} ctx={ctx} handlers={handlers} />
            ))}
          </section>
        );
      })}

      <ImageCacheSheet open={cacheSheet} onClose={() => setCacheSheet(false)} />
      <Sheet
        open={presetPicker}
        onClose={() => setPresetPicker(false)}
        title={t("shell.settings.preset.title")}
        testId="settings-preset-picker"
      >
        <PresetList
          value={ctx.preset.id}
          label={t("shell.settings.preset.title")}
          testIdPrefix="settings-preset"
          onChange={(p) => {
            setPresetPicker(false);
            afterOverlayClose(() => void model.choosePreset(p));
          }}
        />
      </Sheet>

      <Sheet
        open={model.pending !== null}
        onClose={model.cancelPending}
        title={t("shell.settings.confirm.title")}
        testId="confirm-reset"
      >
        <p className="mb-4 text-base">{t("shell.settings.confirm.body")}</p>
        <div className="flex gap-3">
          <Button
            className="flex-1"
            onClick={model.cancelPending}
            data-testid="confirm-reset-cancel"
          >
            {t("common.cancel")}
          </Button>
          <Button
            className="flex-1"
            variant="danger"
            onClick={() => void model.confirmPending()}
            data-testid="confirm-reset-continue"
          >
            {t("shell.settings.confirm.continue")}
          </Button>
        </div>
      </Sheet>
      <TimerSettingsHost
        config={ctx.draft.timer}
        onPatch={(patch) => model.apply({ kind: "timer", patch })}
      />
    </PageShell>
  );
}
