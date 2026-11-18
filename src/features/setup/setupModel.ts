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
  type TimerConfig,
} from "@/engine";
import { selectionToSeatActions } from "@/lib/profiles/apply";
import type { ProfileSelection } from "@/lib/profiles/types";
import { applyPresetDefaults, type PresetDefaults } from "@/state/presetDefaults";
import { normalizeLayoutId } from "@/features/settings/layoutVariants";
import { perSeatChips } from "@/presets";

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
  /** PRE-013 per-seat primary start; undefined = the game's start value. */
  start?: number;
  /** PRE-013 per-seat primary threshold; undefined = the preset's threshold. */
  threshold?: number;
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
  /** §13.1-C clock for the new game (preset default + stored default; D-058). */
  timer: TimerConfig;
  /** PROF-010/ART-008: "Set seat backgrounds to commanders" (commander-type presets). */
  commanderArt: boolean;
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
    // Per-seat values belong to the previous preset's primary counter.
    seats: resizeSeats(prev?.seats ?? [], players).map(clearPerSeat),
    startValue: savedStart ?? null,
    enabledCounters: defaults?.enabledCounters
      ? [...defaults.enabledCounters]
      : defaultEnabled(preset),
    firstPlayerRule:
      defaults?.options?.firstPlayerRule ??
      preset.defaults.options?.firstPlayerRule ??
      preset.defaults.firstPlayerRule,
    timer: { ...preset.defaults.timer, ...defaults?.timer },
    commanderArt: commanderArtDefault(preset, defaults),
    ...(defaults ? { defaults } : {}),
  };
}

function clearPerSeat(seat: SetupSeat): SetupSeat {
  const { start: _s, threshold: _t, ...rest } = seat;
  return rest;
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

/**
 * PROF-002: a loaded profile (+ deck) sets name, color, art and commanders — the same seat
 * actions the seat menu dispatches (selectionToSeatActions), folded into the setup seat.
 */
export function applyProfile(state: SetupState, index: number, sel: ProfileSelection): SetupState {
  const current = state.seats[index];
  const patch: Partial<SetupSeat> = {
    commanders: [],
    deckId: undefined,
    deckName: undefined,
  };
  for (const a of selectionToSeatActions(setupSeatId(index), sel, current)) {
    if (a.type === "SEAT_SET_PROFILE") {
      patch.profileId = a.profileId;
      if (a.name) patch.name = a.name;
      patch.deckId = a.deckId;
      patch.deckName = a.deckName;
    } else if (a.type === "SEAT_SET_COLOR") patch.color = a.color;
    else if (a.type === "SEAT_SET_CONTRAST") patch.contrast = a.contrast;
    else if (a.type === "SEAT_SET_ART") patch.art = a.art;
    else if (a.type === "SEAT_SET_COMMANDERS") patch.commanders = [...a.commanders];
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

/** Engine seat id for setup seat `index` (matches createGame's default ids). */
export const setupSeatId = (index: number): string => `s${index + 1}`;

/** PRE-013: the seat's effective primary start in the options step. */
export function seatStart(state: SetupState, preset: Preset, index: number): number {
  return state.seats[index]?.start ?? effectiveStart(state, preset);
}

/** PRE-013: the seat's effective primary threshold (undefined when the primary has none). */
/**
 * A-10: a game-wide starting-value picker only makes sense when the start can vary: presets with
 * quick-start values, or counters that don't simply count up from 0 (damage, lore).
 */
export function offersStartPicker(preset: Preset): boolean {
  const primary = primaryCounter(preset);
  return !!preset.quickStartValues?.length || !(primary.start === 0 && primary.direction === "up");
}

export function seatThreshold(
  state: SetupState,
  preset: Preset,
  index: number,
): number | undefined {
  return state.seats[index]?.threshold ?? primaryCounter(preset).threshold?.value;
}

/** Per-seat maps for NewGameConfig (only seats that differ from the game-wide value). */
export function perSeatMaps(
  state: SetupState,
  preset: Preset,
): Pick<NewGameConfig, "perSeatStart" | "perSeatThreshold"> {
  const primary = primaryCounter(preset);
  const chips = perSeatChips(preset);
  const perSeatStart: Record<string, Record<string, number>> = {};
  const perSeatThreshold: Record<string, Record<string, number | null>> = {};
  state.seats.forEach((s, i) => {
    const id = setupSeatId(i);
    if (chips?.start && s.start !== undefined && s.start !== effectiveStart(state, preset))
      perSeatStart[id] = { [primary.id]: s.start };
    if (chips?.threshold && s.threshold !== undefined && s.threshold !== primary.threshold?.value)
      perSeatThreshold[id] = { [primary.id]: s.threshold };
  });
  return {
    ...(Object.keys(perSeatStart).length ? { perSeatStart } : {}),
    ...(Object.keys(perSeatThreshold).length ? { perSeatThreshold } : {}),
  };
}

/** Build the engine config (stored preset defaults fill anything the wizard didn't set). */
export function toNewGameConfig(state: SetupState, preset: Preset): NewGameConfig {
  const primary = primaryCounter(preset);
  const config: NewGameConfig = {
    preset,
    players: state.players,
    layoutId: state.layoutId,
    seats: state.seats.map((s, i) => {
      const seat: NonNullable<NewGameConfig["seats"]>[number] = {
        id: setupSeatId(i),
        name: s.name,
        color: s.color,
      };
      if (s.profileId) seat.profileId = s.profileId;
      if (s.deckId) seat.deckId = s.deckId;
      if (s.deckName) seat.deckName = s.deckName;
      if (s.art) seat.art = s.art;
      if (s.contrast) seat.contrast = true;
      const commanders = s.commanders.map((c) => c.trim()).filter(Boolean);
      if (commanders.length) seat.commanders = commanders;
      return seat;
    }),
    options: {
      firstPlayerRule: state.firstPlayerRule,
      // PROF-010: absent = on, so only an "off" (or overriding a stored "off") is written.
      ...(usesCommanders(preset) &&
      (!state.commanderArt || state.defaults?.options?.commanderArt === false)
        ? { commanderArt: state.commanderArt }
        : {}),
      // Any clock mode tracks turns (as TIMER_SET_CONFIG does mid-game).
      ...(state.timer.mode !== "off" ? { turnTracking: true } : {}),
    },
    timer: { ...state.timer },
    enabledCounters: [...state.enabledCounters],
    ...(state.startValue !== null ? { startOverrides: { [primary.id]: state.startValue } } : {}),
    ...perSeatMaps(state, preset),
  };
  return applyPresetDefaults(config, state.defaults);
}

/** §13.1-C: patch the setup clock (time keys are ms). */
export function setTimer(state: SetupState, patch: Partial<TimerConfig>): SetupState {
  return { ...state, timer: { ...state.timer, ...patch } };
}

/**
 * PROF-010/ART-008: the "Set seat backgrounds to commanders" value a new game starts with — the
 * stored preset default, else the preset's own default, else on (commander-type presets only).
 */
export function commanderArtDefault(preset: Preset, defaults: PresetDefaults | undefined): boolean {
  return (
    defaults?.options?.commanderArt ??
    preset.defaults.options?.commanderArt ??
    usesCommanders(preset)
  );
}

/** Seats can name commanders when the preset has per-commander or commander-damage counters. */
export function usesCommanders(preset: Preset): boolean {
  return preset.counters.some((c) => c.perCommander || c.scope === "playerVsOpponent");
}

/** Optional (non-primary) counters the options step can toggle (CTR-001). */
export function optionalCounters(preset: Preset) {
  return preset.counters.filter((c) => !c.isPrimary);
}

/**
 * PRE-013: set one seat's value for a counter in a per-seat map (`perSeatStart` /
 * `perSeatThreshold`); a value equal to `base` removes the entry (and an emptied seat).
 */
export function setPerSeatValue<V extends number | null>(
  map: Readonly<Record<string, Readonly<Record<string, V>>>>,
  seatId: string,
  counterId: string,
  value: NoInfer<V>,
  base: NoInfer<V>,
): Record<string, Record<string, V>> {
  const seat: Record<string, V> = Object.fromEntries(
    Object.entries(map[seatId] ?? {}).filter(([k]) => k !== counterId),
  );
  if (value !== base) seat[counterId] = value;
  const out: Record<string, Record<string, V>> = {};
  for (const [id, values] of Object.entries(map)) if (id !== seatId) out[id] = { ...values };
  if (Object.keys(seat).length) out[seatId] = seat;
  return out;
}
