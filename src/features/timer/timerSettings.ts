"use client";
/**
 * Settings section C — Timers (T2.8, PRD §13.1-C). Registered into the settings registry when
 * the settings page imports this module; replaces the W2 `timer.mode` placeholder row.
 *
 * Rows read `ctx.draft.timer` (the active game's config, or the next game's defaults) and return
 * a `{ kind: "timer", patch }` change: the settings model applies it to the game
 * (`applyTimerPatch`) or, with no active game, to the next game's timer defaults (SET-012).
 * Structure keys (mode, time per player, per-turn time, match timer) only apply to idle clocks:
 * changing them after START asks to restart the clocks (TimerSettingsHost). Advanced modes /
 * options are gated with `timerAdvancedModes` (locked options open the paywall).
 */
import {
  BLOCKERS_TIMEOUTS,
  TIMER_MODES,
  TIMEOUT_ACTIONS,
  RESPONSE_MODES,
  PASS_MODES,
  type TimerConfig,
  type TimerMode,
} from "@/engine";
import {
  registerSettings,
  type ChoiceOption,
  type SettingDef,
  type SettingsContext,
  type SettingChange,
} from "@/features/settings/registry";
import { t, type MessageKey } from "@/lib/i18n";
import { useGameStore } from "@/state/gameStore";
import {
  ADVANCED_MODES,
  BANK_MINUTES,
  BANK_MODES,
  GRACE_MS,
  MATCH_MINUTES,
  MIN,
  PER_TURN_MODES,
  PER_TURN_MS,
  STEP_SECONDS,
  isStructurePatch,
  shortDuration,
} from "./model";
import { warningsSummary } from "./warnings";
import {
  BLOCKERS_SECONDS,
  blockersSettings,
  modeFamily,
  modePatch,
  seatTimesSummary,
} from "./seatTimes";
import { useTimerSettingsUi } from "./timerSettingsUi";

export const CUSTOM = "custom";

const cfgOf = (ctx: SettingsContext): TimerConfig => ctx.draft.timer;

/** Apply a config patch to the active game (confirming a clock restart when needed). */
export function applyTimerPatch(patch: Partial<TimerConfig>): void {
  const game = useGameStore.getState().session?.game;
  if (!game) return;
  if (game.timer.status !== "idle" && isStructurePatch(patch)) {
    useTimerSettingsUi.getState().askRestart(patch);
    return;
  }
  useGameStore.getState().dispatch({ type: "TIMER_SET_CONFIG", config: patch });
}

function patchSet(
  fn: (v: string | number | boolean, ctx: SettingsContext) => Partial<TimerConfig> | null,
) {
  return (ctx: SettingsContext, v: string | number | boolean): SettingChange => ({
    kind: "timer",
    patch: fn(v, ctx) ?? {},
  });
}

const locked = (ctx: SettingsContext) => !ctx.can("timerAdvancedModes");
const on = (ctx: SettingsContext) => cfgOf(ctx).mode !== "off";
const limitedMode = (ctx: SettingsContext) => on(ctx) && cfgOf(ctx).mode !== "countup";

function row(id: string, control: SettingDef["control"], extra: Partial<SettingDef>): SettingDef {
  return {
    id: `timer.${id}`,
    scope: "game",
    section: "C",
    control,
    titleKey: `timer.settings.${id}.title` as MessageKey,
    subtitleKey: `timer.settings.${id}.subtitle` as MessageKey,
    ...extra,
  };
}

const minutesChips = (selected: number) => (): ChoiceOption[] => {
  const opts: ChoiceOption[] = BANK_MINUTES.map((m) => ({ value: m, label: String(m) }));
  const isCustom = !BANK_MINUTES.some((m) => m * MIN === selected);
  opts.push({
    value: CUSTOM,
    label: isCustom ? shortDuration(selected) : t("timer.settings.customShort"),
  });
  return opts;
};

const bankKey = (mode: TimerMode): "bankMs" | "reserveMs" =>
  mode === "perTurnReserve" ? "reserveMs" : "bankMs";

export const TIMER_ROWS: SettingDef[] = [
  row(
    "mode",
    {
      kind: "select",
      options: (ctx) =>
        TIMER_MODES.map((m) => ({
          value: m,
          label: t(`timer.mode.${m}`),
          locked: ADVANCED_MODES.includes(m) && locked(ctx),
          disabled: ADVANCED_MODES.includes(m) && locked(ctx),
          lockFeature: "timerAdvancedModes",
        })),
    },
    {
      default: "off",
      helpKey: "timer.settings.mode.help",
      subtitleKey: "timer.settings.mode.subtitle",
      get: (ctx) => cfgOf(ctx).mode,
      set: patchSet((v, ctx) => modePatch(cfgOf(ctx), v as TimerMode)),
    },
  ),
  row(
    "bank",
    {
      kind: "chips",
      options: (ctx) => minutesChips(cfgOf(ctx)[bankKey(cfgOf(ctx).mode)])(),
    },
    {
      titleKey: "timer.settings.bank.title",
      subtitleVars: (ctx) => ({ time: shortDuration(cfgOf(ctx)[bankKey(cfgOf(ctx).mode)]) }),
      visibleIf: (_p, _g, ctx) =>
        on(ctx) && [...BANK_MODES, "perTurnReserve"].includes(cfgOf(ctx).mode),
      get: (ctx) => {
        const ms = cfgOf(ctx)[bankKey(cfgOf(ctx).mode)];
        return BANK_MINUTES.some((m) => m * MIN === ms) ? ms / MIN : CUSTOM;
      },
      set: patchSet((v, ctx) => {
        if (v === CUSTOM) {
          useTimerSettingsUi.getState().askCustom(bankKey(cfgOf(ctx).mode));
          return null;
        }
        return { [bankKey(cfgOf(ctx).mode)]: Number(v) * MIN };
      }),
    },
  ),
  row(
    "step",
    {
      kind: "chips",
      options: () => STEP_SECONDS.map((s) => ({ value: s, label: String(s) })),
    },
    {
      titleVars: (ctx) => ({
        kind: t(
          cfgOf(ctx).mode === "bankDelay"
            ? "timer.settings.step.delay"
            : "timer.settings.step.increment",
        ),
      }),
      visibleIf: (_p, _g, ctx) =>
        on(ctx) && ["bankIncrement", "bankDelay"].includes(cfgOf(ctx).mode),
      get: (ctx) => {
        const c = cfgOf(ctx);
        return Math.round((c.mode === "bankDelay" ? c.delayMs : c.incrementMs) / 1000);
      },
      set: patchSet((v, ctx) =>
        cfgOf(ctx).mode === "bankDelay"
          ? { delayMs: Number(v) * 1000 }
          : { incrementMs: Number(v) * 1000 },
      ),
    },
  ),
  row(
    "perTurn",
    {
      kind: "chips",
      options: () => PER_TURN_MS.map((ms) => ({ value: ms, label: shortDuration(ms) })),
    },
    {
      visibleIf: (_p, _g, ctx) => on(ctx) && PER_TURN_MODES.includes(cfgOf(ctx).mode),
      get: (ctx) => cfgOf(ctx).perTurnMs,
      set: patchSet((v) => ({ perTurnMs: Number(v) })),
    },
  ),
  row(
    "match",
    {
      kind: "select",
      options: (ctx) => {
        const cur = cfgOf(ctx).match?.totalMs ?? 0;
        const opts: ChoiceOption[] = MATCH_MINUTES.map((m) => ({
          value: m,
          label: m === 0 ? t("timer.settings.off") : t("timer.settings.minutes", { n: m }),
          locked: m !== 0 && locked(ctx),
          disabled: m !== 0 && locked(ctx),
          lockFeature: "timerAdvancedModes",
        }));
        const custom = cur > 0 && !MATCH_MINUTES.some((m) => m * MIN === cur);
        opts.push({
          value: CUSTOM,
          label: custom ? shortDuration(cur) : t("timer.settings.custom"),
          locked: locked(ctx),
          disabled: locked(ctx),
          lockFeature: "timerAdvancedModes",
        });
        return opts;
      },
    },
    {
      // A-3 (TMR-032): a round timer works with any per-seat mode, Off included.
      visibleIf: () => true,
      get: (ctx) => {
        const ms = cfgOf(ctx).match?.totalMs ?? 0;
        return MATCH_MINUTES.some((m) => m * MIN === ms) ? ms / MIN : CUSTOM;
      },
      set: patchSet((v, ctx) => {
        if (v === CUSTOM) {
          useTimerSettingsUi.getState().askCustom("match");
          return null;
        }
        const n = Number(v);
        const extraTurns = cfgOf(ctx).match?.extraTurns ?? 0;
        return { match: n > 0 ? { totalMs: n * MIN, extraTurns } : undefined };
      }),
    },
  ),
  row(
    "extraTurns",
    {
      kind: "select",
      options: () => Array.from({ length: 11 }, (_, i) => ({ value: i, label: String(i) })),
    },
    {
      visibleIf: (_p, _g, ctx) => cfgOf(ctx).match !== undefined,
      get: (ctx) => cfgOf(ctx).match?.extraTurns ?? 0,
      set: patchSet((v, ctx) => {
        const m = cfgOf(ctx).match;
        return m ? { match: { ...m, extraTurns: Number(v) } } : null;
      }),
    },
  ),
  row(
    "timeoutAction",
    {
      kind: "select",
      options: (ctx) =>
        TIMEOUT_ACTIONS.map((a) => ({
          value: a,
          label: t(`timer.timeout.${a}`),
          locked: a === "addOnce" && locked(ctx),
          disabled: a === "addOnce" && locked(ctx),
          lockFeature: "timerAdvancedModes",
        })),
    },
    {
      visibleIf: (_p, _g, ctx) => limitedMode(ctx),
      get: (ctx) => cfgOf(ctx).timeoutAction,
      set: patchSet((v) => ({ timeoutAction: v as TimerConfig["timeoutAction"] })),
    },
  ),
  row(
    "grace",
    {
      kind: "chips",
      options: () => GRACE_MS.map((ms) => ({ value: ms, label: shortDuration(ms) })),
    },
    {
      titleVars: (ctx) => ({
        kind: t(
          cfgOf(ctx).timeoutAction === "addOnce"
            ? "timer.settings.grace.extra"
            : "timer.settings.grace.grace",
        ),
      }),
      visibleIf: (_p, _g, ctx) =>
        limitedMode(ctx) && ["grace", "addOnce"].includes(cfgOf(ctx).timeoutAction),
      get: (ctx) =>
        cfgOf(ctx).timeoutAction === "addOnce" ? cfgOf(ctx).addOnceMs : cfgOf(ctx).graceMs,
      set: patchSet((v, ctx) =>
        cfgOf(ctx).timeoutAction === "addOnce" ? { addOnceMs: Number(v) } : { graceMs: Number(v) },
      ),
    },
  ),
  row(
    // TMR-060: Row → sub-page (toggle + a time stepper per seat). Per game: needs a game.
    "seatTimes",
    { kind: "subpage", page: "seatTimes" },
    {
      subtitleKey: "timer.settings.seatTimes.summary",
      subtitleVars: (ctx) => ({
        list:
          seatTimesSummary(cfgOf(ctx), ctx.game?.seats ?? []) ||
          t(
            cfgOf(ctx).seatExtraMs
              ? "timer.settings.seatTimes.subtitle"
              : "timer.settings.seatTimes.off",
          ),
      }),
      visibleIf: (_p, game, ctx) => game !== null && modeFamily(cfgOf(ctx).mode) !== null,
    },
  ),
  row(
    "blockersWindow",
    { kind: "toggle" },
    {
      default: false,
      visibleIf: (_p, _g, ctx) => on(ctx),
      get: (ctx) => blockersSettings(cfgOf(ctx)).on,
      set: patchSet((v) => ({ blockersWindow: Boolean(v) })),
    },
  ),
  row(
    "blockersMs",
    {
      kind: "select",
      options: () =>
        BLOCKERS_SECONDS.map((s) => ({ value: s, label: t("timer.settings.seconds", { n: s }) })),
    },
    {
      visibleIf: (_p, _g, ctx) => on(ctx) && blockersSettings(cfgOf(ctx)).on,
      get: (ctx) => blockersSettings(cfgOf(ctx)).seconds,
      set: patchSet((v) => ({ blockersMs: Number(v) * 1000 })),
    },
  ),
  row(
    "blockersTimeout",
    {
      kind: "select",
      options: () =>
        BLOCKERS_TIMEOUTS.map((v) => ({ value: v, label: t(`timer.blockersTimeout.${v}`) })),
    },
    {
      visibleIf: (_p, _g, ctx) => on(ctx) && blockersSettings(cfgOf(ctx)).on,
      get: (ctx) => blockersSettings(cfgOf(ctx)).timeout,
      set: patchSet((v) => ({ blockersTimeout: v as TimerConfig["blockersTimeout"] })),
    },
  ),
  row(
    "responses",
    {
      kind: "select",
      options: () => RESPONSE_MODES.map((r) => ({ value: r, label: t(`timer.responses.${r}`) })),
    },
    {
      helpKey: "timer.settings.responses.help",
      visibleIf: (_p, _g, ctx) => on(ctx),
      get: (ctx) => cfgOf(ctx).responses,
      set: patchSet((v) => ({ responses: v as TimerConfig["responses"] })),
    },
  ),
  row(
    "passMode",
    {
      kind: "select",
      options: () => PASS_MODES.map((p) => ({ value: p, label: t(`timer.passMode.${p}`) })),
    },
    {
      visibleIf: (_p, _g, ctx) => on(ctx),
      get: (ctx) => cfgOf(ctx).passMode,
      set: patchSet((v) => ({ passMode: v as TimerConfig["passMode"] })),
    },
  ),
  row(
    "autoPauseBackground",
    { kind: "toggle" },
    {
      default: true,
      visibleIf: (_p, _g, ctx) => on(ctx),
      get: (ctx) => cfgOf(ctx).autoPauseBackground,
      set: patchSet((v) => ({ autoPauseBackground: Boolean(v) })),
    },
  ),
  row(
    "autoPauseMenus",
    { kind: "toggle" },
    {
      default: true,
      visibleIf: (_p, _g, ctx) => on(ctx),
      get: (ctx) => cfgOf(ctx).autoPauseMenus,
      set: patchSet((v) => ({ autoPauseMenus: Boolean(v) })),
    },
  ),
  row(
    "warnings",
    // TMR-031: Row → sub-page (presets, add / remove, per-threshold sound / vibrate / flash).
    { kind: "subpage", page: "warnings" },
    {
      subtitleKey: "timer.settings.warnings.summary",
      subtitleVars: (ctx) => ({
        list: warningsSummary(cfgOf(ctx)) || t("timer.warnings.off"),
      }),
      visibleIf: (_p, _g, ctx) => limitedMode(ctx),
    },
  ),
  row(
    "showTenths",
    { kind: "toggle" },
    {
      default: true,
      visibleIf: (_p, _g, ctx) => limitedMode(ctx),
      get: (ctx) => cfgOf(ctx).showTenths,
      set: patchSet((v) => ({ showTenths: Boolean(v) })),
    },
  ),
  row(
    "showTurnTime",
    { kind: "toggle" },
    {
      default: false,
      visibleIf: (_p, _g, ctx) => on(ctx),
      get: (ctx) => cfgOf(ctx).showTurnTime,
      set: patchSet((v) => ({ showTurnTime: Boolean(v) })),
    },
  ),
];

registerSettings(TIMER_ROWS);
