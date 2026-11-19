"use client";
/**
 * Saved setups ("Presets") on the device: resolve a setup's game type, profiles and decks, start
 * a game from it (the launcher tile), and remember which preset the active game came from so the
 * game menu can offer "Update '<name>'".
 */
import type { Game, Preset } from "@/engine";
import { rememberPresetUse } from "@/features/preset-picker/usePresetPrefs";
import { startNewGame } from "@/features/setup/startGame";
import { getAnyPreset } from "@/lib/customPresets";
import { getDb, type TcgDb } from "@/lib/db";
import { can } from "@/lib/entitlements/policy";
import { openPaywall } from "@/lib/entitlements/paywall";
import { useEntitlements } from "@/lib/entitlements/store";
import { getDeck, getProfile } from "@/lib/profiles/repo";
import type { Deck, PlayerProfile } from "@/lib/profiles/types";
import { getSetup, markSetupUsed, type SavedSetup, type SetupDraft } from "@/lib/setups";
import { checkPlayers, configFromSetup, type SetupRefs, type StartCheck } from "./model";

/** kv: the preset the active game was started from ({ gameId, setupId }). */
export const SETUP_SOURCE_KEY = "setupSource";

export async function rememberSetupSource(
  gameId: string,
  setupId: string,
  db: TcgDb = getDb(),
): Promise<void> {
  await db.kv.put({ key: SETUP_SOURCE_KEY, value: { gameId, setupId } });
}

/** The preset `gameId` was started from, if it still exists. */
export async function setupSourceOf(
  gameId: string,
  db: TcgDb = getDb(),
): Promise<SavedSetup | undefined> {
  const v = (await db.kv.get(SETUP_SOURCE_KEY))?.value as
    { gameId?: unknown; setupId?: unknown } | undefined;
  if (!v || v.gameId !== gameId || typeof v.setupId !== "string") return undefined;
  return getSetup(v.setupId, db);
}

/** Profiles and decks the seats refer to (missing ones are simply absent). */
export async function loadSetupRefs(setup: SetupDraft, db: TcgDb = getDb()): Promise<SetupRefs> {
  const profiles = new Map<string, PlayerProfile>();
  const decks = new Map<string, Deck>();
  for (const s of setup.seats) {
    if (s.profileId && !profiles.has(s.profileId)) {
      const p = await getProfile(s.profileId, db).catch(() => undefined);
      if (p) profiles.set(p.id, p);
    }
    if (s.deckId && !decks.has(s.deckId)) {
      const d = await getDeck(s.deckId, db).catch(() => undefined);
      if (d) decks.set(d.id, d);
    }
  }
  return { profiles, decks };
}

export async function resolveGameType(setup: SetupDraft): Promise<Preset | undefined> {
  return getAnyPreset(setup.presetId).catch(() => undefined);
}

export type StartResult =
  | { kind: "started"; game: Game }
  | { kind: "kept" }
  | { kind: "missing" }
  | { kind: "players"; check: Exclude<StartCheck, { ok: true }>; preset: Preset };

/**
 * Tile tap: start the preset's game straight away (seats, profiles, decks, art precedence,
 * timers, house rules, first-player rule). "kept" = the Who-won prompt was closed (HIST-031).
 */
export async function startFromSetup(setup: SavedSetup): Promise<StartResult> {
  const preset = await resolveGameType(setup);
  if (!preset) return { kind: "missing" };
  const check = checkPlayers(
    setup.seats.length,
    preset,
    can(useEntitlements.getState(), "players7to8"),
  );
  if (!check.ok) {
    if (check.reason === "pro") openPaywall("players7to8");
    return { kind: "players", check, preset };
  }
  const game = await startNewGame(configFromSetup(setup, preset, await loadSetupRefs(setup)));
  if (!game) return { kind: "kept" };
  await afterSetupStart(game.id, setup.id, preset.id);
  return { kind: "started", game };
}

/** Book-keeping once a game started from a preset. */
export async function afterSetupStart(
  gameId: string,
  setupId: string,
  presetId: string,
): Promise<void> {
  await Promise.all([
    markSetupUsed(setupId).catch(() => undefined),
    rememberSetupSource(gameId, setupId).catch(() => undefined),
    rememberPresetUse(presetId).catch(() => undefined),
  ]);
}
