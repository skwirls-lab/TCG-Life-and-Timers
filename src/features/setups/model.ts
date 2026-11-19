/**
 * Saved setups ("Presets" in the UI) ⇄ setup wizard state and running games. Pure: the launcher,
 * the setup wizard and the in-game "Save as preset" sheet all go through these, and a game always
 * starts through the wizard's own `toNewGameConfig` (seats, profiles, decks, per-seat values,
 * per-seat clock time re-keyed to engine seat ids, house rules). See src/lib/setups/types.ts for
 * the stored shape. Related reqs: PROF-010 (profiles/decks on seats), SET-012 (game-type defaults);
 * presets have no PRD id of their own.
 */
import {
  primaryCounter,
  type Game,
  type NewGameConfig,
  type Preset,
  type TimerConfig,
} from "@/engine";
import { configFromGame } from "@/features/setup/gameConfig";
import {
  FREE_MAX_PLAYERS,
  applyProfile,
  commanderArtDefault,
  setupSeatId,
  toNewGameConfig,
  updateSeat,
  usesCommanders,
  withoutSeatExtra,
  type SetupSeat,
  type SetupState,
} from "@/features/setup/setupModel";
import { normalizeLayoutId } from "@/features/settings/layoutVariants";
import type { Deck, PlayerProfile } from "@/lib/profiles/types";
import {
  MAX_SETUP_NAME,
  SetupDraftSchema,
  type SavedSetup,
  type SavedSetupConfig,
  type SavedSetupSeat,
  type SetupDraft,
} from "@/lib/setups/types";
import { jsonEqual } from "@/lib/sync/json";
import type { PresetDefaults } from "@/state/presetDefaults";

const SEAT_NAME_MAX = 40;

function compact<T extends object>(o: T): T {
  return Object.fromEntries(
    Object.entries(o).filter(
      ([, v]) =>
        v !== undefined &&
        !(typeof v === "object" && v !== null && !Array.isArray(v) && !Object.keys(v).length),
    ),
  ) as T;
}

/** Per-seat clock time on: keep only the marker (the values live on the seats). */
function timerMarker(timer: Partial<TimerConfig> | undefined): Partial<TimerConfig> | undefined {
  if (!timer) return undefined;
  const { seatExtraMs, ...rest } = timer;
  return seatExtraMs !== undefined ? { ...rest, seatExtraMs: {} } : rest;
}

/** The game-config part of a new-game config (first-player rule and commander art are kept apart). */
function configPart(cfg: NewGameConfig): SavedSetupConfig {
  const { firstPlayerRule: _f, commanderArt: _c, ...options } = cfg.options ?? {};
  return compact({
    layoutId: cfg.layoutId,
    options: compact(options),
    timer: timerMarker(cfg.timer),
    startOverrides: cfg.startOverrides ? { ...cfg.startOverrides } : undefined,
    thresholdOverrides: cfg.thresholdOverrides ? { ...cfg.thresholdOverrides } : undefined,
    enabledCounters: cfg.enabledCounters ? [...cfg.enabledCounters] : undefined,
  });
}

function cleanCommanders(list: readonly string[]): string[] {
  return list
    .map((c) => c.trim())
    .filter(Boolean)
    .slice(0, 2);
}

/** "Save as preset" from the setup wizard. */
export function draftFromSetupState(state: SetupState, preset: Preset): SetupDraft {
  const cfg = toNewGameConfig(state, preset);
  const primary = primaryCounter(preset);
  const seats = state.seats.map((s, i): SavedSetupSeat => {
    const id = setupSeatId(i);
    const start = cfg.perSeatStart?.[id]?.[primary.id];
    const threshold = cfg.perSeatThreshold?.[id]?.[primary.id];
    return compact({
      name: s.name.trim().slice(0, SEAT_NAME_MAX),
      color: s.color,
      contrast: s.contrast ? true : undefined,
      profileId: s.profileId,
      deckId: s.deckId,
      deckName: s.deckName,
      commanders: cleanCommanders(s.commanders),
      art: s.art && !s.art.origin ? s.art : undefined,
      start,
      threshold: typeof threshold === "number" ? threshold : undefined,
      clockExtraMs:
        state.timer.seatExtraMs !== undefined && s.clockExtraMs ? s.clockExtraMs : undefined,
    });
  });
  return SetupDraftSchema.parse({
    presetId: preset.id,
    presetName: preset.name.slice(0, MAX_SETUP_NAME),
    config: configPart(cfg),
    seats,
    firstPlayerRule: state.firstPlayerRule,
    ...(usesCommanders(preset) ? { commanderArt: state.commanderArt } : {}),
  });
}

/** "Save as preset" from the game menu: the running game's config and seats. */
export function draftFromGame(game: Game): SetupDraft {
  const preset = game.preset;
  const primary = primaryCounter(preset);
  const extra = game.timer.config.seatExtraMs;
  const seats = game.seats.map((s): SavedSetupSeat => {
    const threshold = game.perSeatThreshold[s.id]?.[primary.id];
    return compact({
      name: s.name.trim().slice(0, SEAT_NAME_MAX),
      color: s.color,
      contrast: s.contrast ? true : undefined,
      profileId: s.profileId,
      deckId: s.deckId,
      deckName: s.deckName,
      commanders: cleanCommanders(s.commanders),
      art: s.art && !s.art.origin ? s.art : undefined,
      start: game.perSeatStart[s.id]?.[primary.id],
      threshold: typeof threshold === "number" ? threshold : undefined,
      clockExtraMs: extra?.[s.id] ? extra[s.id] : undefined,
    });
  });
  return SetupDraftSchema.parse({
    presetId: preset.id,
    presetName: preset.name.slice(0, MAX_SETUP_NAME),
    config: configPart(configFromGame(game)),
    seats,
    firstPlayerRule: game.options.firstPlayerRule,
    ...(usesCommanders(preset) ? { commanderArt: game.options.commanderArt !== false } : {}),
  });
}

/** Profiles and decks a setup's seats refer to (whatever still exists). */
export interface SetupRefs {
  profiles: ReadonlyMap<string, PlayerProfile>;
  decks: ReadonlyMap<string, Deck>;
}

export const NO_REFS: SetupRefs = { profiles: new Map(), decks: new Map() };

let keySeq = 0;

function baseSeat(seat: SavedSetupSeat): SetupSeat {
  const out: SetupSeat = {
    key: `preset-seat-${++keySeq}`,
    name: seat.name,
    color: seat.color,
    commanders: [...seat.commanders],
  };
  if (seat.contrast) out.contrast = true;
  if (seat.art) out.art = seat.art;
  if (seat.start !== undefined) out.start = seat.start;
  if (seat.threshold !== undefined) out.threshold = seat.threshold;
  if (seat.clockExtraMs) out.clockExtraMs = seat.clockExtraMs;
  return out;
}

/**
 * Wizard state for a saved setup. A seat whose profile still exists is loaded like the profile
 * picker does (current name, deck, deck/profile art, deck commanders); the stored colour and any
 * background picked by hand win. A missing profile or deck falls back to the stored name, colour
 * and commanders, and the dangling ids are dropped.
 */
export function stateFromSetup(
  setup: SetupDraft,
  preset: Preset,
  refs: SetupRefs = NO_REFS,
  step = 0,
): SetupState {
  const n = setup.seats.length;
  const primary = primaryCounter(preset);
  const config = setup.config;
  // The setup's own config is the defaults layer: wizard values win, anything the wizard doesn't
  // hold (house-rule options, threshold overrides) comes from here. The per-seat time marker
  // stays out of it, so turning per-seat time off in "Edit before starting" sticks.
  const defaults: PresetDefaults = {
    ...config,
    ...(config.timer ? { timer: withoutSeatExtra(config.timer as TimerConfig) } : {}),
  };
  let state: SetupState = {
    step,
    presetId: preset.id,
    players: n,
    layoutId: normalizeLayoutId(n, config.layoutId ?? preset.defaults.layoutByPlayers?.[String(n)]),
    seats: setup.seats.map(baseSeat),
    startValue: config.startOverrides?.[primary.id] ?? null,
    enabledCounters: config.enabledCounters
      ? [...config.enabledCounters]
      : preset.counters.filter((c) => c.enabledByDefault).map((c) => c.id),
    firstPlayerRule: setup.firstPlayerRule,
    timer: { ...preset.defaults.timer, ...config.timer } as TimerConfig,
    commanderArt: setup.commanderArt ?? commanderArtDefault(preset, undefined),
    defaults,
  };
  setup.seats.forEach((seat, i) => {
    const profile = seat.profileId ? refs.profiles.get(seat.profileId) : undefined;
    if (!profile) {
      // Missing (or no) profile: stored name, colour and commanders only.
      if (seat.deckName && !seat.profileId)
        state = updateSeat(state, i, { deckName: seat.deckName });
      return;
    }
    const found = seat.deckId ? refs.decks.get(seat.deckId) : undefined;
    const deck = found && found.profileId === profile.id ? found : undefined;
    state = applyProfile(state, i, deck ? { profile, deck } : { profile });
    state = updateSeat(state, i, {
      color: seat.color,
      ...(seat.art ? { art: seat.art } : {}),
      ...(deck && deck.commanders.length > 0 ? {} : { commanders: [...seat.commanders] }),
    });
  });
  return state;
}

/** The engine config a saved setup starts (exactly the wizard's Start). */
export function configFromSetup(
  setup: SetupDraft,
  preset: Preset,
  refs: SetupRefs = NO_REFS,
): NewGameConfig {
  return toNewGameConfig(stateFromSetup(setup, preset, refs), preset);
}

export type StartCheck =
  | { ok: true }
  | { ok: false; reason: "tooFew" | "tooMany"; min: number; max: number }
  | { ok: false; reason: "pro" };

/** Players = seats; within the game type's min/max; 7–8 players need Pro (§13.1-A). */
export function checkPlayers(players: number, preset: Preset, can78: boolean): StartCheck {
  if (players < preset.minPlayers)
    return { ok: false, reason: "tooFew", min: preset.minPlayers, max: preset.maxPlayers };
  if (players > preset.maxPlayers)
    return { ok: false, reason: "tooMany", min: preset.minPlayers, max: preset.maxPlayers };
  if (players > FREE_MAX_PLAYERS && !can78) return { ok: false, reason: "pro" };
  return { ok: true };
}

/** "Ann, Ben, Cid, Dee · MTG Commander" (first names; default "Player N" names skipped). */
export function suggestSetupName(seatNames: readonly string[], presetName: string): string {
  const firsts = seatNames
    .map((n) => n.trim())
    .filter((n) => n && !/^player \d+$/i.test(n))
    .map((n) => n.split(/\s+/)[0]!);
  const suffix = ` · ${presetName}`;
  if (!firsts.length) return presetName.slice(0, MAX_SETUP_NAME);
  let names = firsts.join(", ");
  while (names.length + suffix.length > MAX_SETUP_NAME && names.includes(", "))
    names = names.slice(0, names.lastIndexOf(", "));
  return `${names}${suffix}`.slice(0, MAX_SETUP_NAME);
}

/** Whether two snapshots would start the same game. */
export function draftsEqual(a: SetupDraft, b: SetupDraft): boolean {
  return jsonEqual(SetupDraftSchema.parse(a), SetupDraftSchema.parse(b));
}

/** The draft part of a stored setup. */
export function draftOf(setup: SavedSetup): SetupDraft {
  const {
    id: _i,
    name: _n,
    order: _o,
    createdAt: _c,
    updatedAt: _u,
    lastUsedAt: _l,
    ...draft
  } = setup;
  return draft;
}
