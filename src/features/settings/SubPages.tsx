"use client";
/**
 * Settings sub-pages (§13.1-A): Seats (LAY-005 reorder + rename, live), Per-player starting
 * values (PRE-013), Win/loss conditions (CTR-003 thresholdOverrides), Counters in this game
 * (CTR-001). Structural sub-pages edit a local copy and apply once (one SET-011 confirm).
 */
import { ArrowDown, ArrowUp } from "lucide-react";
import { useState } from "react";
import { Button, IconButton, PageShell, Stepper, Toggle } from "@/components/ui";
import { primaryCounter } from "@/engine";
import { t } from "@/lib/i18n";
import { useDispatch } from "@/state/gameStore";
import { setOrOmit, type GameDraft } from "./draft";
import { thresholdCounters, type SettingsContext, type SubPageId } from "./registry";

interface Props {
  page: SubPageId;
  ctx: SettingsContext;
  onClose: () => void;
  applyDraft: (draft: GameDraft) => void;
}

const TITLES = {
  seats: "shell.settings.seats.title",
  perSeatStart: "shell.settings.perSeatStart.title",
  thresholds: "shell.settings.thresholds.title",
  counters: "shell.settings.counters.title",
} as const;

export function SettingsSubPage({ page, ctx, onClose, applyDraft }: Props) {
  const done = (d: GameDraft) => {
    applyDraft(d);
    onClose();
  };
  return (
    <PageShell title={t(TITLES[page])} onBack={onClose} testId={`settings-sub-${page}`}>
      {page === "seats" && <SeatsPage ctx={ctx} />}
      {page === "thresholds" && <ThresholdsPage ctx={ctx} onApply={done} />}
      {page === "counters" && <CountersPage ctx={ctx} onApply={done} />}
      {page === "perSeatStart" && <PerSeatStartPage ctx={ctx} onApply={done} />}
    </PageShell>
  );
}

function ApplyBar({ onApply, dirty }: { onApply: () => void; dirty: boolean }) {
  return (
    <div className="sticky bottom-0 mt-4 bg-bg/95 py-3 backdrop-blur">
      <Button
        variant="primary"
        size="lg"
        block
        disabled={!dirty}
        onClick={onApply}
        data-testid="settings-sub-apply"
      >
        {t("shell.settings.apply")}
      </Button>
      <p className="mt-2 text-center text-sm text-fg-muted">{t("shell.settings.applyHint")}</p>
    </div>
  );
}

function SeatsPage({ ctx }: { ctx: SettingsContext }) {
  const dispatch = useDispatch();
  const seats = ctx.game?.seats ?? [];
  const move = (i: number, d: -1 | 1) => {
    const order = seats.map((s) => s.id);
    const j = i + d;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j]!, order[i]!];
    dispatch({ type: "SEAT_REORDER", order });
  };
  return (
    <ul className="mt-4 flex flex-col gap-2">
      <li className="text-sm text-fg-muted">{t("shell.settings.seats.subtitle")}</li>
      {seats.map((s, i) => (
        <li
          key={s.id}
          className="flex items-center gap-2 rounded-2xl bg-surface p-2"
          data-testid={`settings-seat-${i}`}
        >
          <span
            aria-hidden
            className="size-4 shrink-0 rounded-full"
            style={{ background: s.color }}
          />
          <input
            type="text"
            defaultValue={s.name}
            maxLength={24}
            aria-label={t("shell.setup.seat.name", { n: i + 1 })}
            data-testid={`settings-seat-${i}-name`}
            onBlur={(e) => {
              const name = e.target.value.trim();
              if (name && name !== s.name) dispatch({ type: "SEAT_RENAME", seatId: s.id, name });
            }}
            className="min-h-12 min-w-0 flex-1 rounded-xl bg-surface-2 px-3 text-lg text-fg focus-visible:outline-2 focus-visible:outline-accent"
          />
          <IconButton
            label={t("shell.setup.seat.up", { n: i + 1 })}
            disabled={i === 0}
            className="disabled:opacity-30"
            onClick={() => move(i, -1)}
            data-testid={`settings-seat-${i}-up`}
          >
            <ArrowUp aria-hidden />
          </IconButton>
          <IconButton
            label={t("shell.setup.seat.down", { n: i + 1 })}
            disabled={i === seats.length - 1}
            className="disabled:opacity-30"
            onClick={() => move(i, 1)}
            data-testid={`settings-seat-${i}-down`}
          >
            <ArrowDown aria-hidden />
          </IconButton>
        </li>
      ))}
    </ul>
  );
}

function ThresholdsPage({
  ctx,
  onApply,
}: {
  ctx: SettingsContext;
  onApply: (d: GameDraft) => void;
}) {
  const [overrides, setOverrides] = useState(ctx.draft.thresholdOverrides);
  const defs = thresholdCounters(ctx.preset).filter((d) =>
    ctx.draft.enabledCounters.includes(d.id),
  );
  const dirty = JSON.stringify(overrides) !== JSON.stringify(ctx.draft.thresholdOverrides);
  return (
    <>
      <p className="mt-4 text-sm text-fg-muted">{t("shell.settings.thresholds.subtitle")}</p>
      <ul className="flex flex-col">
        {defs.map((d) => {
          const rule = d.threshold!;
          const has = d.id in overrides;
          const v = has ? overrides[d.id] : rule.value;
          const on = v !== null && v !== undefined;
          const value = on ? (v as number) : rule.value;
          return (
            <li
              key={d.id}
              className="flex flex-col gap-2 border-b border-border/50 py-3"
              data-testid={`threshold-${d.id}`}
            >
              <div className="flex items-center gap-3">
                <span className="flex flex-1 flex-col">
                  <span className="text-lg">{d.name}</span>
                  <span className="text-sm text-fg-muted">
                    {t(rule.outcome === "lose" ? "shell.threshold.lose" : "shell.threshold.win", {
                      counter: d.name,
                      cmp: rule.comparator === "<=" ? "≤" : "≥",
                      value,
                    })}
                  </span>
                </span>
                <Toggle
                  label={d.name}
                  checked={on}
                  testId={`threshold-${d.id}-toggle`}
                  onChange={(next) =>
                    setOverrides((o) =>
                      next ? setOrOmit(o, d.id, value, rule.value) : { ...o, [d.id]: null },
                    )
                  }
                />
              </div>
              {on && (
                <Stepper
                  label={d.name}
                  value={value}
                  step={d.step}
                  testId={`threshold-${d.id}-value`}
                  onChange={(n) => setOverrides((o) => setOrOmit(o, d.id, n, rule.value))}
                />
              )}
            </li>
          );
        })}
      </ul>
      <ApplyBar
        dirty={dirty}
        onApply={() => onApply({ ...ctx.draft, thresholdOverrides: overrides })}
      />
    </>
  );
}

function CountersPage({ ctx, onApply }: { ctx: SettingsContext; onApply: (d: GameDraft) => void }) {
  const [enabled, setEnabled] = useState(ctx.draft.enabledCounters);
  const defs = ctx.preset.counters.filter((c) => !c.isPrimary);
  const dirty = [...enabled].sort().join() !== [...ctx.draft.enabledCounters].sort().join();
  return (
    <>
      <p className="mt-4 text-sm text-fg-muted">{t("shell.settings.counters.subtitle")}</p>
      <ul className="flex flex-col">
        {defs.map((d) => (
          <li
            key={d.id}
            className="flex min-h-16 items-center gap-3 border-b border-border/50 py-2"
          >
            <span className="flex flex-1 flex-col">
              <span className="text-lg">{d.name}</span>
              {d.description && <span className="text-sm text-fg-muted">{d.description}</span>}
            </span>
            <Toggle
              label={d.name}
              checked={enabled.includes(d.id)}
              testId={`counter-toggle-${d.id}`}
              onChange={(on) =>
                setEnabled((e) => (on ? [...e, d.id] : e.filter((id) => id !== d.id)))
              }
            />
          </li>
        ))}
      </ul>
      <ApplyBar dirty={dirty} onApply={() => onApply({ ...ctx.draft, enabledCounters: enabled })} />
    </>
  );
}

function PerSeatStartPage({
  ctx,
  onApply,
}: {
  ctx: SettingsContext;
  onApply: (d: GameDraft) => void;
}) {
  const primary = primaryCounter(ctx.preset);
  const base = ctx.draft.startOverrides[primary.id] ?? primary.start;
  const [perSeat, setPerSeat] = useState(ctx.draft.perSeatStart);
  const dirty = JSON.stringify(perSeat) !== JSON.stringify(ctx.draft.perSeatStart);
  return (
    <>
      <p className="mt-4 text-sm text-fg-muted">{t("shell.settings.perSeatStart.subtitle")}</p>
      <ul className="flex flex-col">
        {(ctx.game?.seats ?? []).map((s) => {
          const v = perSeat[s.id]?.[primary.id] ?? base;
          return (
            <li
              key={s.id}
              className="flex min-h-16 items-center gap-3 border-b border-border/50 py-2"
            >
              <span className="flex-1 text-lg">{s.name}</span>
              <Stepper
                label={s.name}
                value={v}
                step={primary.holdStep ?? primary.step}
                min={1}
                onChange={(n) =>
                  setPerSeat((p) => ({ ...p, [s.id]: { ...p[s.id], [primary.id]: n } }))
                }
              />
            </li>
          );
        })}
      </ul>
      <ApplyBar dirty={dirty} onApply={() => onApply({ ...ctx.draft, perSeatStart: perSeat })} />
    </>
  );
}
