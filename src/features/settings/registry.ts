/**
 * Settings registry (T1.14, SET-001, SET-010..015, PRD §13.1 sections A–H).
 *
 * Every row of the Settings page is a typed `SettingDef`. Rows are generated from the active
 * preset's data (capabilities / counters) via `visibleIf`, never per game (ARCH-003).
 *
 * Scopes (§13.1): 'game' rows edit a `GameDraft` (the active game, or the next game's preset
 * defaults when no game is active); 'presetDefault' rows are the SET-012 save/restore actions;
 * 'app' rows patch AppSettings.
 *
 * Extending (e.g. the TIMER-UI lane, section C): call `registerSettings([...defs])` from a module
 * imported by the settings page, or add rows here. A def with an existing id replaces it, so the
 * placeholder `timer.mode` row can be swapped for the real one. Order = registration order within
 * a section; use `order` to position rows explicitly.
 */
import type { GameOptions, Preset, Game, AutoKOMode, FirstPlayerRule, TurnOrder } from "@/engine";
import { FIRST_PLAYER_RULES, primaryCounter } from "@/engine";
import type { ProFeature } from "@/lib/entitlements/features";
import { t, type MessageKey } from "@/lib/i18n";
import type { AppSettings, SettingsPatch } from "@/state/settingsStore";
import { playerChoices } from "@/features/setup/setupModel";
import { perSeatChips } from "@/presets";
import { setOrOmit, type GameDraft } from "./draft";
import { layoutVariantsFor } from "./layoutVariants";

export type SettingScope = "game" | "presetDefault" | "app";
export const SECTIONS = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;
export type SectionId = (typeof SECTIONS)[number];

export const SECTION_TITLES: Record<SectionId, MessageKey> = {
  A: "shell.settings.section.A",
  B: "shell.settings.section.B",
  C: "shell.settings.section.C",
  D: "shell.settings.section.D",
  E: "shell.settings.section.E",
  F: "shell.settings.section.F",
  G: "shell.settings.section.G",
  H: "shell.settings.section.H",
};

export interface DeviceEnv {
  haptics: boolean;
  fullscreen: boolean;
  standalone: boolean;
}

export interface SettingsContext {
  preset: Preset;
  /** The active game; null → game-scope rows edit the next game's defaults. */
  game: Game | null;
  draft: GameDraft;
  app: AppSettings;
  env: DeviceEnv;
  can: (feature: ProFeature) => boolean;
  /** Installed app version (section H). */
  version: string;
}

export type SettingValue = string | number | boolean;

export interface ChoiceOption {
  value: string | number;
  label: string;
  disabled?: boolean;
  /** Pro-locked (shows a LockBadge). */
  locked?: boolean;
}

export type PreviewSpec =
  | { type: "layout"; players: number; id: string }
  | { type: "card"; kind: AppSettings["cardLayout"] };

export type SubPageId = "seats" | "perSeatStart" | "thresholds" | "counters";
export type ActionId =
  | "saveDefaults"
  | "restoreDefaults"
  | "signIn"
  | "exportData"
  | "clearImageCache"
  | "removeData"
  | "deleteAccount"
  | "support"
  | "share"
  | "feedback"
  | "diagnostics"
  | "whatsNew"
  | "install";

export type SettingControl =
  | { kind: "toggle" }
  | { kind: "select"; options: (ctx: SettingsContext) => ChoiceOption[] }
  | { kind: "chips"; options: (ctx: SettingsContext) => ChoiceOption[] }
  | { kind: "segmented"; options: (ctx: SettingsContext) => ChoiceOption[] }
  | {
      kind: "thumbnails";
      options: (ctx: SettingsContext) => (ChoiceOption & { preview: PreviewSpec })[];
    }
  /** Starting <primary> chips (preset.quickStartValues) + Custom keypad. */
  | { kind: "startValue" }
  /** Preset picker row (value on the right; opens the grouped picker). */
  | { kind: "preset" }
  | { kind: "subpage"; page: SubPageId }
  | { kind: "link"; href: string }
  | { kind: "info" }
  | { kind: "action"; action: ActionId };

export type SettingChange =
  { kind: "app"; patch: SettingsPatch } | { kind: "game"; draft: GameDraft };

export interface SettingDef {
  id: string;
  scope: SettingScope;
  section: SectionId;
  control: SettingControl;
  /** Position within the section (lower first; default = registration order × 10). */
  order?: number;
  /** SET-011: changing it resets the game (confirm first). */
  structural?: boolean;
  /** Default value (documentation + reset); app rows mirror defaultAppSettings(). */
  default?: SettingValue;
  titleKey: MessageKey;
  titleVars?: (ctx: SettingsContext) => Record<string, string | number>;
  subtitleKey: MessageKey;
  subtitleVars?: (ctx: SettingsContext) => Record<string, string | number>;
  /** SET-015 "?" help popover. */
  helpKey?: MessageKey;
  /** Row applies to this preset/game (SET-010). Default: always. */
  visibleIf?: (preset: Preset, game: Game | null, ctx: SettingsContext) => boolean;
  /** Disabled reason (badge text key, e.g. "Not supported on this device"), or null. */
  disabledIf?: (ctx: SettingsContext) => MessageKey | null;
  /** Current value (control-specific). */
  get?: (ctx: SettingsContext) => SettingValue;
  set?: (ctx: SettingsContext, value: SettingValue) => SettingChange;
}

// ---------------------------------------------------------------------------------------------
// Data-driven predicates (ARCH-003)
// ---------------------------------------------------------------------------------------------

export function thresholdCounters(preset: Preset) {
  return preset.counters.filter(
    (c) =>
      c.threshold &&
      c.kind === "number" &&
      (c.scope === "player" || c.scope === "playerVsOpponent"),
  );
}

export function hasThresholds(preset: Preset): boolean {
  return thresholdCounters(preset).length > 0;
}

export function hasOptionalCounters(preset: Preset): boolean {
  return preset.counters.some((c) => !c.isPrimary);
}

/** Commander damage → life link (CMD-004). */
export function hasOptionalLifeLink(preset: Preset): boolean {
  return preset.counters.some((c) => c.linkedTo?.optional);
}

export function hasCommanderDamage(preset: Preset): boolean {
  return (
    preset.capabilities.includes("commanderDamage") ||
    preset.counters.some((c) => c.scope === "playerVsOpponent")
  );
}

export function hasPerTurnCounters(preset: Preset): boolean {
  return preset.counters.some((c) => c.resetOnTurnPass);
}

/** PRE-013: per-seat start (capability perSeatStart) or threshold (`perSeatOverride`) values. */
export function hasPerSeatOverrides(preset: Preset): boolean {
  return perSeatChips(preset) !== undefined;
}

/**
 * Supplemental decks (Planechase / Archenemy / Bounty, P2) have no preset capability yet; until a
 * `supplementalDecks` capability lands they are offered for games listed here (data, not code
 * branches). Requested as a shared change.
 */
export const SUPPLEMENTAL_DECK_GAMES: readonly string[] = ["Magic: The Gathering"];

export function offersSupplementalDecks(preset: Preset): boolean {
  return SUPPLEMENTAL_DECK_GAMES.includes(preset.game);
}

/** "life, poison, or commander damage" from the preset's thresholds (Auto-KO subtitle). */
export function thresholdSourceList(preset: Preset): string {
  const names = thresholdCounters(preset).map((c) => c.name.toLocaleLowerCase());
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return t("shell.list.two", { a: names[0]!, b: names[1]! });
  return t("shell.list.many", { items: names.slice(0, -1).join(", "), last: names.at(-1)! });
}

// ---------------------------------------------------------------------------------------------
// Row builders
// ---------------------------------------------------------------------------------------------

type AppKey = Exclude<keyof AppSettings, "sounds">;

function appGet(key: AppKey) {
  return (ctx: SettingsContext) => ctx.app[key] as SettingValue;
}

function appSet(key: AppKey) {
  return (_ctx: SettingsContext, value: SettingValue): SettingChange => ({
    kind: "app",
    patch: { [key]: value } as SettingsPatch,
  });
}

function appRow(
  key: AppKey,
  section: SectionId,
  control: SettingControl,
  extra: Partial<SettingDef> = {},
): SettingDef {
  return {
    id: key,
    scope: "app",
    section,
    control,
    titleKey: `shell.settings.${key}.title` as MessageKey,
    subtitleKey: `shell.settings.${key}.subtitle` as MessageKey,
    get: appGet(key),
    set: appSet(key),
    ...extra,
  };
}

function withOption<K extends keyof GameOptions>(
  ctx: SettingsContext,
  key: K,
  value: GameOptions[K],
): SettingChange {
  return { kind: "game", draft: { ...ctx.draft, options: { ...ctx.draft.options, [key]: value } } };
}

function optionRow(
  key: keyof GameOptions,
  section: SectionId,
  control: SettingControl,
  extra: Partial<SettingDef> = {},
): SettingDef {
  return {
    id: key,
    scope: "game",
    section,
    control,
    titleKey: `shell.settings.${key}.title` as MessageKey,
    subtitleKey: `shell.settings.${key}.subtitle` as MessageKey,
    get: (ctx) => ctx.draft.options[key] as SettingValue,
    set: (ctx, v) => withOption(ctx, key, v as never),
    ...extra,
  };
}

function opts(
  values: readonly (string | number)[],
  prefix: string,
): (ctx: SettingsContext) => ChoiceOption[] {
  return () => values.map((v) => ({ value: v, label: t(`${prefix}.${v}` as MessageKey) }));
}

const P2: MessageKey = "shell.settings.badge.p2";
const SOON: MessageKey = "shell.settings.badge.soon";
const UNSUPPORTED: MessageKey = "shell.settings.badge.unsupported";

/** Routes that exist in this build (G rows link to them; others render disabled "coming soon"). */
export const AVAILABLE_ROUTES: readonly string[] = [
  "/profiles",
  "/history",
  "/builder",
  "/account",
  "/feedback",
];

function linkRow(id: string, section: SectionId, href: string): SettingDef {
  return {
    id,
    scope: "app",
    section,
    control: { kind: "link", href },
    titleKey: `shell.settings.${id}.title` as MessageKey,
    subtitleKey: `shell.settings.${id}.subtitle` as MessageKey,
    disabledIf: () => (AVAILABLE_ROUTES.includes(href) ? null : SOON),
  };
}

function actionRow(
  id: string,
  section: SectionId,
  action: ActionId,
  extra: Partial<SettingDef> = {},
): SettingDef {
  return {
    id,
    scope: "app",
    section,
    control: { kind: "action", action },
    titleKey: `shell.settings.${id}.title` as MessageKey,
    subtitleKey: `shell.settings.${id}.subtitle` as MessageKey,
    disabledIf: () => SOON,
    ...extra,
  };
}

// ---------------------------------------------------------------------------------------------
// The registry
// ---------------------------------------------------------------------------------------------

const AUTO_KO: readonly AutoKOMode[] = ["auto", "prompt", "off"];
const TURN_ORDER: readonly TurnOrder[] = ["clockwise", "counterclockwise"];

const BASE_ROWS: SettingDef[] = [
  // ---- A. Game setup (game scope, savable as preset default) ------------------------------
  {
    id: "preset",
    scope: "game",
    section: "A",
    control: { kind: "preset" },
    structural: true,
    titleKey: "shell.settings.preset.title",
    subtitleKey: "shell.settings.preset.subtitle",
    subtitleVars: (ctx) => ({ game: ctx.preset.game, name: ctx.preset.name }),
    get: (ctx) => ctx.draft.presetId,
    // The page swaps in the new preset's defaults (draftForPreset) — see SettingsPage.
  },
  {
    id: "players",
    scope: "game",
    section: "A",
    structural: true,
    control: {
      kind: "chips",
      options: (ctx) =>
        playerChoices(ctx.preset).map((c) => ({
          value: c.value,
          label: String(c.value),
          locked: c.pro && !ctx.can("players7to8"),
          disabled: c.pro && !ctx.can("players7to8"),
        })),
    },
    titleKey: "shell.settings.players.title",
    subtitleKey: "shell.settings.players.subtitle",
    visibleIf: (preset) => preset.maxPlayers > preset.minPlayers,
    get: (ctx) => ctx.draft.players,
    set: (ctx, v) => ({ kind: "game", draft: { ...ctx.draft, players: Number(v) } }),
  },
  {
    id: "layout",
    scope: "game",
    section: "A",
    control: {
      kind: "thumbnails",
      options: (ctx) =>
        layoutVariantsFor(ctx.draft.players).map((v) => ({
          value: v.id,
          label: t(v.labelKey as MessageKey),
          preview: { type: "layout", players: ctx.draft.players, id: v.id },
        })),
    },
    titleKey: "shell.settings.layout.title",
    subtitleKey: "shell.settings.layout.subtitle",
    get: (ctx) => ctx.draft.layoutId,
    set: (ctx, v) => ({ kind: "game", draft: { ...ctx.draft, layoutId: String(v) } }),
  },
  {
    id: "seats",
    scope: "game",
    section: "A",
    control: { kind: "subpage", page: "seats" },
    titleKey: "shell.settings.seats.title",
    subtitleKey: "shell.settings.seats.subtitle",
    visibleIf: (_p, game) => game !== null,
  },
  {
    id: "startValue",
    scope: "game",
    section: "A",
    structural: true,
    control: { kind: "startValue" },
    titleKey: "shell.settings.start.title",
    titleVars: (ctx) => ({ counter: primaryCounter(ctx.preset).name }),
    subtitleKey: "shell.settings.start.subtitle",
    get: (ctx) => {
      const p = primaryCounter(ctx.preset);
      return ctx.draft.startOverrides[p.id] ?? p.start;
    },
    set: (ctx, v) => {
      const p = primaryCounter(ctx.preset);
      const startOverrides = setOrOmit(ctx.draft.startOverrides, p.id, Number(v), p.start);
      return { kind: "game", draft: { ...ctx.draft, startOverrides } };
    },
  },
  {
    id: "perSeatStart",
    scope: "game",
    section: "A",
    structural: true,
    control: { kind: "subpage", page: "perSeatStart" },
    titleKey: "shell.settings.perSeatStart.title",
    subtitleKey: "shell.settings.perSeatStart.subtitle",
    visibleIf: (preset, game) => hasPerSeatOverrides(preset) && game !== null,
  },
  {
    id: "thresholds",
    scope: "game",
    section: "A",
    structural: true,
    control: { kind: "subpage", page: "thresholds" },
    titleKey: "shell.settings.thresholds.title",
    subtitleKey: "shell.settings.thresholds.subtitle",
    visibleIf: (preset) => hasThresholds(preset),
  },
  {
    id: "counters",
    scope: "game",
    section: "A",
    structural: true,
    control: { kind: "subpage", page: "counters" },
    titleKey: "shell.settings.counters.title",
    subtitleKey: "shell.settings.counters.subtitle",
    visibleIf: (preset) => hasOptionalCounters(preset),
  },
  optionRow(
    "firstPlayerRule",
    "A",
    { kind: "select", options: opts(FIRST_PLAYER_RULES, "shell.firstPlayer") },
    {
      default: "random" satisfies FirstPlayerRule,
      titleKey: "shell.settings.firstPlayer.title",
      subtitleKey: "shell.settings.firstPlayer.subtitle",
      helpKey: "shell.settings.firstPlayer.help",
    },
  ),
  optionRow(
    "turnOrder",
    "A",
    { kind: "select", options: opts(TURN_ORDER, "shell.turnOrder") },
    { default: "clockwise" },
  ),
  {
    id: "saveDefaults",
    scope: "presetDefault",
    section: "A",
    control: { kind: "action", action: "saveDefaults" },
    titleKey: "shell.settings.saveDefaults.title",
    titleVars: (ctx) => ({ preset: ctx.preset.name }),
    subtitleKey: "shell.settings.saveDefaults.subtitle",
    subtitleVars: (ctx) => ({ preset: ctx.preset.name }),
  },
  {
    id: "restoreDefaults",
    scope: "presetDefault",
    section: "A",
    control: { kind: "action", action: "restoreDefaults" },
    titleKey: "shell.settings.restoreDefaults.title",
    titleVars: (ctx) => ({ preset: ctx.preset.name }),
    subtitleKey: "shell.settings.restoreDefaults.subtitle",
    subtitleVars: (ctx) => ({ preset: ctx.preset.name }),
  },

  // ---- B. Gameplay (game scope; rows depend on the preset) --------------------------------
  optionRow(
    "autoKO",
    "B",
    { kind: "select", options: opts(AUTO_KO, "shell.autoKO") },
    {
      default: "auto",
      subtitleVars: (ctx) => ({ list: thresholdSourceList(ctx.preset) }),
      helpKey: "shell.settings.autoKO.help",
      visibleIf: (preset) => hasThresholds(preset),
    },
  ),
  optionRow(
    "autoRevive",
    "B",
    { kind: "toggle" },
    { default: true, visibleIf: (preset) => hasThresholds(preset) },
  ),
  optionRow(
    "commanderDamageLifeLoss",
    "B",
    { kind: "toggle" },
    { default: true, visibleIf: (preset) => hasOptionalLifeLink(preset) },
  ),
  optionRow(
    "partnersAllowed",
    "B",
    { kind: "toggle" },
    { default: true, visibleIf: (preset) => preset.capabilities.includes("partners") },
  ),
  optionRow(
    "turnTracking",
    "B",
    { kind: "toggle" },
    { default: false, helpKey: "shell.settings.turnTracking.help" },
  ),
  optionRow("historyEnabled", "B", { kind: "toggle" }, { default: true }),
  {
    id: "planechase",
    scope: "game",
    section: "B",
    control: { kind: "toggle" },
    default: false,
    titleKey: "shell.settings.planechase.title",
    subtitleKey: "shell.settings.planechase.subtitle",
    visibleIf: (preset) => offersSupplementalDecks(preset),
    disabledIf: () => P2,
    get: () => false,
  },
  {
    id: "archenemy",
    scope: "game",
    section: "B",
    control: { kind: "toggle" },
    default: false,
    titleKey: "shell.settings.archenemy.title",
    subtitleKey: "shell.settings.archenemy.subtitle",
    visibleIf: (preset) => offersSupplementalDecks(preset),
    disabledIf: () => P2,
    get: () => false,
  },
  {
    id: "bounty",
    scope: "game",
    section: "B",
    control: { kind: "toggle" },
    default: false,
    titleKey: "shell.settings.bounty.title",
    subtitleKey: "shell.settings.bounty.subtitle",
    visibleIf: (preset) => offersSupplementalDecks(preset) && hasCommanderDamage(preset),
    disabledIf: () => P2,
    get: () => false,
  },
  optionRow(
    "firstTurnReminder",
    "B",
    { kind: "toggle" },
    { default: true, visibleIf: (preset) => preset.capabilities.includes("firstTurnReminder") },
  ),
  optionRow(
    "resetPerTurnFlags",
    "B",
    { kind: "toggle" },
    { default: true, visibleIf: (preset) => hasPerTurnCounters(preset) },
  ),
  optionRow(
    "tapForCalculator",
    "B",
    { kind: "toggle" },
    { default: false, visibleIf: (preset) => preset.capabilities.includes("calculator") },
  ),

  // ---- C. Timers (placeholder until the TIMER-UI lane registers its rows; T2.8) -----------
  {
    id: "timer.mode",
    scope: "game",
    section: "C",
    control: { kind: "info" },
    default: "off",
    titleKey: "shell.settings.timerMode.title",
    subtitleKey: "shell.settings.timerMode.subtitle",
    disabledIf: () => SOON,
    get: () => t("shell.settings.timerMode.off"),
  },

  // ---- D. Appearance (app) ----------------------------------------------------------------
  appRow(
    "theme",
    "D",
    {
      kind: "select",
      options: (ctx) => [
        { value: "dark", label: t("shell.theme.dark") },
        { value: "light", label: t("shell.theme.light") },
        { value: "highContrast", label: t("shell.theme.highContrast") },
        {
          value: "pro",
          label: t("shell.theme.pro"),
          disabled: true,
          locked: !ctx.can("themesPro"),
        },
      ],
    },
    { default: "dark" },
  ),
  appRow(
    "cardLayout",
    "D",
    {
      kind: "thumbnails",
      options: () =>
        (["default", "nameOnly", "bigFont"] as const).map((kind) => ({
          value: kind,
          label: t(`shell.cardLayout.${kind}`),
          preview: { type: "card", kind },
        })),
    },
    { default: "default" },
  ),
  appRow(
    "colorizeMiniGrids",
    "D",
    { kind: "toggle" },
    { default: true, visibleIf: (preset) => hasCommanderDamage(preset) },
  ),
  appRow(
    "badges",
    "D",
    { kind: "select", options: opts(["nonDefault", "always", "hidden"], "shell.badges") },
    { default: "nonDefault" },
  ),
  appRow(
    "bubbleMs",
    "D",
    {
      kind: "chips",
      options: () =>
        [1000, 2000, 3000, 5000].map((v) => ({
          value: v,
          label: t("shell.unit.seconds", { n: v / 1000 }),
        })),
    },
    { default: 2000 },
  ),
  appRow("autoHideMenu", "D", { kind: "toggle" }, { default: false }),
  appRow("diceAnimations", "D", { kind: "toggle" }, { default: true }),
  appRow(
    "reduceMotion",
    "D",
    { kind: "select", options: opts(["system", "always", "never"], "shell.reduceMotion") },
    { default: "system" },
  ),
  appRow(
    "onePlayerMode",
    "D",
    { kind: "toggle" },
    { default: false, helpKey: "shell.settings.onePlayerMode.help" },
  ),
  appRow(
    "cameraMode",
    "D",
    { kind: "select", options: opts(["off", "bottom", "top"], "shell.cameraMode") },
    { default: "off", helpKey: "shell.settings.cameraMode.help" },
  ),
  appRow(
    "language",
    "D",
    { kind: "select", options: () => [{ value: "en", label: t("shell.language.en") }] },
    { default: "en" },
  ),

  // ---- E. Input (app) ---------------------------------------------------------------------
  appRow(
    "tapZones",
    "E",
    { kind: "select", options: opts(["halves", "buttons"], "shell.tapZones") },
    { default: "halves" },
  ),
  appRow(
    "holdDelayMs",
    "E",
    {
      kind: "chips",
      options: () => [300, 500, 700, 1000].map((v) => ({ value: v, label: String(v) })),
    },
    { default: 500 },
  ),
  appRow(
    "holdRepeat",
    "E",
    { kind: "segmented", options: opts(["slow", "normal", "fast"], "shell.holdRepeat") },
    { default: "normal" },
  ),
  {
    id: "holdAmount",
    scope: "app",
    section: "E",
    control: { kind: "info" },
    titleKey: "shell.settings.holdAmount.title",
    subtitleKey: "shell.settings.holdAmount.subtitle",
    subtitleVars: (ctx) => ({ counter: primaryCounter(ctx.preset).name }),
    get: (ctx) => primaryCounter(ctx.preset).holdStep ?? 10,
  },
  appRow("swipe", "E", { kind: "toggle" }, { default: false }),
  appRow(
    "confirmStyle",
    "E",
    { kind: "select", options: opts(["hold", "dialog"], "shell.confirmStyle") },
    { default: "hold" },
  ),

  // ---- F. Device (app, local only) --------------------------------------------------------
  appRow("keepAwake", "F", { kind: "toggle" }, { default: true }),
  appRow(
    "keepAwakeFallback",
    "F",
    { kind: "toggle" },
    { default: false, visibleIf: (_p, _g, ctx) => ctx.app.keepAwake },
  ),
  appRow(
    "haptics",
    "F",
    { kind: "toggle" },
    { default: true, disabledIf: (ctx) => (ctx.env.haptics ? null : UNSUPPORTED) },
  ),
  {
    id: "sounds.alerts",
    scope: "app",
    section: "F",
    control: { kind: "toggle" },
    default: true,
    titleKey: "shell.settings.soundsAlerts.title",
    subtitleKey: "shell.settings.soundsAlerts.subtitle",
    get: (ctx) => ctx.app.sounds.alerts,
    set: (_c, v) => ({ kind: "app", patch: { sounds: { alerts: Boolean(v) } } }),
  },
  {
    id: "sounds.taps",
    scope: "app",
    section: "F",
    control: { kind: "toggle" },
    default: false,
    titleKey: "shell.settings.soundsTaps.title",
    subtitleKey: "shell.settings.soundsTaps.subtitle",
    get: (ctx) => ctx.app.sounds.taps,
    set: (_c, v) => ({ kind: "app", patch: { sounds: { taps: Boolean(v) } } }),
  },
  {
    id: "sounds.volume",
    scope: "app",
    section: "F",
    control: {
      kind: "chips",
      options: () => [25, 50, 80, 100].map((v) => ({ value: v, label: String(v) })),
    },
    default: 80,
    titleKey: "shell.settings.soundsVolume.title",
    subtitleKey: "shell.settings.soundsVolume.subtitle",
    visibleIf: (_p, _g, ctx) => ctx.app.sounds.alerts || ctx.app.sounds.taps,
    get: (ctx) => Math.round(ctx.app.sounds.volume * 100),
    set: (_c, v) => ({ kind: "app", patch: { sounds: { volume: Number(v) / 100 } } }),
  },
  appRow(
    "hideSystemBars",
    "F",
    { kind: "toggle" },
    {
      default: true,
      disabledIf: (ctx) =>
        ctx.env.fullscreen ? null : "shell.settings.badge.installForFullscreen",
    },
  ),
  {
    id: "install",
    scope: "app",
    section: "F",
    control: { kind: "info" },
    titleKey: "shell.settings.install.title",
    subtitleKey: "shell.settings.install.subtitle",
    visibleIf: (_p, _g, ctx) => !ctx.env.standalone,
    get: () => "",
  },

  // ---- G. Account and data (app; FIREBASE / PAY lanes fill these in) ----------------------
  linkRow("signIn", "G", "/account"),
  linkRow("profiles", "G", "/profiles"),
  linkRow("myPresets", "G", "/builder"),
  linkRow("myImages", "G", "/images"),
  linkRow("history", "G", "/history"),
  linkRow("exportData", "G", "/account"),
  actionRow("clearImageCache", "G", "clearImageCache"),
  linkRow("removeData", "G", "/account"),
  linkRow("deleteAccount", "G", "/account"),

  // ---- H. Support and about ---------------------------------------------------------------
  actionRow("support", "H", "support"),
  actionRow("share", "H", "share"),
  linkRow("feedback", "H", "/feedback"),
  linkRow("diagnostics", "H", "/feedback"),
  actionRow("whatsNew", "H", "whatsNew"),
  {
    id: "about",
    scope: "app",
    section: "H",
    control: { kind: "info" },
    titleKey: "shell.settings.about.title",
    subtitleKey: "shell.settings.about.subtitle",
    get: (ctx) => t("shell.settings.about.version", { version: ctx.version }),
  },
];

const registry: SettingDef[] = BASE_ROWS.map((r, i) => ({ order: i * 10, ...r }));

/** Add or replace rows (by id). Used by other lanes, e.g. TIMER-UI for section C. */
export function registerSettings(defs: readonly SettingDef[]): void {
  for (const def of defs) {
    const at = registry.findIndex((r) => r.id === def.id);
    const withOrder = { order: at >= 0 ? registry[at]!.order : registry.length * 10, ...def };
    if (at >= 0) registry[at] = withOrder;
    else registry.push(withOrder);
  }
}

/** Remove rows by id (e.g. the section-C placeholder once real timer rows exist). */
export function unregisterSettings(ids: readonly string[]): void {
  for (const id of ids) {
    const at = registry.findIndex((r) => r.id === id);
    if (at >= 0) registry.splice(at, 1);
  }
}

export function allSettings(): readonly SettingDef[] {
  return registry;
}

export function getSetting(id: string): SettingDef | undefined {
  return registry.find((r) => r.id === id);
}

export function isVisible(def: SettingDef, ctx: SettingsContext): boolean {
  return def.visibleIf ? def.visibleIf(ctx.preset, ctx.game, ctx) : true;
}

/** Visible rows of a section, in order (SET-010). */
export function visibleSettings(section: SectionId, ctx: SettingsContext): SettingDef[] {
  return registry
    .filter((r) => r.section === section && isVisible(r, ctx))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function settingTitle(def: SettingDef, ctx: SettingsContext): string {
  return t(def.titleKey, def.titleVars?.(ctx));
}

export function settingSubtitle(def: SettingDef, ctx: SettingsContext): string {
  return t(def.subtitleKey, def.subtitleVars?.(ctx));
}
