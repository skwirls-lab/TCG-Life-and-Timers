/**
 * Per-preset defaults (SET-012, scope "Preset default"): a Partial game config stored per preset
 * id in the Dexie `settings` table. "Save as default" copies the current game's game-scope values;
 * "Restore defaults" deletes the override.
 */
import { NewGameConfigSchema, type Game, type GameOptions, type NewGameConfig } from "@/engine";
import {
  deleteSetting,
  getDb,
  getSetting,
  presetDefaultsKey,
  setSetting,
  type TcgDb,
} from "@/lib/db";

export const PresetDefaultsSchema = NewGameConfigSchema.pick({
  players: true,
  layoutId: true,
  options: true,
  timer: true,
  startOverrides: true,
  thresholdOverrides: true,
  perSeatStart: true,
  perSeatThreshold: true,
  enabledCounters: true,
}).partial();

export type PresetDefaults = Pick<
  NewGameConfig,
  | "players"
  | "layoutId"
  | "options"
  | "timer"
  | "startOverrides"
  | "thresholdOverrides"
  | "perSeatStart"
  | "perSeatThreshold"
  | "enabledCounters"
>;

export async function getPresetDefaults(
  presetId: string,
  db: TcgDb = getDb(),
): Promise<PresetDefaults | undefined> {
  return getSetting(presetDefaultsKey(presetId), PresetDefaultsSchema, db);
}

export async function savePresetDefaults(
  presetId: string,
  defaults: PresetDefaults,
  db: TcgDb = getDb(),
): Promise<void> {
  await setSetting(presetDefaultsKey(presetId), PresetDefaultsSchema.parse(defaults), db);
}

/**
 * Remember one game option as the preset's default without touching its other stored defaults
 * (e.g. the setup flow's "Set seat backgrounds to commanders", PROF-010).
 */
export async function rememberPresetOption<K extends keyof GameOptions>(
  presetId: string,
  key: K,
  value: GameOptions[K],
  db: TcgDb = getDb(),
): Promise<void> {
  const current = await getPresetDefaults(presetId, db);
  await savePresetDefaults(
    presetId,
    { ...current, options: { ...current?.options, [key]: value } },
    db,
  );
}

export async function restorePresetDefaults(presetId: string, db: TcgDb = getDb()): Promise<void> {
  await deleteSetting(presetDefaultsKey(presetId), db);
}

/** Game-scope values of a running game, for "Save as default for <preset>". */
export function presetDefaultsFromGame(game: Game): PresetDefaults {
  // TMR-060 per-seat clock extras are per game (seat ids), never a preset default.
  const { seatExtraMs: _x, ...timer } = game.timer.config;
  return {
    players: game.seats.length,
    layoutId: game.layoutId,
    options: { ...game.options },
    timer,
    startOverrides: { ...game.startOverrides },
    thresholdOverrides: { ...game.thresholdOverrides },
    enabledCounters: [...game.enabledCounters],
  };
}

/** Apply stored defaults to a new-game config (explicit config values win). */
export function applyPresetDefaults(
  config: NewGameConfig,
  defaults: PresetDefaults | undefined,
): NewGameConfig {
  if (!defaults) return config;
  const defined = Object.fromEntries(
    Object.entries(config).filter(([, v]) => v !== undefined),
  ) as unknown as NewGameConfig;
  return {
    ...defaults,
    ...defined,
    options: { ...defaults.options, ...config.options },
    timer: { ...defaults.timer, ...config.timer },
    startOverrides: { ...defaults.startOverrides, ...config.startOverrides },
    thresholdOverrides: { ...defaults.thresholdOverrides, ...config.thresholdOverrides },
  };
}
