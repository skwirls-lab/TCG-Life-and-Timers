"use client";
/**
 * /builder/edit?id= (T3.6): preset meta, counters (reorder + counter sheet), timer defaults, live
 * preview, inline validation with a summary, save (disabled while invalid), unsaved-changes
 * guard, and "Start a game with this preset" (CUS-001..005, CUS-008, CUS-010).
 */
import { AlertCircle, ChevronDown, ChevronUp, Play, Plus, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { GameIcon } from "@/components/icons/GameIcon";
import {
  Button,
  IconButton,
  PageShell,
  SectionHeader,
  Sheet,
  Stepper,
  useSnackbar,
} from "@/components/ui";
import {
  TIMEOUT_ACTIONS,
  TIMER_MODES,
  type CounterDefinition,
  type Preset,
  type TimeoutAction,
  type TimerConfig,
  type TimerMode,
} from "@/engine";
import { layoutVariants } from "@/engine/layout";
import {
  PresetValidationError,
  countCustomPresets,
  getCustomPreset,
  saveCustomPreset,
} from "@/lib/customPresets";
import { afterOverlayClose } from "@/features/settings/afterOverlayClose";
import { confirmReset } from "@/features/history-past/whoWon";
import { activeGame } from "@/features/setup/startGame";
import { useLimit } from "@/lib/entitlements/store";
import { t, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/ui/cn";
import { track } from "@/lib/analytics/telemetry";
import { flushAutosave, useGameStore } from "@/state/gameStore";
import { CounterSheet } from "./CounterSheet";
import { NumberField, SelectField, TextField } from "./fields";
import {
  blankPreset,
  canCreateMore,
  counterHasIssues,
  issuesFor,
  moveCounter,
  newCounter,
  normalizeDraft,
  parseNumberList,
  removeCounter,
  snapshot,
  upsertCounter,
  validateDraft,
} from "./model";
import { LimitNotice } from "./LimitNotice";
import { PreviewTile } from "./PreviewTile";

const MIN = 60_000;

type LoadState =
  | { status: "loading" }
  | { status: "notFound" }
  | { status: "ready"; draft: Preset; savedSnap: string; stored: boolean };

function words() {
  return { win: t("builder.word.win"), lose: t("builder.word.lose") };
}

function readId(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("id");
}

export function PresetEditor() {
  const router = useRouter();
  const limit = useLimit("customPresets");
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [count, setCount] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const show = useSnackbar((s) => s.show);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const id = readId();
      const n = await countCustomPresets().catch(() => 0);
      const existing = id ? await getCustomPreset(id).catch(() => undefined) : undefined;
      if (cancelled) return;
      setCount(n);
      if (id && !existing) return setState({ status: "notFound" });
      const draft =
        existing ??
        blankPreset({
          presetName: t("builder.editor.defaultName"),
          game: t("builder.editor.defaultGame"),
          primaryName: t("builder.editor.defaultPrimary"),
        });
      setState({ status: "ready", draft, savedSnap: snapshot(draft), stored: !!existing });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const ready = state.status === "ready" ? state : null;
  const draft = ready?.draft ?? null;
  const dirty = !!ready && snapshot(ready.draft) !== ready.savedSnap;
  const validation = useMemo(() => (draft ? validateDraft(draft, words()) : null), [draft]);
  const blocked = !!ready && !ready.stored && !canCreateMore(count, limit);

  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [dirty]);

  const update = (fn: (p: Preset) => Preset) =>
    setState((s) => (s.status === "ready" ? { ...s, draft: fn(s.draft) } : s));

  const leave = () => router.push("/builder");
  const back = () => (dirty ? setConfirmDiscard(true) : leave());

  async function save(): Promise<Preset | null> {
    if (!ready || !validation?.ok || blocked) return null;
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await saveCustomPreset(normalizeDraft(ready.draft, words()));
      setState({ status: "ready", draft: saved, savedSnap: snapshot(saved), stored: true });
      if (!ready.stored) {
        track("preset_custom_created"); // LEG-004: no-op without analytics config + consent
        setCount((n) => n + 1);
        window.history.replaceState(null, "", `/builder/edit?id=${encodeURIComponent(saved.id)}`);
      }
      show({ message: t("builder.editor.saved", { name: saved.name }) });
      return saved;
    } catch (e) {
      setSaveError(e instanceof PresetValidationError ? e.errors.join("; ") : String(e));
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function play() {
    const preset = dirty || !ready?.stored ? await save() : ready.draft;
    if (!preset) return;
    // HIST-031: the game being replaced goes through Who won? (closed prompt = keep playing it)
    if (!(await confirmReset(await activeGame()))) return;
    useGameStore.getState().newGame({ preset });
    await flushAutosave().catch(() => undefined);
    router.push("/play");
  }

  const title =
    ready && ready.stored ? t("builder.editor.editTitle") : t("builder.editor.newTitle");

  if (!draft || !validation) {
    return (
      <PageShell title={title} backHref="/builder" onBack={leave} testId="editor">
        <p className="pt-6 text-fg-muted" data-testid="editor-status">
          {state.status === "notFound" ? t("builder.editor.notFound") : t("builder.loading")}
        </p>
      </PageShell>
    );
  }

  const editingCounter = editing ? (draft.counters.find((c) => c.id === editing) ?? null) : null;
  const allIssues = validation.issues;
  const canSave = validation.ok && !blocked && !saving;

  return (
    <PageShell title={title} backHref="/builder" onBack={back} testId="editor">
      <div className="flex flex-col gap-2 pt-2" data-ready="1" data-testid="editor-form">
        {blocked && <LimitNotice limit={limit} />}

        <SectionHeader title={t("builder.editor.meta")} />
        <div className="flex flex-col gap-3">
          <TextField
            label={t("builder.editor.name")}
            value={draft.name}
            maxLength={60}
            onChange={(name) => update((p) => ({ ...p, name }))}
            issues={issuesFor(validation, "name")}
            testId="editor-name"
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TextField
              label={t("builder.editor.game")}
              value={draft.game}
              maxLength={60}
              onChange={(game) => update((p) => ({ ...p, game }))}
              issues={issuesFor(validation, "game")}
              testId="editor-game"
            />
            <TextField
              label={t("builder.editor.format")}
              value={draft.format ?? ""}
              maxLength={60}
              onChange={(format) => update((p) => ({ ...p, format }))}
              testId="editor-format"
            />
          </div>
          <TextField
            label={t("builder.editor.description")}
            value={draft.description}
            multiline
            maxLength={500}
            onChange={(description) => update((p) => ({ ...p, description }))}
            testId="editor-description"
          />
          <TextField
            label={t("builder.editor.rulesSummary")}
            hint={t("builder.editor.rulesSummaryHint")}
            value={draft.rulesSummary}
            multiline
            maxLength={500}
            onChange={(rulesSummary) => update((p) => ({ ...p, rulesSummary }))}
            testId="editor-rules-summary"
          />
          <TextField
            label={t("builder.editor.rulesUrl")}
            value={draft.rulesUrl ?? ""}
            onChange={(rulesUrl) => update((p) => ({ ...p, rulesUrl }))}
            issues={issuesFor(validation, "rulesUrl")}
            testId="editor-rules-url"
          />
          <PlayersFields draft={draft} update={update} />
          <ErrorList issues={issuesFor(validation, "players")} />
          <QuickStartField draft={draft} update={update} />
          <ErrorList issues={issuesFor(validation, "quickStart")} />
          <LayoutFields draft={draft} update={update} />
        </div>

        <SectionHeader title={t("builder.editor.preview")} />
        <PreviewTile preset={draft} />

        <SectionHeader title={t("builder.editor.counters")} />
        <p className="text-sm text-fg-subtle">{t("builder.editor.countersHint")}</p>
        <ErrorList issues={issuesFor(validation, "primary")} testId="editor-primary-error" />
        <ol className="flex flex-col gap-2" data-testid="editor-counters">
          {draft.counters.map((c, i) => (
            <CounterRow
              key={c.id}
              counter={c}
              index={i}
              last={i === draft.counters.length - 1}
              invalid={counterHasIssues(validation, c.id)}
              onEdit={() => setEditing(c.id)}
              onMove={(to) => update((p) => moveCounter(p, i, to))}
            />
          ))}
        </ol>
        <Button
          variant="outline"
          icon={<Plus size={20} aria-hidden />}
          onClick={() => {
            const c = newCounter(draft.counters, { baseName: t("builder.editor.counterName") });
            update((p) => upsertCounter(p, c));
            setEditing(c.id);
          }}
          data-testid="editor-add-counter"
        >
          {t("builder.editor.addCounter")}
        </Button>

        <SectionHeader title={t("builder.editor.timer")} />
        <TimerFields
          timer={draft.defaults.timer}
          onChange={(timer) => update((p) => ({ ...p, defaults: { ...p.defaults, timer } }))}
        />

        {(allIssues.length > 0 || validation.other.length > 0 || saveError) && (
          <div
            role="alert"
            data-testid="editor-errors"
            className="mt-6 rounded-2xl border border-danger/50 bg-danger/10 p-4"
          >
            <p className="flex items-center gap-2 font-semibold text-danger">
              <AlertCircle size={18} aria-hidden />
              {t("builder.editor.errorsTitle")}
            </p>
            <ul className="mt-2 list-disc pl-5 text-sm">
              {allIssues.map((i, k) => (
                <li key={`${i.field}-${k}`}>{issueLabel(draft, i.field, t(i.message, i.vars))}</li>
              ))}
              {validation.other.map((m) => (
                <li key={m}>{m}</li>
              ))}
              {saveError && <li>{t("builder.err.saveFailed", { reason: saveError })}</li>}
            </ul>
          </div>
        )}

        <div className="sticky bottom-0 mt-6 flex flex-col gap-2 bg-bg/95 py-3 backdrop-blur">
          <Button
            variant="primary"
            size="lg"
            icon={<Save size={20} aria-hidden />}
            disabled={!canSave || (!dirty && !!ready?.stored)}
            onClick={() => void save()}
            data-testid="editor-save"
          >
            {t("builder.editor.save")}
          </Button>
          <Button
            variant="secondary"
            icon={<Play size={20} aria-hidden />}
            disabled={!canSave}
            onClick={() => void play()}
            data-testid="editor-play"
          >
            {t("builder.editor.play")}
          </Button>
        </div>
      </div>

      <CounterSheet
        counter={editingCounter}
        preset={draft}
        validation={validation}
        onChange={(c) => update((p) => upsertCounter(p, c))}
        onDelete={(id) => {
          setEditing(null);
          update((p) => removeCounter(p, id));
        }}
        onClose={() => setEditing(null)}
      />

      <Sheet
        open={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        title={t("builder.editor.discardTitle")}
        testId="editor-discard-dialog"
      >
        <p className="pb-4 text-fg-muted">{t("builder.editor.discardBody")}</p>
        <div className="flex gap-2">
          <Button
            className="flex-1"
            onClick={() => setConfirmDiscard(false)}
            data-testid="editor-discard-cancel"
          >
            {t("builder.editor.keepEditing")}
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            onClick={() => {
              setConfirmDiscard(false);
              afterOverlayClose(leave);
            }}
            data-testid="editor-discard-confirm"
          >
            {t("builder.editor.discard")}
          </Button>
        </div>
      </Sheet>
    </PageShell>
  );
}

/** "Lore: The starting value is outside …" for counter fields. */
function issueLabel(p: Preset, field: string, message: string): string {
  const m = /^c:([^:]+):/.exec(field);
  const counter = m ? p.counters.find((c) => c.id === m[1]) : undefined;
  return counter ? `${counter.name || t("builder.counter.title")}: ${message}` : message;
}

function ErrorList({ issues, testId }: { issues: ReturnType<typeof issuesFor>; testId?: string }) {
  if (issues.length === 0) return null;
  return (
    <ul data-testid={testId ?? "field-error"} className="flex flex-col gap-0.5">
      {issues.map((i) => (
        <li key={i.message} className="text-sm text-danger">
          {t(i.message, i.vars)}
        </li>
      ))}
    </ul>
  );
}

type Update = (fn: (p: Preset) => Preset) => void;

function PlayersFields({ draft, update }: { draft: Preset; update: Update }) {
  const rows: { key: "minPlayers" | "maxPlayers" | "defaultPlayers"; label: MessageKey }[] = [
    { key: "minPlayers", label: "builder.editor.minPlayers" },
    { key: "maxPlayers", label: "builder.editor.maxPlayers" },
    { key: "defaultPlayers", label: "builder.editor.defaultPlayers" },
  ];
  return (
    <div className="flex flex-col">
      {rows.map((r) => (
        <div key={r.key} className="flex min-h-14 items-center gap-3">
          <span className="flex-1 text-base">{t(r.label)}</span>
          <Stepper
            value={draft[r.key]}
            min={1}
            max={8}
            label={t(r.label)}
            onChange={(v) => update((p) => ({ ...p, [r.key]: v }))}
            testId={`editor-${r.key}`}
          />
        </div>
      ))}
    </div>
  );
}

function QuickStartField({ draft, update }: { draft: Preset; update: Update }) {
  const external = (draft.quickStartValues ?? []).join(", ");
  const [text, setText] = useState(external);
  const [prev, setPrev] = useState(external);
  if (external !== prev) {
    setPrev(external);
    if (parseNumberList(text).join(", ") !== external) setText(external);
  }
  return (
    <TextField
      label={t("builder.editor.quickStart")}
      hint={t("builder.editor.quickStartHint")}
      value={text}
      onChange={(s) => {
        setText(s);
        update((p) => ({ ...p, quickStartValues: parseNumberList(s) }));
      }}
      testId="editor-quick-start"
    />
  );
}

function LayoutFields({ draft, update }: { draft: Preset; update: Update }) {
  const counts: number[] = [];
  for (let n = Math.max(1, draft.minPlayers); n <= Math.min(8, draft.maxPlayers); n++)
    counts.push(n);
  if (counts.length === 0) return null;
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="pb-1 text-sm text-fg-muted">{t("builder.editor.layouts")}</legend>
      <div className="grid grid-cols-2 gap-3">
        {counts.map((n) => (
          <SelectField
            key={n}
            label={t("builder.editor.layoutFor", { count: n })}
            value={draft.defaults.layoutByPlayers?.[String(n)] ?? ""}
            options={[
              { value: "", label: t("builder.editor.layoutDefault") },
              ...layoutVariants(n).map((v) => ({ value: v.id, label: t(v.label as MessageKey) })),
            ]}
            onChange={(id: string) =>
              update((p) => {
                const map = Object.fromEntries(
                  Object.entries(p.defaults.layoutByPlayers ?? {}).filter(([k]) => k !== String(n)),
                );
                if (id) map[String(n)] = id;
                const { layoutByPlayers: _old, ...rest } = p.defaults;
                return {
                  ...p,
                  defaults: Object.keys(map).length ? { ...rest, layoutByPlayers: map } : rest,
                };
              })
            }
            testId={`editor-layout-${n}`}
          />
        ))}
      </div>
    </fieldset>
  );
}

const hasBank = (m: TimerMode) => m === "bank" || m === "bankIncrement" || m === "bankDelay";
const hasPerTurn = (m: TimerMode) => m === "perTurn" || m === "perTurnReserve";

function TimerFields({
  timer,
  onChange,
}: {
  timer: TimerConfig;
  onChange: (t: TimerConfig) => void;
}) {
  const set = (patch: Partial<TimerConfig>) => onChange({ ...timer, ...patch });
  const m = timer.mode;
  return (
    <div className="flex flex-col gap-3">
      <SelectField
        label={t("builder.editor.timerMode")}
        value={m}
        options={TIMER_MODES.map((mode) => ({ value: mode, label: t(`builder.mode.${mode}`) }))}
        onChange={(mode: TimerMode) => set({ mode })}
        testId="editor-timer-mode"
      />
      <div className="grid grid-cols-2 gap-3">
        {hasBank(m) && (
          <NumberField
            label={t("builder.editor.bank")}
            value={Math.round(timer.bankMs / MIN)}
            onChange={(v) => v !== null && v >= 0 && set({ bankMs: v * MIN })}
            testId="editor-timer-bank"
          />
        )}
        {m === "bankIncrement" && (
          <NumberField
            label={t("builder.editor.increment")}
            value={Math.round(timer.incrementMs / 1000)}
            onChange={(v) => v !== null && v >= 0 && set({ incrementMs: v * 1000 })}
            testId="editor-timer-increment"
          />
        )}
        {hasPerTurn(m) && (
          <NumberField
            label={t("builder.editor.perTurn")}
            value={Math.round(timer.perTurnMs / MIN)}
            onChange={(v) => v !== null && v >= 0 && set({ perTurnMs: v * MIN })}
            testId="editor-timer-perturn"
          />
        )}
      </div>
      {m !== "off" && m !== "countup" && (
        <SelectField
          label={t("builder.editor.timeout")}
          value={timer.timeoutAction}
          options={TIMEOUT_ACTIONS.map((a) => ({ value: a, label: t(`builder.timeout.${a}`) }))}
          onChange={(timeoutAction: TimeoutAction) => set({ timeoutAction })}
          testId="editor-timer-timeout"
        />
      )}
    </div>
  );
}

function CounterRow({
  counter: c,
  index,
  last,
  invalid,
  onEdit,
  onMove,
}: {
  counter: CounterDefinition;
  index: number;
  last: boolean;
  invalid: boolean;
  onEdit: () => void;
  onMove: (to: number) => void;
}) {
  const name = c.name || t("builder.counter.title");
  return (
    <li
      data-testid={`editor-counter-${index}`}
      data-counter-id={c.id}
      className={cn(
        "flex items-center gap-1 rounded-2xl bg-surface px-2",
        invalid && "ring-1 ring-danger",
      )}
    >
      <button
        type="button"
        onClick={onEdit}
        data-testid={`editor-counter-${index}-edit`}
        className="flex min-h-16 min-w-0 flex-1 items-center gap-3 rounded-xl px-2 text-left focus-visible:outline-2 focus-visible:outline-accent"
      >
        <GameIcon id={c.icon} size={24} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-lg">{name}</span>
          <span className="truncate text-sm text-fg-muted">
            {t(`builder.kind.${c.kind}`)} · {t(`builder.scope.${c.scope}`)}
          </span>
        </span>
        {c.isPrimary && (
          <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs text-accent">
            {t("builder.editor.primaryTag")}
          </span>
        )}
        {invalid && (
          <>
            <AlertCircle size={18} className="text-danger" aria-hidden />
            <span className="sr-only">{t("builder.editor.hasErrors")}</span>
          </>
        )}
      </button>
      <IconButton
        label={t("builder.editor.moveUp", { name })}
        disabled={index === 0}
        onClick={() => onMove(index - 1)}
        className="disabled:opacity-30"
        data-testid={`editor-counter-${index}-up`}
      >
        <ChevronUp size={22} />
      </IconButton>
      <IconButton
        label={t("builder.editor.moveDown", { name })}
        disabled={last}
        onClick={() => onMove(index + 1)}
        className="disabled:opacity-30"
        data-testid={`editor-counter-${index}-down`}
      >
        <ChevronDown size={22} />
      </IconButton>
    </li>
  );
}
