// @req SET-001 @req SET-012
import { Dexie } from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createGame, seededRng } from "@/engine";
import { APP_SETTINGS_KEY, presetDefaultsKey, setSetting, TcgDb } from "@/lib/db";
import { testPreset } from "../../tests/unit/helpers/engine";
import {
  applyPresetDefaults,
  getPresetDefaults,
  presetDefaultsFromGame,
  restorePresetDefaults,
  savePresetDefaults,
} from "./presetDefaults";
import {
  configureSettingsStore,
  defaultAppSettings,
  mergeSettings,
  useSettingsStore,
} from "./settingsStore";

let db: TcgDb;
beforeEach(() => {
  db = new TcgDb(`settings-${Math.random()}`);
  configureSettingsStore(() => db);
  useSettingsStore.setState({ settings: defaultAppSettings(), hydrated: false });
});
afterEach(async () => {
  configureSettingsStore();
  db.close();
  await Dexie.delete(db.name);
});

describe("app settings", () => {
  it("defaults cover the §13.1 D/E/F rows", () => {
    expect(defaultAppSettings()).toMatchObject({
      theme: "dark",
      cardLayout: "default",
      badges: "nonDefault",
      bubbleMs: 2000,
      holdDelayMs: 500,
      holdRepeat: "normal",
      swipe: false,
      confirmStyle: "hold",
      keepAwake: true,
      haptics: true,
      sounds: { alerts: true, taps: false, volume: 0.8 },
      whoWonPrompt: "unclear",
      cameraMode: "off",
      reduceMotion: "system",
    });
  });

  // @req PWA-006 full screen is opt-in for new users; an explicit stored choice is kept
  it("full screen during games is off by default but stored values are kept", () => {
    expect(defaultAppSettings().hideSystemBars).toBe(false);
    expect(mergeSettings({}).hideSystemBars).toBe(false);
    expect(mergeSettings({ hideSystemBars: true }).hideSystemBars).toBe(true);
  });

  it("merges stored values field by field, dropping invalid ones", () => {
    expect(mergeSettings(null)).toEqual(defaultAppSettings());
    const m = mergeSettings({
      theme: "light",
      bubbleMs: -5,
      sounds: { volume: 2, taps: true },
      extra: 1,
    });
    expect(m.theme).toBe("light");
    expect(m.bubbleMs).toBe(2000);
    expect(m.sounds).toEqual({ alerts: true, taps: true, volume: 0.8 });
    expect(mergeSettings({ sounds: "loud" }).sounds).toEqual(defaultAppSettings().sounds);
  });

  it("load / update / reset persist to the settings table", async () => {
    await setSetting(APP_SETTINGS_KEY, { haptics: false }, db);
    const loaded = await useSettingsStore.getState().load();
    expect(loaded.haptics).toBe(false);
    expect(useSettingsStore.getState().hydrated).toBe(true);
    await useSettingsStore.getState().update({ theme: "highContrast", sounds: { volume: 0.5 } });
    expect(useSettingsStore.getState().settings.sounds).toEqual({
      alerts: true,
      taps: false,
      volume: 0.5,
    });
    const row = await db.settings.get(APP_SETTINGS_KEY);
    expect(row?.value).toMatchObject({ theme: "highContrast" });
    await useSettingsStore.getState().update({});
    await useSettingsStore.getState().reset();
    expect(useSettingsStore.getState().settings).toEqual(defaultAppSettings());
    useSettingsStore.setState({ hydrated: false });
    expect((await useSettingsStore.getState().load()).theme).toBe("dark");
  });
});

describe("preset defaults (SET-012)", () => {
  it("save as default, read back, apply to a new game, restore", async () => {
    const game = createGame(
      {
        preset: testPreset(),
        players: 3,
        startOverrides: { life: 30 },
        options: { autoKO: "prompt" },
      },
      seededRng(1),
      0,
    );
    const defaults = presetDefaultsFromGame(game);
    await savePresetDefaults("test.all", defaults, db);
    const back = await getPresetDefaults("test.all", db);
    expect(back).toMatchObject({
      players: 3,
      startOverrides: { life: 30 },
      options: { autoKO: "prompt" },
    });
    const cfg = applyPresetDefaults(
      { preset: testPreset(), players: undefined, options: { autoRevive: false } },
      back,
    );
    expect(cfg.players).toBe(3);
    expect(cfg.options).toMatchObject({ autoKO: "prompt", autoRevive: false });
    const g2 = createGame(cfg, seededRng(2), 0);
    expect(g2.seats).toHaveLength(3);
    expect(applyPresetDefaults({ preset: testPreset() }, undefined)).toEqual({
      preset: testPreset(),
    });
    await restorePresetDefaults("test.all", db);
    expect(await getPresetDefaults("test.all", db)).toBeUndefined();
    await db.settings.put({ key: presetDefaultsKey("bad"), value: { players: "x" }, updatedAt: 0 });
    expect(await getPresetDefaults("bad", db)).toBeUndefined();
  });
});

describe("settings load race (D-054)", () => {
  // @req SET-001
  it("a change made while load() is reading is not overwritten by the stored value", async () => {
    const { useSettingsStore } = await import("./settingsStore");
    await useSettingsStore.getState().update({ theme: "dark" });
    const pending = useSettingsStore.getState().load();
    await useSettingsStore.getState().update({ theme: "light" });
    await pending;
    expect(useSettingsStore.getState().settings.theme).toBe("light");
    expect(useSettingsStore.getState().hydrated).toBe(true);
  });
});
