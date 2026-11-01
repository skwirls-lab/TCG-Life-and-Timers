"use client";
/**
 * `/setup` wizard (T1.12, GAME-001): preset → players + layout → seats → options → Start.
 * Start is available on every step, so a default game is 2 taps from the launcher (≤ 6 budget).
 */
import { ArrowDown, ArrowUp, Palette, TriangleAlert, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, ChipRow, IconButton, LockBadge, PageShell, Toggle } from "@/components/ui";
import {
  FIRST_PLAYER_RULES,
  SEAT_COLORS,
  primaryCounter,
  type FirstPlayerRule,
  type Preset,
} from "@/engine";
import { usePageBoot } from "@/features/app-effects/usePageBoot";
import { rememberPresetUse } from "@/features/preset-picker";
import { ProfilePicker } from "@/features/profiles/ProfilePicker";
import { Select } from "@/features/settings/Select";
import { ThumbnailPicker, layoutThumbOptions } from "@/features/settings/Thumbnails";
import { useCan } from "@/lib/entitlements/store";
import { t } from "@/lib/i18n";
import {
  DEFAULT_PRESET_ID,
  getBuiltInPreset,
  hasUnverifiedValues,
  perSeatChips,
  presetVerifyItems,
} from "@/presets";
import { getPresetDefaults } from "@/state/presetDefaults";
import { PresetList } from "./PresetList";
import { StartValuePicker } from "./StartValuePicker";
import {
  SETUP_STEPS,
  applyProfile,
  effectiveStart,
  moveSeat,
  optionalCounters,
  playerChoices,
  seatStart,
  seatThreshold,
  setPlayers,
  stateForPreset,
  toNewGameConfig,
  toggleCounter,
  updateSeat,
  usesCommanders,
  type SetupState,
} from "./setupModel";
import { startNewGame } from "./startGame";

const STEP_TITLES = {
  preset: "shell.setup.step.preset",
  players: "shell.setup.step.players",
  seats: "shell.setup.step.seats",
  options: "shell.setup.step.options",
} as const;

export const FIRST_PLAYER_LABELS: Record<FirstPlayerRule, Parameters<typeof t>[0]> = {
  random: "shell.firstPlayer.random",
  choose: "shell.firstPlayer.choose",
  loser: "shell.firstPlayer.loser",
  winner: "shell.firstPlayer.winner",
  rolloff: "shell.firstPlayer.rolloff",
};

function defaultPreset(): Preset {
  return getBuiltInPreset(DEFAULT_PRESET_ID)!;
}

export function SetupWizard() {
  usePageBoot({ resume: false });
  const router = useRouter();
  const can78 = useCan("players7to8");
  const [state, setState] = useState<SetupState>(() => stateForPreset(defaultPreset(), undefined));
  const [pickerSeat, setPickerSeat] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);
  // The chosen preset object (built-in or custom, CUS-001); custom presets have no sync lookup.
  const [preset, setPreset] = useState<Preset>(defaultPreset);

  const choosePreset = async (p: Preset) => {
    setPreset(p);
    const defaults = await getPresetDefaults(p.id).catch(() => undefined);
    setState((s) => stateForPreset(p, defaults, s));
  };

  // Apply stored defaults (SET-012) for the initial preset.
  useEffect(() => {
    let alive = true;
    getPresetDefaults(DEFAULT_PRESET_ID)
      .then((d) => {
        if (alive && d)
          setState((s) =>
            s.presetId === DEFAULT_PRESET_ID ? stateForPreset(defaultPreset(), d, s) : s,
          );
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const step = SETUP_STEPS[state.step]!;
  const last = state.step === SETUP_STEPS.length - 1;
  const primary = primaryCounter(preset);
  const chips = perSeatChips(preset);
  const verifyItems = hasUnverifiedValues(preset) ? presetVerifyItems(preset) : [];

  const start = async () => {
    if (starting) return;
    setStarting(true);
    try {
      if (!(await startNewGame(toNewGameConfig(state, preset)))) {
        setStarting(false); // the Who-won prompt was closed: keep the current game (HIST-031)
        return;
      }
      // The picker doesn't record Recent on select in setup; the preset is "used" at Start.
      await rememberPresetUse(preset.id).catch(() => undefined);
      router.push("/play");
    } catch (e) {
      console.warn("[setup] start failed", e);
      setStarting(false);
    }
  };

  const go = (d: -1 | 1) =>
    setState((s) => ({ ...s, step: Math.min(SETUP_STEPS.length - 1, Math.max(0, s.step + d)) }));

  return (
    <PageShell
      title={t("shell.setup.title")}
      testId="setup"
      onBack={state.step > 0 ? () => go(-1) : undefined}
    >
      <ol className="mt-3 flex gap-2" aria-label={t("shell.setup.progress")}>
        {SETUP_STEPS.map((s, i) => (
          <li
            key={s}
            aria-current={i === state.step ? "step" : undefined}
            className={`h-1.5 flex-1 rounded-full ${i <= state.step ? "bg-accent" : "bg-surface-3"}`}
          >
            <span className="sr-only">{t(STEP_TITLES[s])}</span>
          </li>
        ))}
      </ol>
      <h2 className="mb-3 mt-4 text-2xl" data-testid={`setup-step-${step}`}>
        {t(STEP_TITLES[step])}
      </h2>

      {step === "preset" && (
        <PresetList
          value={state.presetId}
          onChange={(p) => void choosePreset(p)}
          label={t("shell.setup.step.preset")}
          testIdPrefix="setup-preset"
          recordRecent={false}
        />
      )}

      {step === "players" && (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <h3 className="text-lg">{t("shell.settings.players.title")}</h3>
            <ChipRow
              label={t("shell.settings.players.title")}
              testId="setup-players"
              value={state.players}
              options={playerChoices(preset).map((c) => ({
                value: c.value,
                locked: c.pro && !can78,
                disabled: c.pro && !can78,
              }))}
              onChange={(n) => setState((s) => setPlayers(s, preset, n))}
            />
            {playerChoices(preset).some((c) => c.pro) && !can78 && (
              <p className="flex items-center gap-2 text-sm text-fg-muted">
                <LockBadge /> {t("shell.settings.players.proNote")}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="text-lg">{t("shell.settings.layout.title")}</h3>
            <ThumbnailPicker
              label={t("shell.settings.layout.title")}
              testId="setup-layout"
              value={state.layoutId}
              options={layoutThumbOptions(state.players)}
              onChange={(layoutId) => setState((s) => ({ ...s, layoutId }))}
            />
          </div>
        </div>
      )}

      {step === "seats" && (
        <ul className="flex flex-col gap-3" aria-label={t("shell.setup.step.seats")}>
          {state.seats.map((seat, i) => (
            <li
              key={seat.key}
              className="flex flex-col gap-2 rounded-2xl bg-surface p-3"
              data-testid={`setup-seat-${i}`}
            >
              <div className="flex items-center gap-2">
                <IconButton
                  label={t("shell.setup.seat.color", { n: i + 1 })}
                  data-testid={`setup-seat-${i}-color`}
                  onClick={() => {
                    const idx = SEAT_COLORS.indexOf(seat.color as (typeof SEAT_COLORS)[number]);
                    const color = SEAT_COLORS[(idx + 1) % SEAT_COLORS.length]!;
                    setState((s) => updateSeat(s, i, { color }));
                  }}
                >
                  <span
                    className="flex size-9 items-center justify-center rounded-full"
                    style={{ background: seat.color }}
                  >
                    <Palette size={16} className="text-black/70" aria-hidden />
                  </span>
                </IconButton>
                <input
                  type="text"
                  value={seat.name}
                  maxLength={24}
                  aria-label={t("shell.setup.seat.name", { n: i + 1 })}
                  placeholder={t("shell.setup.seat.placeholder", { n: i + 1 })}
                  data-testid={`setup-seat-${i}-name`}
                  onChange={(e) => setState((s) => updateSeat(s, i, { name: e.target.value }))}
                  className="min-h-12 min-w-0 flex-1 rounded-xl bg-surface-2 px-3 text-lg text-fg placeholder:text-fg-subtle focus-visible:outline-2 focus-visible:outline-accent"
                />
                <IconButton
                  label={t("shell.setup.seat.load", { n: i + 1 })}
                  data-testid={`setup-seat-${i}-load`}
                  onClick={() => setPickerSeat(i)}
                >
                  <UserRound aria-hidden />
                </IconButton>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex-1 text-sm text-fg-muted">
                  {seat.deckName
                    ? t("shell.setup.seat.deck", { deck: seat.deckName })
                    : t("shell.setup.seat.position", { n: i + 1 })}
                </span>
                <IconButton
                  label={t("shell.setup.seat.up", { n: i + 1 })}
                  data-testid={`setup-seat-${i}-up`}
                  disabled={i === 0}
                  className="disabled:opacity-30"
                  onClick={() => setState((s) => moveSeat(s, i, -1))}
                >
                  <ArrowUp aria-hidden />
                </IconButton>
                <IconButton
                  label={t("shell.setup.seat.down", { n: i + 1 })}
                  data-testid={`setup-seat-${i}-down`}
                  disabled={i === state.seats.length - 1}
                  className="disabled:opacity-30"
                  onClick={() => setState((s) => moveSeat(s, i, 1))}
                >
                  <ArrowDown aria-hidden />
                </IconButton>
              </div>
              {usesCommanders(preset) && (
                <div className="flex flex-col gap-2">
                  {[0, ...(preset.capabilities.includes("partners") ? [1] : [])].map((ci) => (
                    <input
                      key={ci}
                      type="text"
                      value={seat.commanders[ci] ?? ""}
                      maxLength={60}
                      aria-label={t(
                        ci === 0 ? "shell.setup.seat.commander" : "shell.setup.seat.partner",
                        { n: i + 1 },
                      )}
                      placeholder={t(
                        ci === 0
                          ? "shell.setup.seat.commanderPlaceholder"
                          : "shell.setup.seat.partnerPlaceholder",
                      )}
                      data-testid={`setup-seat-${i}-commander-${ci}`}
                      onChange={(e) =>
                        setState((s) => {
                          const commanders = [...s.seats[i]!.commanders];
                          commanders[ci] = e.target.value;
                          return updateSeat(s, i, { commanders });
                        })
                      }
                      className="min-h-12 rounded-xl bg-surface-2 px-3 text-base text-fg placeholder:text-fg-subtle focus-visible:outline-2 focus-visible:outline-accent"
                    />
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {step === "options" && (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <h3 className="text-lg">
              {t("shell.settings.start.title", { counter: primary.name })}
            </h3>
            <StartValuePicker
              label={t("shell.settings.start.title", { counter: primary.name })}
              values={preset.quickStartValues ?? [primary.start]}
              value={effectiveStart(state, preset)}
              onChange={(v) => setState((s) => ({ ...s, startValue: v }))}
              testId="setup-start"
            />
          </div>
          {chips && (
            <div className="flex flex-col gap-2" data-testid="setup-per-seat">
              <h3 className="text-lg">{t("shell.settings.perSeatStart.title")}</h3>
              <p className="text-sm text-fg-muted">{t("shell.setup.perSeat.hint")}</p>
              <ul className="flex flex-col gap-3">
                {state.seats.map((seat, i) => {
                  const name = seat.name.trim() || t("shell.setup.seat.placeholder", { n: i + 1 });
                  const threshold = seatThreshold(state, preset, i);
                  return (
                    <li
                      key={seat.key}
                      className="flex flex-col gap-2 rounded-2xl bg-surface p-3"
                      data-testid={`setup-per-seat-${i}`}
                    >
                      <span className="flex items-center gap-2 text-base font-semibold">
                        <span
                          aria-hidden
                          className="size-3 rounded-full"
                          style={{ background: seat.color }}
                        />
                        {name}
                      </span>
                      {chips.start && (
                        <StartValuePicker
                          label={t("shell.perSeat.start", { name, counter: primary.name })}
                          values={chips.start}
                          value={seatStart(state, preset, i)}
                          onChange={(v) => setState((s) => updateSeat(s, i, { start: v }))}
                          testId={`setup-seat-${i}-start`}
                        />
                      )}
                      {chips.threshold && threshold !== undefined && (
                        <>
                          <span className="text-sm text-fg-muted">
                            {t(
                              primary.threshold?.outcome === "win"
                                ? "shell.perSeat.thresholdWin"
                                : "shell.perSeat.thresholdLose",
                              { counter: primary.name },
                            )}
                          </span>
                          <StartValuePicker
                            label={t("shell.perSeat.threshold", { name, counter: primary.name })}
                            values={chips.threshold}
                            value={threshold}
                            onChange={(v) => setState((s) => updateSeat(s, i, { threshold: v }))}
                            testId={`setup-seat-${i}-threshold`}
                          />
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <h3 className="text-lg">{t("shell.settings.counters.title")}</h3>
            {optionalCounters(preset).map((c) => (
              <div key={c.id} className="flex min-h-14 items-center gap-3">
                <span className="flex-1">{c.name}</span>
                <Toggle
                  label={c.name}
                  checked={state.enabledCounters.includes(c.id)}
                  onChange={(on) => setState((s) => toggleCounter(s, c.id, on))}
                  testId={`setup-counter-${c.id}`}
                />
              </div>
            ))}
          </div>
          <div className="flex min-h-14 items-center gap-3">
            <span className="flex-1 text-lg">{t("shell.settings.firstPlayer.title")}</span>
            <Select
              label={t("shell.settings.firstPlayer.title")}
              value={state.firstPlayerRule}
              testId="setup-first-player"
              options={FIRST_PLAYER_RULES.map((r) => ({
                value: r,
                label: t(FIRST_PLAYER_LABELS[r]),
              }))}
              onChange={(firstPlayerRule) => setState((s) => ({ ...s, firstPlayerRule }))}
            />
          </div>
        </div>
      )}

      {verifyItems.length > 0 && step === "options" && (
        <div
          className="mt-4 flex items-start gap-2 rounded-2xl border border-warning/40 bg-warning/10 p-3 text-sm"
          data-testid="setup-verify-hint"
          role="note"
        >
          <TriangleAlert aria-hidden size={18} className="mt-0.5 shrink-0 text-warning" />
          <span>
            {t("shell.setup.verifyHint", {
              preset: preset.name,
              items: verifyItems.map((v) => v.target).join(", "),
            })}
          </span>
        </div>
      )}

      <div className="sticky bottom-0 mt-6 flex gap-3 bg-bg/95 py-3 backdrop-blur">
        {!last && (
          <Button
            size="lg"
            variant="secondary"
            className="flex-1"
            onClick={() => go(1)}
            data-testid="setup-next"
          >
            {t("shell.setup.next")}
          </Button>
        )}
        <Button
          size="lg"
          variant="primary"
          className="flex-1"
          disabled={starting}
          onClick={() => void start()}
          data-testid="setup-start-game"
        >
          {t("shell.setup.start")}
        </Button>
      </div>

      <ProfilePicker
        open={pickerSeat !== null}
        onClose={() => setPickerSeat(null)}
        presetId={preset.id}
        onPick={(sel) => {
          const i = pickerSeat;
          setPickerSeat(null);
          if (i !== null) setState((s) => applyProfile(s, i, sel));
        }}
      />
    </PageShell>
  );
}
