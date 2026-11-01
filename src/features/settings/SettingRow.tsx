"use client";
/** Renders one registry row with its control (LifeTap settings visual language, SET-015). */
import { ChevronRight, CircleHelp } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Button, ChipRow, IconButton, LockBadge, Segmented, Sheet, Toggle } from "@/components/ui";
import { primaryCounter } from "@/engine";
import { StartValuePicker } from "@/features/setup/StartValuePicker";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/ui/cn";
// PAY lane (T7.1): a tap on a Pro-locked option opens the paywall instead of applying it.
import { openPaywall } from "@/lib/entitlements/paywall";
import { Select } from "./Select";
import { CardLayoutPreview, ThumbnailPicker, layoutThumbOptions } from "./Thumbnails";
import {
  settingSubtitle,
  settingTitle,
  type ActionId,
  type ChoiceOption,
  type SettingChange,
  type SettingDef,
  type SettingsContext,
  type SettingValue,
  type SubPageId,
} from "./registry";

export interface RowHandlers {
  apply: (change: SettingChange) => void;
  openPresetPicker: () => void;
  openSubPage: (page: SubPageId) => void;
  runAction: (action: ActionId) => void;
}

const BLOCK = new Set(["chips", "segmented", "thumbnails", "startValue"]);

export function SettingRow({
  def,
  ctx,
  handlers,
}: {
  def: SettingDef;
  ctx: SettingsContext;
  handlers: RowHandlers;
}) {
  const [help, setHelp] = useState(false);
  const title = settingTitle(def, ctx);
  const subtitle = settingSubtitle(def, ctx);
  const disabledKey = def.disabledIf?.(ctx) ?? null;
  const disabled = disabledKey !== null;
  const value = def.get?.(ctx);
  const set = (v: SettingValue) => {
    if (disabled || !def.set) return;
    handlers.apply(def.set(ctx, v));
  };
  const c = def.control;
  const testId = `setting-${def.id}`;
  const controlId = `${testId}-control`;
  const anyLocked =
    (c.kind === "chips" || c.kind === "select") && c.options(ctx).some((o) => o.locked);
  /** PAY (T7.1): locked options stay tappable and open the paywall instead of applying. */
  const choose = (opts: ChoiceOption[], v: SettingValue) => {
    const opt = opts.find((o) => String(o.value) === String(v));
    if (!opt) return;
    if (opt.locked) openPaywall(opt.lockFeature ?? null);
    else set(opt.value);
  };

  let inline: ReactNode = null;
  let block: ReactNode = null;
  let rowAction: (() => void) | null = null;
  let href: string | null = null;

  switch (c.kind) {
    case "toggle":
      inline = (
        <Toggle
          label={title}
          checked={Boolean(value)}
          onChange={(v) => set(v)}
          disabled={disabled}
          testId={controlId}
        />
      );
      break;
    case "select":
      inline = (
        <Select
          label={title}
          value={String(value ?? "")}
          options={c.options(ctx).map((o) => ({
            value: String(o.value),
            label: o.label,
            disabled: o.disabled && !o.locked,
          }))}
          onChange={(v) => choose(c.options(ctx), v)}
          disabled={disabled}
          testId={controlId}
        />
      );
      break;
    case "info":
      inline = (
        <span className="text-base text-fg-muted tabular" data-testid={controlId}>
          {String(value ?? "")}
        </span>
      );
      break;
    case "chips":
      block = (
        <ChipRow
          label={title}
          value={(value as string | number | undefined) ?? null}
          options={c.options(ctx).map((o) => ({
            value: o.value,
            label: o.label,
            locked: o.locked,
            disabled: disabled || (o.disabled && !o.locked),
          }))}
          onChange={(v) => choose(c.options(ctx), v)}
          testId={controlId}
        />
      );
      break;
    case "segmented":
      block = (
        <Segmented
          label={title}
          value={String(value ?? "")}
          options={c.options(ctx).map((o) => ({ value: String(o.value), label: o.label }))}
          onChange={(v) => set(v)}
          testId={controlId}
        />
      );
      break;
    case "thumbnails": {
      const options = c.options(ctx).map((o) => {
        const spec = o.preview;
        const preview =
          spec.type === "card" ? (
            <CardLayoutPreview kind={spec.kind} />
          ) : (
            (layoutThumbOptions(spec.players).find((x) => x.value === spec.id)?.preview ?? null)
          );
        return { value: String(o.value), label: o.label, preview };
      });
      block = (
        <ThumbnailPicker
          label={title}
          value={String(value ?? "")}
          options={options}
          onChange={(v) => set(v)}
          testId={controlId}
        />
      );
      break;
    }
    case "startValue": {
      const primary = primaryCounter(ctx.preset);
      block = (
        <StartValuePicker
          label={title}
          values={ctx.preset.quickStartValues ?? [primary.start]}
          value={Number(value ?? primary.start)}
          onChange={(v) => set(v)}
          testId={controlId}
        />
      );
      break;
    }
    case "preset":
      inline = (
        <span className="flex items-center gap-1 text-fg-muted">
          <span className="max-w-[9rem] truncate">{ctx.preset.name}</span>
          <ChevronRight aria-hidden />
        </span>
      );
      rowAction = handlers.openPresetPicker;
      break;
    case "subpage":
      inline = <ChevronRight aria-hidden className="text-fg-muted" />;
      rowAction = () => handlers.openSubPage(c.page);
      break;
    case "link":
      inline = disabled ? null : <ChevronRight aria-hidden className="text-fg-muted" />;
      href = disabled ? null : c.href;
      break;
    case "action":
      inline = disabled ? null : (
        <Button size="sm" onClick={() => handlers.runAction(c.action)} data-testid={controlId}>
          {t(`shell.settings.action.${c.action}`)}
        </Button>
      );
      break;
  }

  const helpButton = def.helpKey ? (
    <IconButton
      label={t("shell.settings.help", { title })}
      onClick={() => setHelp(true)}
      data-testid={`${testId}-help`}
      className="-my-3"
    >
      <CircleHelp aria-hidden size={20} className="text-fg-muted" />
    </IconButton>
  ) : null;
  const inlineHelp = !(rowAction && !disabled) && !href;

  const head = (
    <span className="flex min-w-0 flex-1 flex-col text-left">
      <span
        className={cn(
          "flex flex-wrap items-center gap-2 text-lg leading-tight",
          disabled ? "text-fg-muted" : "text-fg",
        )}
      >
        {title}
        {disabledKey && (
          <span className="rounded-full bg-surface-3 px-2 py-0.5 text-xs text-fg-muted">
            {t(disabledKey)}
          </span>
        )}
        {anyLocked && <LockBadge />}
        {inlineHelp && helpButton}
      </span>
      <span className="text-sm leading-snug text-fg-muted">{subtitle}</span>
    </span>
  );

  const rowCls = "flex min-h-16 w-full items-center gap-3 py-2";

  return (
    <div
      data-testid={testId}
      data-disabled={disabled ? "1" : "0"}
      className="border-b border-border/50"
    >
      {rowAction && !disabled ? (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={rowAction}
            className={cn(rowCls, "rounded-xl hover:bg-surface/60")}
            data-testid={controlId}
          >
            {head}
            {inline}
          </button>
          {helpButton}
        </div>
      ) : href ? (
        <Link
          href={href}
          className={cn(rowCls, "rounded-xl hover:bg-surface/60")}
          data-testid={controlId}
        >
          {head}
          {inline}
        </Link>
      ) : (
        <div className={rowCls}>
          {head}
          {inline}
        </div>
      )}
      {block && BLOCK.has(c.kind) && <div className="pb-3">{block}</div>}
      {def.helpKey && (
        <Sheet open={help} onClose={() => setHelp(false)} title={title} testId="setting-help">
          <p className="text-base leading-relaxed">{t(def.helpKey)}</p>
        </Sheet>
      )}
    </div>
  );
}
