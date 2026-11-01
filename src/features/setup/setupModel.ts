/**
 * Setup wizard state (GAME-001, LAY-005, GAME-013): pure functions so the flow is unit-testable.
 * preset → players + layout → seats → options → Start.
 */
import {
  SEAT_COLORS,
  primaryCounter,
  type ArtRef,
  type FirstPlayerRule,
  type NewGameConfig,
  type Preset,
} from "@/engine";
import type { ProfileSelection } from "@/lib/profiles/types";
import { applyPresetDefaults, type PresetDefaults } from "@/state/presetDefaults";
import { normalizeLayoutId } from "@/features/settings/layoutVariants";

export const SETUP_STEPS = ["preset", "players", "seats", "options"] as const;
export type SetupStep = (typeof SETUP_STEPS)[number];

/** Players chips are capped at 2–6 for everyone; 7–8 are Pro (§13.1-A, Q8). */
export const FREE_MAX_PLAYERS = 6;

export interface SetupSeat {
  /** Stable React key (not the engine seat id). */
  key: string;
  name: string;
  color: string;
  profileId?: string;
  deckId?: string;
  deckName?: string;
  art?: ArtRef;
  contrast?: boolean;
  commanders: string[];
}

export interface SetupState {
  step: number;
  presetId: string;
  players: number;
  layoutId: string;
  seats: SetupSeat[];
  /** Primary counter start override; null = the preset (or saved default) value. */
  startValue: number | null;
  enabledCounters: string[];
  firstPlayerRule: FirstPlayerRule;
  /** Stored preset defaults (SET-012) for the chosen preset. */
  defaults?: PresetDefaults;
}

let keySeq = 0;
const nextKey = () => `seat-${++keySeq}`;

function blankSeat(index: number, used: ReadonlySet<string>): SetupSeat {
  const color = SEAT_COLORS.find((c) => !used.has(c)) ?? SEAT_COLORS[index % SEAT_COLORS.length]!;
  return { key: nextKey(), name: "", color, commanders: [] };
}

/** Grow or shrink the seat list, keeping existing seats by index. */
export function resizeSeats(seats: readonly SetupSeat[], players: number): SetupSeat[] {
  const out = seats.slice(0, players);
  const used = new Set(out.map((s) => s.color));
  while (out.length < players) {
    const seat = blankSeat(out.length, used);
    used.add(seat.color);
    out.push(seat);
  }
  return out;
}

export function clampPlayers(preset: Preset, players: number): number {
  return Math.min(preset.maxPlayers, Math.max(preset.minPlayers, players));
}

/** Player-count chips for a preset (min…max; 7/8 flagged as Pro). */
export function playerChoices(preset: Preset): { value: number; pro: boolean }[] {
  const out: { value: number; pro: boolean }[] = [];
  for (let n = Math.max(2, preset.minPlayers); n <= Math.min(8, preset.maxPlayers); n++) {
    out.push({ value: n, pro: n > FREE_MAX_PLAYERS });
  }
  if (out.length === 0) out.push({ value: preset.minPlayers, pro: false });
  return out;
}

function defaultEnabled(preset: Preset): string[] {
  return preset.counters.filter((c) => c.enabledByDefault).map((c) => c.id);
}

/** Initial (or re-initialised) state for a preset, applying its stored defaults. */
export function stateForPreset(
  preset: Preset,
  defaults: PresetDefaults | undefined,
  prev?: Pick<SetupState, "seats" | "step">,
): SetupState {
  const players = clampPlayers(preset, defaults?.players ?? preset.defaultPlayers);
  const primary = primaryCounter(preset);
  const savedStart = defaults?.startOverrides?.[primary.id];
  return {
    step: prev?.step ?? 0,
    presetId: preset.id,
    players,
    layoutId: normalizeLayoutId(
      players,
      defaults?.layoutId ?? preset.defaults.layoutByPlayers?.[String(players)],
    ),
    seats: resizeSeats(prev?.seats ?? [], players),
    startValue: savedStart ?? null,
    enabledCounters: defaults?.enabledCounters
      ? [...defaults.enabledCounters]
      : defaultEnabled(preset),
    firstPlayerRule:
      defaults?.options?.firstPlayerRule ??
      preset.defaults.options?.firstPlayerRule ??
      preset.defaults.firstPlayerRule,
    ...(defaults ? { defaults } : {}),
  };
}

export function setPlayers(state: SetupState, preset: Preset, players: number): SetupState {
  const n = clampPlayers(preset, players);
  return {
    ...state,
    players: n,
    seats: resizeSeats(state.seats, n),
    layoutId: normalizeLayoutId(n, state.layoutId),
  };
}

/** LAY-005: move a seat up (-1) or down (+1); turn order follows seat order. */
export function moveSeat(state: SetupState, index: number, dir: -1 | 1): SetupState {
  const to = index + dir;
  if (to < 0 || to >= state.seats.length) return state;
  const seats = [...state.seats];
  [seats[index], seats[to]] = [seats[to]!, seats[index]!];
  return { ...state, seats };
}

export function updateSeat(
  state: SetupState,
  index: number,
  patch: Partial<Omit<SetupSeat, "key">>,
): SetupState {
  return {
    ...state,
    seats: state.seats.map((s, i) => (i === index ? { ...s, ...patch } : s)),
  };
}

/** PROF-002: a loaded profile (+ deck) sets name, color, art and commanders. */
export function applyProfile(state: SetupState, index: number, sel: ProfileSelection): SetupState {
  const { profile, deck } = sel;
  const patch: Partial<SetupSeat> = {
    name: profile.name,
    color: profile.color,
    profileId: profile.id,
    contrast: profile.contrast,
    commanders: deck?.commanders ? [...deck.commanders] : [],
  };
  const art = deck?.art ?? profile.art;
  if (art) patch.art = art;
  if (deck) {
    patch.deckId = deck.id;
    patch.deckName = deck.name;
  } else {
    patch.deckId = undefined;
    patch.deckName = undefined;
  }
  return updateSeat(state, index, patch);
}

export function toggleCounter(state: SetupState, counterId: string, on: boolean): SetupState {
  const has = state.enabledCounters.includes(counterId);
  if (has === on) return state;
  return {
    ...state,
    enabledCounters: on
      ? [...state.enabledCounters, counterId]
      : state.enabledCounters.filter((id) => id !== counterId),
  };
}

/** The effective primary start shown in the options step. */
export function effectiveStart(state: SetupState, preset: Preset): number {
  return state.startValue ?? primaryCounter(preset).start;
}

/** Build the engine config (stored preset defaults fill anything the wizard didn't set). */
export function toNewGameConfig(state: SetupState, preset: Preset): NewGameConfig {
  const primary = primaryCounter(preset);
  const config: NewGameConfig = {
    preset,
    players: state.players,
    layoutId: state.layoutId,
    seats: state.seats.map((s) => {
      const seat: NonNullable<NewGameConfig["seats"]>[number] = { name: s.name, color: s.color };
      if (s.profileId) seat.profileId = s.profileId;
      if (s.deckId) seat.deckId = s.deckId;
      if (s.deckName) seat.deckName = s.deckName;
      if (s.art) seat.art = s.art;
      if (s.contrast) seat.contrast = true;
      const commanders = s.commanders.map((c) => c.trim()).filter(Boolean);
      if (commanders.length) seat.commanders = commanders;
      return seat;
    }),
    options: { firstPlayerRule: state.firstPlayerRule },
    enabledCounters: [...state.enabledCounters],
    ...(state.startValue !== null ? { startOverrides: { [primary.id]: state.startValue } } : {}),
  };
  return applyPresetDefaults(config, state.defaults);
}

/** Seats can name commanders when the preset has per-commander or commander-damage counters. */
export function usesCommanders(preset: Preset): boolean {
  return preset.counters.some((c) => c.perCommander || c.scope === "playerVsOpponent");
}

/** Optional (non-primary) counters the options step can toggle (CTR-001). */
export function optionalCounters(preset: Preset) {
  return preset.counters.filter((c) => !c.isPrimary);
}
