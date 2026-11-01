"use client";
/** HIST-024 filter sheet + active filter chips. Free tier: date range only (§17.2). */
import { useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button, LockBadge, Sheet, Toggle } from "@/components/ui";
import { t } from "@/lib/i18n";
import type { GameRecord } from "@/lib/records";
import {
  activeFilterKeys,
  applyFilter,
  clearFilterKey,
  deckRows,
  filterOptions,
  freeTierFilter,
  playerRows,
  type FilterChipKey,
  type RecordFilter,
} from "@/lib/stats";
import { cn } from "@/lib/ui/cn";
import { dateInputValue, parseDateInput } from "./format";

function toggle<T>(list: T[] | undefined, v: T): T[] {
  const cur = list ?? [];
  return cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
}

function Chips<T extends string | number>({
  label,
  options,
  selected,
  onToggle,
  disabled,
  testId,
}: {
  label: string;
  options: { value: T; label: string }[];
  selected: T[] | undefined;
  onToggle: (v: T) => void;
  disabled?: boolean;
  testId: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2" data-testid={testId}>
      {options.map((o) => {
        const on = selected?.includes(o.value) ?? false;
        return (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            onClick={() => onToggle(o.value)}
            data-testid={`${testId}-${o.value}`}
            className={cn(
              "min-h-12 rounded-full px-4 disabled:opacity-40",
              on ? "bg-surface-3 ring-2 ring-accent" : "bg-surface-2",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Group({
  title,
  children,
  locked,
}: {
  title: string;
  children: ReactNode;
  locked?: boolean;
}) {
  return (
    <fieldset className="mt-4">
      <legend className="mb-2 flex items-center gap-2 text-fg-muted">
        {title}
        {locked && <LockBadge />}
      </legend>
      {children}
    </fieldset>
  );
}

export function FilterSheet({
  records,
  value,
  allowAll,
  onApply,
  onClose,
}: {
  records: GameRecord[];
  value: RecordFilter;
  allowAll: boolean;
  onApply: (f: RecordFilter) => void;
  onClose: () => void;
}) {
  const [f, setF] = useState<RecordFilter>(value);
  const opts = filterOptions(records);
  const people = playerRows(records, { includeDefaultNames: f.includeDefaultNames });
  const decks = deckRows(records, { includeDefaultNames: f.includeDefaultNames });
  const effective = allowAll ? f : freeTierFilter(f);
  const count = applyFilter(records, effective).length;
  const locked = !allowAll;
  return (
    <Sheet open onClose={onClose} title={t("historyPast.filterTitle")} testId="filter-sheet">
      <Group title={t("historyPast.f.dates")}>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-sm text-fg-muted">
            {t("historyPast.f.from")}
            <input
              type="date"
              value={dateInputValue(f.from)}
              onChange={(e) => setF({ ...f, from: parseDateInput(e.target.value) })}
              className="min-h-12 rounded-xl bg-surface-2 px-3 text-base text-fg"
              data-testid="filter-from"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-fg-muted">
            {t("historyPast.f.to")}
            <input
              type="date"
              value={dateInputValue(f.to === undefined ? undefined : f.to - 1)}
              onChange={(e) => setF({ ...f, to: parseDateInput(e.target.value, true) })}
              className="min-h-12 rounded-xl bg-surface-2 px-3 text-base text-fg"
              data-testid="filter-to"
            />
          </label>
        </div>
      </Group>
      {locked && (
        <p
          className="mt-3 flex items-center gap-2 text-sm text-fg-muted"
          data-testid="filter-pro-only"
        >
          <LockBadge /> {t("historyPast.f.proOnly")}
        </p>
      )}
      <Group title={t("historyPast.f.presets")} locked={locked}>
        <Chips
          label={t("historyPast.f.presets")}
          testId="filter-preset"
          disabled={locked}
          options={opts.presets.map((p) => ({ value: p.id, label: p.name }))}
          selected={f.presetIds}
          onToggle={(v) => setF({ ...f, presetIds: toggle(f.presetIds, v) })}
        />
      </Group>
      <Group title={t("historyPast.f.playerCount")} locked={locked}>
        <Chips
          label={t("historyPast.f.playerCount")}
          testId="filter-count"
          disabled={locked}
          options={opts.playerCounts.map((n) => ({ value: n, label: String(n) }))}
          selected={f.playerCounts}
          onToggle={(v) => setF({ ...f, playerCounts: toggle(f.playerCounts, v) })}
        />
      </Group>
      <Group title={t("historyPast.f.players")} locked={locked}>
        <Chips
          label={t("historyPast.f.players")}
          testId="filter-player"
          disabled={locked}
          options={people.map((p) => ({ value: p.identity, label: p.name }))}
          selected={f.identities}
          onToggle={(v) => setF({ ...f, identities: toggle(f.identities, v) })}
        />
      </Group>
      {decks.length > 0 && (
        <Group title={t("historyPast.f.decks")} locked={locked}>
          <Chips
            label={t("historyPast.f.decks")}
            testId="filter-deck"
            disabled={locked}
            options={decks.map((d) => ({ value: d.key, label: d.deckName }))}
            selected={f.decks}
            onToggle={(v) => setF({ ...f, decks: toggle(f.decks, v) })}
          />
        </Group>
      )}
      <Group title={t("historyPast.f.startValue")} locked={locked}>
        <Chips
          label={t("historyPast.f.startValue")}
          testId="filter-start"
          disabled={locked}
          options={opts.startValues.map((n) => ({ value: n, label: String(n) }))}
          selected={f.startValues}
          onToggle={(v) => setF({ ...f, startValues: toggle(f.startValues, v) })}
        />
      </Group>
      <Group title={t("historyPast.f.timer")} locked={locked}>
        <Chips
          label={t("historyPast.f.timer")}
          testId="filter-timer"
          disabled={locked}
          options={[
            { value: "any", label: t("historyPast.f.timer.any") },
            { value: "on", label: t("historyPast.f.timer.on") },
            { value: "off", label: t("historyPast.f.timer.off") },
          ]}
          selected={[f.timer ?? "any"]}
          onToggle={(v) => {
            const { timer: _t, ...rest } = f;
            setF(v === "any" ? rest : { ...rest, timer: v });
          }}
        />
      </Group>
      <div className="mt-4 flex min-h-12 items-center justify-between gap-3">
        <span className="flex items-center gap-2">
          {t("historyPast.f.winnerOnly")}
          {locked && <LockBadge />}
        </span>
        <Toggle
          checked={f.winnerOnly === true}
          disabled={locked}
          onChange={(v) => setF({ ...f, winnerOnly: v })}
          label={t("historyPast.f.winnerOnly")}
          testId="filter-winner-only"
        />
      </div>
      <div className="mt-2 flex min-h-12 items-center justify-between gap-3">
        <span>{t("historyPast.f.defaultNames")}</span>
        <Toggle
          checked={f.includeDefaultNames === true}
          onChange={(v) => setF({ ...f, includeDefaultNames: v })}
          label={t("historyPast.f.defaultNames")}
          testId="filter-default-names"
        />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button onClick={() => setF({})} data-testid="filter-reset">
          {t("historyPast.f.reset")}
        </Button>
        <Button
          variant="primary"
          data-testid="filter-apply"
          onClick={() => {
            onApply(f);
            onClose();
          }}
        >
          {t("historyPast.f.apply", { count })}
        </Button>
      </div>
    </Sheet>
  );
}

function chipLabel(key: FilterChipKey, f: RecordFilter, names: Map<string, string>): string {
  switch (key) {
    case "playerCounts":
      return t("historyPast.chip.playerCounts", { value: (f.playerCounts ?? []).join(", ") });
    case "identities":
      return t("historyPast.chip.identities", {
        value: (f.identities ?? []).map((id) => names.get(id) ?? id).join(", "),
      });
    case "decks":
      return t("historyPast.chip.decks", { value: (f.decks ?? []).length });
    case "startValues":
      return t("historyPast.chip.startValues", { value: (f.startValues ?? []).join(", ") });
    case "timer":
      return t(f.timer === "off" ? "historyPast.chip.timer.off" : "historyPast.chip.timer.on");
    case "date":
      return t("historyPast.chip.date");
    case "presetIds":
      return t("historyPast.chip.presetIds");
    case "winnerOnly":
      return t("historyPast.chip.winnerOnly");
    default:
      return t("historyPast.chip.includeDefaultNames");
  }
}

export function FilterChips({
  value,
  names,
  onChange,
}: {
  value: RecordFilter;
  names: Map<string, string>;
  onChange: (f: RecordFilter) => void;
}) {
  const keys = activeFilterKeys(value);
  if (keys.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2" data-testid="filter-chips">
      {keys.map((k) => {
        const label = chipLabel(k, value, names);
        return (
          <span
            key={k}
            className="inline-flex min-h-10 items-center gap-1 rounded-full bg-surface-2 pl-3 text-sm"
            data-testid={`filter-chip-${k}`}
          >
            {label}
            <button
              type="button"
              aria-label={t("historyPast.removeChip", { name: label })}
              onClick={() => onChange(clearFilterKey(value, k))}
              className="flex size-10 items-center justify-center rounded-full hover:bg-surface-3"
            >
              <X size={16} aria-hidden />
            </button>
          </span>
        );
      })}
      <button
        type="button"
        onClick={() => onChange({})}
        className="min-h-10 rounded-full px-3 text-sm text-accent"
        data-testid="filter-clear"
      >
        {t("historyPast.clearFilter")}
      </button>
    </div>
  );
}
