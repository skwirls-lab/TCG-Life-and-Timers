"use client";
/**
 * Settings page state: which game-scope draft is being edited (active game vs next game), and how
 * changes are applied (SET-011 structural confirm + re-create, live SET_OPTION, app patches,
 * SET-012 save/restore preset defaults).
 */
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useSnackbar } from "@/components/ui";
import type { Game, Preset } from "@/engine";
import { configFromGame, loadLastConfig, seatsFromGame } from "@/features/setup/gameConfig";
import { startNewGame } from "@/features/setup/startGame";
import { afterOverlayClose } from "./afterOverlayClose";
import { fullscreenSupported, isStandalone } from "@/lib/device/fullscreen";
import { useEntitlements } from "@/lib/entitlements/store";
import { can } from "@/lib/entitlements/policy";
import { t } from "@/lib/i18n";
import { DEFAULT_PRESET_ID, getBuiltInPreset } from "@/presets";
import { useGameStore, type ActionInput } from "@/state/gameStore";
import {
  getPresetDefaults,
  restorePresetDefaults,
  savePresetDefaults,
  type PresetDefaults,
} from "@/state/presetDefaults";
import { useSettingsStore } from "@/state/settingsStore";
import {
  changedOptions,
  configFromDraft,
  draftForPreset,
  draftFromDefaults,
  draftFromGame,
  isStructuralChange,
  presetDefaultsFromDraft,
  type GameDraft,
} from "./draft";
import type { DeviceEnv, SettingChange, SettingsContext } from "./registry";
import pkg from "../../../package.json";

const SERVER_ENV: DeviceEnv = { haptics: true, fullscreen: true, standalone: false };
let clientEnv: DeviceEnv | null = null;

function readEnv(): DeviceEnv {
  if (typeof window === "undefined") return SERVER_ENV;
  clientEnv ??= {
    haptics: typeof navigator.vibrate === "function",
    fullscreen: fullscreenSupported(document),
    standalone:
      typeof window.matchMedia === "function" &&
      isStandalone(window.matchMedia.bind(window), navigator as { standalone?: boolean }),
  };
  return clientEnv;
}

const noopSubscribe = () => () => {};

export function useDeviceEnv(): DeviceEnv {
  return useSyncExternalStore(noopSubscribe, readEnv, () => SERVER_ENV);
}

function presetFor(id: string, game: Game | null, picked: Preset | null): Preset | undefined {
  if (game && game.preset.id === id) return game.preset;
  if (picked && picked.id === id) return picked; // custom presets (CUS-001)
  return getBuiltInPreset(id);
}

export interface SettingsModel {
  ctx: SettingsContext;
  /** A structural change awaiting the "This will reset the current game" confirm. */
  pending: GameDraft | null;
  confirmPending: () => Promise<void>;
  cancelPending: () => void;
  apply: (change: SettingChange) => void;
  applyDraft: (draft: GameDraft) => void;
  choosePreset: (preset: Preset) => Promise<void>;
  saveDefaults: () => Promise<void>;
  restoreDefaults: () => Promise<void>;
}

export function useSettingsModel(): SettingsModel {
  const game = useGameStore((s) => s.session?.game ?? null);
  const dispatch = useGameStore((s) => s.dispatch);
  const app = useSettingsStore((s) => s.settings);
  const entitlements = useEntitlements();
  const env = useDeviceEnv();
  const show = useSnackbar((s) => s.show);

  // Next-game mode (no active game): which preset, and its draft.
  const [nextPresetObj, setNextPreset] = useState<Preset | null>(null);
  /** The last preset chosen in the picker (may be a custom preset). */
  const [picked, setPicked] = useState<Preset | null>(null);
  const [nextDraft, setNextDraft] = useState<GameDraft | null>(null);
  const [pending, setPending] = useState<GameDraft | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const last = await loadLastConfig().catch(() => null);
      const preset = last?.preset ?? getBuiltInPreset(DEFAULT_PRESET_ID)!;
      const defaults = await getPresetDefaults(preset.id).catch(() => undefined);
      if (!alive) return;
      setNextPreset(preset);
      setNextDraft(draftFromDefaults(preset, defaults));
    })().catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const nextPreset = nextPresetObj ?? getBuiltInPreset(DEFAULT_PRESET_ID)!;
  const draft = useMemo(
    () => (game ? draftFromGame(game) : (nextDraft ?? draftFromDefaults(nextPreset, undefined))),
    [game, nextDraft, nextPreset],
  );
  const preset = game ? game.preset : nextPreset;

  const ctx: SettingsContext = {
    preset,
    game,
    draft,
    app,
    env,
    can: (f) => can(entitlements, f),
    version: pkg.version,
  };

  const persistNext = useCallback((d: GameDraft) => {
    setNextDraft(d);
    savePresetDefaults(d.presetId, presetDefaultsFromDraft(d)).catch((e: unknown) =>
      console.warn("[settings] save defaults failed", e),
    );
  }, []);

  const applyDraft = useCallback(
    (next: GameDraft) => {
      if (!game) {
        persistNext(next);
        return;
      }
      const before = draftFromGame(game);
      if (isStructuralChange(before, next)) {
        setPending(next);
        return;
      }
      for (const key of changedOptions(before, next)) {
        dispatch({ type: "SET_OPTION", key, value: next.options[key] } as ActionInput);
      }
      // SET-011: the layout variant applies live (engine SET_LAYOUT, LAY-003).
      if (next.layoutId !== before.layoutId)
        dispatch({ type: "SET_LAYOUT", layoutId: next.layoutId });
    },
    [game, dispatch, persistNext],
  );

  const apply = useCallback(
    (change: SettingChange) => {
      if (change.kind === "app") {
        useSettingsStore
          .getState()
          .update(change.patch)
          .catch((e: unknown) => console.warn("[settings] update failed", e));
      } else applyDraft(change.draft);
    },
    [applyDraft],
  );

  const confirmPending = useCallback(async () => {
    const next = pending;
    setPending(null);
    if (!next || !game) return;
    const target = presetFor(next.presetId, game, picked);
    if (!target) return;
    const samePreset = target.id === game.preset.id;
    const config = configFromDraft(
      next,
      target,
      seatsFromGame(game),
      samePreset ? configFromGame(game).timer : undefined,
    );
    // The confirm sheet just closed; the Who-won prompt (HIST-031) may open next.
    await new Promise<void>((resolve) => afterOverlayClose(resolve));
    if (!(await startNewGame(config))) return; // Who-won prompt closed (HIST-031)
    show({ message: t("shell.settings.resetDone"), durationMs: 3000 });
  }, [pending, game, show, picked]);

  const choosePreset = useCallback(
    async (p: Preset) => {
      const defaults: PresetDefaults | undefined = await getPresetDefaults(p.id).catch(
        () => undefined,
      );
      setPicked(p);
      if (!game) {
        setNextPreset(p);
        setNextDraft(draftFromDefaults(p, defaults));
        return;
      }
      if (p.id === game.preset.id) return;
      setPending(draftForPreset(p, defaults, game.seats.length));
    },
    [game],
  );

  const saveDefaults = useCallback(async () => {
    await savePresetDefaults(draft.presetId, presetDefaultsFromDraft(draft));
    show({ message: t("shell.settings.savedDefaults", { preset: preset.name }), durationMs: 3000 });
  }, [draft, preset.name, show]);

  const restoreDefaults = useCallback(async () => {
    await restorePresetDefaults(draft.presetId);
    if (!game) setNextDraft(draftFromDefaults(preset, undefined));
    show({
      message: t("shell.settings.restoredDefaults", { preset: preset.name }),
      durationMs: 3000,
    });
  }, [draft.presetId, game, preset, show]);

  return {
    ctx,
    pending,
    confirmPending,
    cancelPending: () => setPending(null),
    apply,
    applyDraft,
    choosePreset,
    saveDefaults,
    restoreDefaults,
  };
}
