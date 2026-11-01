/**
 * New-game config helpers shared by the launcher, the setup wizard and settings (GAME-001,
 * GAME-016, SET-011). The last config is stored (without the preset snapshot) in Dexie `kv` so
 * "Quick start: same as last game" is one tap.
 */
import { z } from "zod";
import {
  NewGameConfigSchema,
  type Game,
  type NewGameConfig,
  type Preset,
  type SeatInput,
} from "@/engine";
import { getDb, type TcgDb } from "@/lib/db";
import { getBuiltInPreset } from "@/presets";

export const LAST_CONFIG_KEY = "lastGameConfig";

export const StoredGameConfigSchema = NewGameConfigSchema.omit({
  preset: true,
  id: true,
  previousResult: true,
  firstSeatId: true,
}).extend({ presetId: z.string().min(1) });

export type StoredGameConfig = z.infer<typeof StoredGameConfigSchema>;

/** Seat inputs that survive into a new game (names, art, colors, profiles; no ids). */
export function seatInputsOf(seats: readonly SeatInput[]): SeatInput[] {
  return seats.map((s) => {
    const out: SeatInput = {};
    if (s.name !== undefined) out.name = s.name;
    if (s.color !== undefined) out.color = s.color;
    if (s.art !== undefined) out.art = s.art;
    if (s.profileId !== undefined) out.profileId = s.profileId;
    if (s.deckId !== undefined) out.deckId = s.deckId;
    if (s.deckName !== undefined) out.deckName = s.deckName;
    if (s.commanders !== undefined && s.commanders.length > 0) out.commanders = [...s.commanders];
    if (s.contrast) out.contrast = true;
    return out;
  });
}

/** Strip the frozen preset (and per-game ids) for storage. */
export function toStoredConfig(config: NewGameConfig): StoredGameConfig {
  const { preset, id: _id, previousResult: _p, firstSeatId: _f, seats, ...rest } = config;
  const defined = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
  return {
    ...defined,
    presetId: preset.id,
    ...(seats ? { seats: seatInputsOf(seats) } : {}),
  } as StoredGameConfig;
}

/** Rebuild a config from storage; null when the preset no longer exists or the row is invalid. */
export function fromStoredConfig(
  raw: unknown,
  lookup: (id: string) => Preset | undefined = getBuiltInPreset,
): NewGameConfig | null {
  const parsed = StoredGameConfigSchema.safeParse(raw);
  if (!parsed.success) return null;
  const { presetId, ...rest } = parsed.data;
  const preset = lookup(presetId);
  if (!preset) return null;
  const players = rest.players ?? rest.seats?.length ?? preset.defaultPlayers;
  if (players < preset.minPlayers || players > preset.maxPlayers) return null;
  return { ...rest, preset, players } as NewGameConfig;
}

export async function saveLastConfig(config: NewGameConfig, db: TcgDb = getDb()): Promise<void> {
  await db.kv.put({ key: LAST_CONFIG_KEY, value: toStoredConfig(config) });
}

export async function loadLastConfig(
  db: TcgDb = getDb(),
  lookup?: (id: string) => Preset | undefined,
): Promise<NewGameConfig | null> {
  const row = await db.kv.get(LAST_CONFIG_KEY);
  return row ? fromStoredConfig(row.value, lookup) : null;
}

/** Seats of a game as inputs, kept by index (SET-011 "keeping names and art"). */
export function seatsFromGame(game: Pick<Game, "seats">): SeatInput[] {
  return game.seats.map((s) => {
    const out: SeatInput = { id: s.id, name: s.name, color: s.color, contrast: s.contrast };
    if (s.art) out.art = s.art;
    if (s.profileId !== undefined) out.profileId = s.profileId;
    if (s.deckId !== undefined) out.deckId = s.deckId;
    if (s.deckName !== undefined) out.deckName = s.deckName;
    if (s.commanders.length > 0) out.commanders = [...s.commanders];
    if (s.rotationOverride !== undefined) out.rotationOverride = s.rotationOverride;
    return out;
  });
}

/** The game-scope config of an existing game (for structural re-creation and quick start). */
export function configFromGame(game: Game): NewGameConfig {
  return {
    preset: game.preset,
    players: game.seats.length,
    seats: seatsFromGame(game),
    layoutId: game.layoutId,
    options: { ...game.options },
    timer: { ...game.timer.config },
    startOverrides: { ...game.startOverrides },
    thresholdOverrides: { ...game.thresholdOverrides },
    perSeatStart: { ...game.perSeatStart },
    perSeatThreshold: { ...game.perSeatThreshold },
    enabledCounters: [...game.enabledCounters],
  };
}
