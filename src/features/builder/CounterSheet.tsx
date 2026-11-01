"use client";
/** Counter editor sheet (CUS-002, CUS-008): every PRD §11 counter field, edits apply live. */
import { Trash2 } from "lucide-react";
import { GameIcon } from "@/components/icons/GameIcon";
import { Button, Sheet, Toggle } from "@/components/ui";
import {
  AUTO_KO_MODES,
  COUNTER_KINDS,
  COUNTER_SCOPES,
  type AutoKOMode,
  type CounterDefinition,
  type CounterKind,
  type CounterScope,
  type Preset,
} from "@/engine";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/ui/cn";
import { Choice, FieldErrors, NumberField, SelectField, TextField, ToggleRow } from "./fields";
import {
  PICKER_ICONS,
  WIN_LOSS_RULES,
  applyRule,
  counterField,
  issuesFor,
  linkTargets,
  ruleOf,
  setKind,
  setPrimary,
  setScope,
  type DraftValidation,
  type WinLossRule,
} from "./model";

interface Props {
  counter: CounterDefinition | null;
  preset: Preset;
  validation: DraftValidation;
  onChange: (c: CounterDefinition) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export function CounterSheet({ counter, preset, validation, onChange, onDelete, onClose }: Props) {
  return (
    <Sheet
      open={counter !== null}
      onClose={onClose}
      title={counter ? counter.name || t("builder.counter.title") : t("builder.counter.title")}
      testId="counter-sheet"
    >
      {counter && (
        <CounterForm
          counter={counter}
          preset={preset}
          validation={validation}
          onChange={onChange}
          onDelete={onDelete}
          onClose={onClose}
        />
      )}
    </Sheet>
  );
}

function CounterForm({
  counter: c,
  preset,
  validation,
  onChange,
  onDelete,
  onClose,
}: Props & { counter: CounterDefinition }) {
  const err = (field: string) => issuesFor(validation, counterField(c.id, field));
  const set = (patch: Partial<CounterDefinition>) => onChange({ ...c, ...patch });
  const rule = ruleOf(c.threshold);
  const isNumber = c.kind === "number";
  const targets = linkTargets(preset, c.id);
  const enumDefaults = [t("builder.counter.enumDefaultA"), t("builder.counter.enumDefaultB")];

  return (
    <div className="flex flex-col gap-4 pt-2" data-testid="counter-form">
      <div className="grid grid-cols-[1fr_8rem] items-start gap-3">
        <TextField
          label={t("builder.counter.name")}
          value={c.name}
          onChange={(name) => set({ name })}
          maxLength={40}
          issues={err("name")}
          testId="counter-name"
        />
        <TextField
          label={t("builder.counter.shortName")}
          hint={t("builder.counter.shortNameHint")}
          value={c.shortName ?? ""}
          onChange={(shortName) => set({ shortName })}
          issues={err("shortName")}
          testId="counter-short"
        />
      </div>
      <div className="flex flex-col gap-1">
        <span id="counter-icon-label" className="text-sm text-fg-muted">
          {t("builder.counter.icon")}
        </span>
        <div
          role="radiogroup"
          aria-labelledby="counter-icon-label"
          className="grid grid-cols-[repeat(auto-fill,minmax(3rem,1fr))] gap-1"
          data-testid="counter-icons"
        >
          {PICKER_ICONS.map((icon) => (
            <button
              key={icon}
              type="button"
              role="radio"
              aria-checked={c.icon === icon}
              aria-label={t("builder.counter.iconLabel", { name: icon })}
              data-testid={`counter-icon-${icon}`}
              onClick={() => set({ icon })}
              className={cn(
                "flex size-12 items-center justify-center rounded-xl",
                "focus-visible:outline-2 focus-visible:outline-accent",
                c.icon === icon ? "bg-surface-3 ring-2 ring-accent" : "bg-surface-2",
              )}
            >
              <GameIcon id={icon} size={22} />
            </button>
          ))}
        </div>
      </div>

      <Choice
        label={t("builder.counter.kind")}
        value={c.kind}
        options={COUNTER_KINDS.map((k) => ({ value: k, label: t(`builder.kind.${k}`) }))}
        onChange={(k: CounterKind) => onChange(setKind(c, k, enumDefaults))}
        testId="counter-kind"
      />
      <Choice
        label={t("builder.counter.scope")}
        value={c.scope}
        options={COUNTER_SCOPES.map((s) => ({ value: s, label: t(`builder.scope.${s}`) }))}
        onChange={(s: CounterScope) => onChange(setScope(c, s))}
        testId="counter-scope"
        columns
      />

      {c.kind === "enum" && (
        <TextField
          label={t("builder.counter.enumValues")}
          multiline
          value={(c.enumValues ?? []).join("\n")}
          onChange={(text) => set({ enumValues: text.split("\n") })}
          issues={err("enum")}
          testId="counter-enum"
        />
      )}

      {c.kind === "boolean" && (
        <ToggleRow label={t("builder.counter.startOn")}>
          <Toggle
            checked={c.start === 1}
            onChange={(on) => set({ start: on ? 1 : 0 })}
            label={t("builder.counter.startOn")}
            testId="counter-start-on"
          />
        </ToggleRow>
      )}

      {isNumber && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <NumberField
              label={t("builder.counter.start")}
              value={c.start}
              onChange={(v) => v !== null && set({ start: v })}
              issues={err("start")}
              testId="counter-start"
            />
            <NumberField
              label={t("builder.counter.min")}
              value={c.min}
              nullable
              onChange={(min) => set({ min })}
              testId="counter-min"
            />
            <NumberField
              label={t("builder.counter.max")}
              value={c.max}
              nullable
              onChange={(max) => set({ max })}
              testId="counter-max"
            />
          </div>
          <FieldErrors id={`${c.id}-range-err`} issues={err("range")} />
          <Choice
            label={t("builder.counter.direction")}
            value={c.direction}
            options={(["down", "up"] as const).map((d) => ({
              value: d,
              label: t(`builder.direction.${d}`),
            }))}
            onChange={(direction) => set({ direction })}
            testId="counter-direction"
          />
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label={t("builder.counter.step")}
              value={c.step}
              onChange={(v) => v !== null && set({ step: v })}
              testId="counter-step"
            />
            <NumberField
              label={t("builder.counter.holdStep")}
              value={c.holdStep ?? c.step * 10}
              onChange={(v) => v !== null && set({ holdStep: v })}
              testId="counter-hold-step"
            />
          </div>
          <FieldErrors id={`${c.id}-step-err`} issues={err("step")} />

          <SelectField
            label={t("builder.counter.rule")}
            value={rule}
            options={WIN_LOSS_RULES.map((r) => ({ value: r, label: t(`builder.rule.${r}`) }))}
            onChange={(r: WinLossRule) => onChange(applyRule(c, r))}
            testId="counter-rule"
          />
          {c.threshold && (
            <div className="grid grid-cols-2 gap-3">
              <NumberField
                label={t("builder.counter.ruleValue")}
                value={c.threshold.value}
                onChange={(v) => v !== null && onChange(applyRule(c, rule, v))}
                testId="counter-rule-value"
              />
              <SelectField
                label={t("builder.counter.ruleApply")}
                value={c.threshold.autoApply ?? "auto"}
                options={AUTO_KO_MODES.map((m) => ({ value: m, label: t(`builder.apply.${m}`) }))}
                onChange={(m: AutoKOMode) => onChange(applyRule(c, rule, undefined, m))}
                testId="counter-rule-apply"
              />
            </div>
          )}
          <FieldErrors id={`${c.id}-threshold-err`} issues={err("threshold")} />
        </>
      )}

      <ToggleRow label={t("builder.counter.primary")}>
        <Toggle
          checked={c.isPrimary === true}
          onChange={(on) => onChange(setPrimary(c, on))}
          label={t("builder.counter.primary")}
          testId="counter-primary"
        />
      </ToggleRow>
      <FieldErrors id={`${c.id}-primary-err`} issues={err("primary")} />

      {!c.isPrimary && (
        <>
          <Choice
            label={t("builder.counter.display")}
            value={c.visibility === "panel" ? "panel" : "badge"}
            options={(["badge", "panel"] as const).map((v) => ({
              value: v,
              label: t(`builder.display.${v}`),
            }))}
            onChange={(visibility) => set({ visibility })}
            testId="counter-display"
          />
          <ToggleRow label={t("builder.counter.hideDefault")}>
            <Toggle
              checked={!c.showWhenDefault}
              onChange={(hide) => set({ showWhenDefault: !hide })}
              label={t("builder.counter.hideDefault")}
              testId="counter-hide-default"
            />
          </ToggleRow>
          <ToggleRow label={t("builder.counter.enabled")}>
            <Toggle
              checked={c.enabledByDefault}
              onChange={(enabledByDefault) => set({ enabledByDefault })}
              label={t("builder.counter.enabled")}
              testId="counter-enabled"
            />
          </ToggleRow>
        </>
      )}

      {(c.scope === "player" || c.scope === "global") && (
        <ToggleRow label={t("builder.counter.resetTurn")} hint={t("builder.counter.resetTurnHint")}>
          <Toggle
            checked={c.resetOnTurnPass === true}
            onChange={(resetOnTurnPass) => set({ resetOnTurnPass })}
            label={t("builder.counter.resetTurn")}
            testId="counter-reset-turn"
          />
        </ToggleRow>
      )}

      {isNumber && c.scope !== "global" && (
        <div className="grid grid-cols-[1fr_8rem] gap-3">
          <SelectField
            label={t("builder.counter.link")}
            value={c.linkedTo?.counterId ?? ""}
            options={[
              { value: "", label: t("builder.counter.linkNone") },
              ...targets.map((o) => ({ value: o.id, label: o.name })),
            ]}
            onChange={(id: string) => {
              if (!id) {
                const { linkedTo: _l, ...rest } = c;
                onChange(rest);
              } else
                set({
                  linkedTo: { counterId: id, factor: c.linkedTo?.factor ?? -1, optional: false },
                });
            }}
            issues={err("link")}
            testId="counter-link"
          />
          {c.linkedTo && (
            <NumberField
              label={t("builder.counter.linkFactor")}
              value={c.linkedTo.factor}
              integer={false}
              onChange={(v) =>
                v !== null && c.linkedTo && set({ linkedTo: { ...c.linkedTo, factor: v } })
              }
              testId="counter-link-factor"
            />
          )}
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <Button
          variant="danger"
          icon={<Trash2 size={18} aria-hidden />}
          onClick={() => onDelete(c.id)}
          data-testid="counter-delete"
        >
          {t("builder.counter.delete")}
        </Button>
        <Button variant="primary" className="flex-1" onClick={onClose} data-testid="counter-done">
          {t("builder.counter.done")}
        </Button>
      </div>
    </div>
  );
}
