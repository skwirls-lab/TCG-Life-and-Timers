/**
 * Game-scope settings draft (SET-010/011/012): the values of the active game, or of the next game
 * (preset defaults) when no game is active. Pure helpers; unit-tested.
 */
import {
  defaultGameOptions,
  type Game,
  type GameOptions,
  type NewGameConfig,
  type Preset,
  type SeatInput,
} from "@/engine";
import type { PresetDefaults } from "@/state/presetDefaults";
import { clampPlayers } from "@/features/setup/setupModel";
import { normalizeLayoutId } from "./layoutVariants";

/** Set `key` to `value`, or drop it when it equals the base (default) value. */
export function setOrOmit<V>(
  record: Record<string, V>,
  key: string,
  value: V,
  base: V,
): Record<string, V> {
  const rest = Object.fromEntries(Object.entries(record).filter(([k]) => k !== key));
  return value === base ? rest : { ...rest, [key]: value };
}

export interface GameDraft {
  presetId: string;
  players: number;
  layoutId: string;
  options: GameOptions;
  startOverrides: Record<string, number>;
  thresholdOverrides: Record<string, number | null>;
  perSeatStart: Record<string, Record<string, number>>;
  enabledCounters: string[];
}

export function draftFromGame(game: Game): GameDraft {
  return {
    presetId: game.preset.id,
    players: game.seats.length,
    layoutId: game.layoutId,
    options: { ...game.options },
    startOverrides: { ...game.startOverrides },
    thresholdOverrides: { ...game.thresholdOverrides },
    perSeatStart: structuredCloneRecord(game.perSeatStart),
    enabledCounters: [...game.enabledCounters],
  };
}

function structuredCloneRecord<T extends Record<string, Record<string, number>>>(r: T): T {
  return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, { ...v }])) as T;
}

/** Options a new game of `preset` gets (mirrors createGame's precedence). */
export function presetOptions(preset: Preset, extra?: Partial<GameOptions>): GameOptions {
  return defaultGameOptions({
    turnTracking: preset.defaults.timer.mode !== "off",
    firstPlayerRule: preset.defaults.firstPlayerRule,
    ...preset.defaults.options,
    ...extra,
  });
}

/** Next-game draft: the preset plus its stored defaults (SET-012). */
export function draftFromDefaults(preset: Preset, defaults: PresetDefaults | undefined): GameDraft {
  const players = clampPlayers(preset, defaults?.players ?? preset.defaultPlayers);
  return {
    presetId: preset.id,
    players,
    layoutId: normalizeLayoutId(
      players,
      defaults?.layoutId ?? preset.defaults.layoutByPlayers?.[String(players)],
    ),
    options: presetOptions(preset, defaults?.options),
    startOverrides: { ...defaults?.startOverrides },
    thresholdOverrides: { ...defaults?.thresholdOverrides },
    perSeatStart: structuredCloneRecord(defaults?.perSeatStart ?? {}),
    enabledCounters: defaults?.enabledCounters
      ? [...defaults.enabledCounters]
      : preset.counters.filter((c) => c.enabledByDefault).map((c) => c.id),
  };
}

/** Switching preset starts from the new preset's (stored) defaults. */
export function draftForPreset(
  preset: Preset,
  defaults: PresetDefaults | undefined,
  prevPlayers?: number,
): GameDraft {
  const d = draftFromDefaults(preset, defaults);
  if (prevPlayers === undefined || defaults?.players !== undefined) return d;
  const players = clampPlayers(preset, prevPlayers);
  return { ...d, players, layoutId: normalizeLayoutId(players, d.layoutId) };
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, x]) => [k, sortKeys(x)]),
    );
  }
  return v;
}

/**
 * SET-011: structural changes (preset, player count, starting values, thresholds, enabled
 * counters) reset the game; options and the layout variant apply live.
 */
export function isStructuralChange(before: GameDraft, after: GameDraft): boolean {
  return (
    before.presetId !== after.presetId ||
    before.players !== after.players ||
    !same(before.startOverrides, after.startOverrides) ||
    !same(before.thresholdOverrides, after.thresholdOverrides) ||
    !same(before.perSeatStart, after.perSeatStart) ||
    !same([...before.enabledCounters].sort(), [...after.enabledCounters].sort())
  );
}

/** Option keys whose value changed (applied live with SET_OPTION). */
export function changedOptions(before: GameDraft, after: GameDraft): (keyof GameOptions)[] {
  return (Object.keys(after.options) as (keyof GameOptions)[]).filter(
    (k) => before.options[k] !== after.options[k],
  );
}

/** Seats for a re-created game: the old seats by index, plus blanks (SET-011). */
export function seatsForPlayers(seats: readonly SeatInput[], players: number): SeatInput[] {
  const out = seats.slice(0, players);
  while (out.length < players) out.push({});
  return out;
}

/** Engine config for a re-created game (keeping seats by index and the timer config). */
export function configFromDraft(
  draft: GameDraft,
  preset: Preset,
  seats: readonly SeatInput[],
  timer?: NewGameConfig["timer"],
): NewGameConfig {
  const players = clampPlayers(preset, draft.players);
  return {
    preset,
    players,
    seats: seatsForPlayers(seats, players),
    layoutId: normalizeLayoutId(players, draft.layoutId),
    options: { ...draft.options },
    ...(timer ? { timer } : {}),
    startOverrides: { ...draft.startOverrides },
    thresholdOverrides: { ...draft.thresholdOverrides },
    perSeatStart: structuredCloneRecord(draft.perSeatStart),
    enabledCounters: [...draft.enabledCounters],
  };
}

/** Stored preset defaults for a draft ("Save as default for <preset>"). */
export function presetDefaultsFromDraft(draft: GameDraft): PresetDefaults {
  return {
    players: draft.players,
    layoutId: draft.layoutId,
    options: { ...draft.options },
    startOverrides: { ...draft.startOverrides },
    thresholdOverrides: { ...draft.thresholdOverrides },
    enabledCounters: [...draft.enabledCounters],
  };
}
