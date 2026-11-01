"use client";
/**
 * App-scope settings (PRD §13.1 D/E/F) persisted in the Dexie `settings` table under key "app".
 * Unknown/invalid stored fields fall back to their defaults individually (forward-compatible).
 */
import { z } from "zod";
import { create } from "zustand";
import { APP_SETTINGS_KEY, getDb, setSetting, type TcgDb } from "@/lib/db";

export const AppSettingsSchema = z.object({
  // D. Appearance
  theme: z.enum(["dark", "light", "highContrast"]),
  cardLayout: z.enum(["default", "nameOnly", "bigFont"]),
  colorizeMiniGrids: z.boolean(),
  badges: z.enum(["nonDefault", "always", "hidden"]),
  bubbleMs: z.number().int().min(500).max(10_000),
  autoHideMenu: z.boolean(),
  diceAnimations: z.boolean(),
  reduceMotion: z.enum(["system", "always", "never"]),
  onePlayerMode: z.boolean(),
  cameraMode: z.enum(["off", "bottom", "top"]),
  language: z.enum(["en"]),
  // E. Input
  tapZones: z.enum(["halves", "buttons"]),
  holdDelayMs: z.number().int().min(100).max(3000),
  holdRepeat: z.enum(["slow", "normal", "fast"]),
  swipe: z.boolean(),
  confirmStyle: z.enum(["hold", "dialog"]),
  // F. Device (local only)
  keepAwake: z.boolean(),
  keepAwakeFallback: z.boolean(),
  haptics: z.boolean(),
  sounds: z.object({ alerts: z.boolean(), taps: z.boolean(), volume: z.number().min(0).max(1) }),
  hideSystemBars: z.boolean(),
  // HIST-031
  whoWonPrompt: z.enum(["always", "unclear", "never"]),
});

export type AppSettings = z.infer<typeof AppSettingsSchema>;

export function defaultAppSettings(): AppSettings {
  return {
    theme: "dark",
    cardLayout: "default",
    colorizeMiniGrids: true,
    badges: "nonDefault",
    bubbleMs: 2000,
    autoHideMenu: false,
    diceAnimations: true,
    reduceMotion: "system",
    onePlayerMode: false,
    cameraMode: "off",
    language: "en",
    tapZones: "halves",
    holdDelayMs: 500,
    holdRepeat: "normal",
    swipe: false,
    confirmStyle: "hold",
    keepAwake: true,
    keepAwakeFallback: false,
    haptics: true,
    sounds: { alerts: true, taps: false, volume: 0.8 },
    hideSystemBars: true,
    whoWonPrompt: "unclear",
  };
}

/** Merge a stored value with defaults, field by field. */
export function mergeSettings(stored: unknown): AppSettings {
  const out = defaultAppSettings();
  if (typeof stored !== "object" || stored === null) return out;
  const src = stored as Record<string, unknown>;
  const shape = AppSettingsSchema.shape;
  const target = out as Record<string, unknown>;
  for (const key of Object.keys(shape) as (keyof AppSettings)[]) {
    if (key === "sounds") continue;
    const parsed = shape[key].safeParse(src[key]);
    if (parsed.success) target[key] = parsed.data;
  }
  const sounds = src.sounds;
  if (typeof sounds === "object" && sounds !== null) {
    const s = sounds as Record<string, unknown>;
    const ss = shape.sounds.shape;
    for (const k of ["alerts", "taps", "volume"] as const) {
      const parsed = ss[k].safeParse(s[k]);
      if (parsed.success) (out.sounds as Record<string, unknown>)[k] = parsed.data;
    }
  }
  return out;
}

export type SettingsPatch = Partial<Omit<AppSettings, "sounds">> & {
  sounds?: Partial<AppSettings["sounds"]>;
};

interface SettingsState {
  settings: AppSettings;
  hydrated: boolean;
  load: () => Promise<AppSettings>;
  update: (patch: SettingsPatch) => Promise<void>;
  reset: () => Promise<void>;
}

let dbFn: () => TcgDb = getDb;

/** Test hook: inject a database (no args → default). */
export function configureSettingsStore(db?: () => TcgDb): void {
  dbFn = db ?? getDb;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: defaultAppSettings(),
  hydrated: false,
  load: async () => {
    const row = await dbFn().settings.get(APP_SETTINGS_KEY);
    const settings = mergeSettings(row?.value);
    set({ settings, hydrated: true });
    return settings;
  },
  update: async (patch) => {
    const cur = get().settings;
    const next = mergeSettings({ ...cur, ...patch, sounds: { ...cur.sounds, ...patch.sounds } });
    set({ settings: next });
    await setSetting(APP_SETTINGS_KEY, next, dbFn());
  },
  reset: async () => {
    const next = defaultAppSettings();
    set({ settings: next });
    await setSetting(APP_SETTINGS_KEY, next, dbFn());
  },
}));

/** Read one setting reactively. */
export function useSetting<K extends keyof AppSettings>(key: K): AppSettings[K] {
  return useSettingsStore((s) => s.settings[key]);
}
