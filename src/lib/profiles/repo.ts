/**
 * Local profiles & decks repository (PROF-001, PROF-002, PROF-010, PROF-011) on the Dexie
 * `profiles` / `decks` tables. Rows carry `schemaVersion` and `normalizedName` (HIST-033).
 *
 * PROF-011 name-only suggestion (kept deliberately simple):
 * - Whenever a seat without a profile commits a name (the seat menu does this when the name field
 *   loses focus and when the menu closes; the setup flow may call it at game start), call
 *   `recordNameUse(name, gameId)`. Uses are kept per normalized name in the `kv` table under
 *   `nameUse:<normalized>` as a capped list of distinct game ids, so renaming twice in the same
 *   game counts once.
 * - `shouldSuggestProfile(name)` is true when the name was used in ≥ 2 distinct games, no profile
 *   with that normalized name exists, and the suggestion wasn't dismissed
 *   (`dismissProfileSuggestion`, kv `nameUseDismissed:<normalized>`).
 */
import { nanoid } from "nanoid";
import type { ArtRef } from "@/engine";
import { getDb, normalizeName, type StoredDeck, type StoredProfile, type TcgDb } from "@/lib/db";
import {
  DECK_SCHEMA_VERSION,
  PROFILE_SCHEMA_VERSION,
  type Deck,
  type DeckInput,
  type PlayerProfile,
  type ProfileInput,
} from "./types";

export const NAME_USE_PREFIX = "nameUse:";
export const NAME_DISMISSED_PREFIX = "nameUseDismissed:";
/** PROF-011: suggest after this many distinct games. */
export const SUGGEST_AFTER_GAMES = 2;
const MAX_TRACKED_GAMES = 20;
export const MAX_PROFILE_NAME = 40;
const FALLBACK_COLOR = "#60a5fa";

/** Trimmed, whitespace-collapsed, ≤ 40 chars. */
export function cleanName(name: string): string {
  return name.trim().replace(/\s+/g, " ").slice(0, MAX_PROFILE_NAME);
}

function toProfile(row: StoredProfile): PlayerProfile {
  const { schemaVersion: _v, normalizedName: _n, ...rest } = row;
  const p = rest as unknown as PlayerProfile;
  return {
    ...p,
    contrast: p.contrast === true,
    color: typeof p.color === "string" ? p.color : FALLBACK_COLOR,
  };
}

function toDeck(row: StoredDeck): Deck {
  const { schemaVersion: _v, ...rest } = row;
  const d = rest as unknown as Deck;
  return { ...d, commanders: Array.isArray(d.commanders) ? d.commanders : [] };
}

/** Profile/deck art never keeps the seat-only `origin` tag (PROF-010; Firestore has no such field). */
function cleanArt<T extends { art?: ArtRef }>(o: T): T {
  if (!o.art?.origin) return o;
  const { origin: _o, ...art } = o.art;
  return { ...o, art };
}

function stripUndefined<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

// ---------------------------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------------------------

/** Create (or overwrite when `input.id` is given) a profile. */
export async function saveProfile(
  input: ProfileInput,
  db: TcgDb = getDb(),
  now: number = Date.now(),
): Promise<PlayerProfile> {
  const name = cleanName(input.name);
  if (!name) throw new Error("Profile name is required");
  const profile: PlayerProfile = stripUndefined({
    ...cleanArt(input),
    id: input.id ?? nanoid(),
    name,
    updatedAt: now,
  });
  const row: StoredProfile = {
    ...profile,
    schemaVersion: PROFILE_SCHEMA_VERSION,
    normalizedName: normalizeName(name),
  };
  await db.profiles.put(row);
  return profile;
}

export async function getProfile(
  id: string,
  db: TcgDb = getDb(),
): Promise<PlayerProfile | undefined> {
  const row = await db.profiles.get(id);
  return row ? toProfile(row) : undefined;
}

/** All profiles, alphabetical. */
export async function listProfiles(db: TcgDb = getDb()): Promise<PlayerProfile[]> {
  const rows = await db.profiles.toArray();
  return rows.map(toProfile).sort((a, b) => a.name.localeCompare(b.name));
}

/** PROF-002: recently used first (lastUsedAt desc), then never-used ones alphabetically. */
export async function listRecent(db: TcgDb = getDb()): Promise<PlayerProfile[]> {
  const all = await listProfiles(db);
  return all.sort((a, b) => (b.lastUsedAt ?? -1) - (a.lastUsedAt ?? -1));
}

/** Profiles whose normalized name matches (HIST-033 identity). */
export async function findProfilesByName(
  name: string,
  db: TcgDb = getDb(),
): Promise<PlayerProfile[]> {
  const rows = await db.profiles.where("normalizedName").equals(normalizeName(name)).toArray();
  return rows.map(toProfile);
}

/** Delete a profile and its decks. */
export async function deleteProfile(id: string, db: TcgDb = getDb()): Promise<void> {
  await db.transaction("rw", db.profiles, db.decks, async () => {
    await db.decks.where("profileId").equals(id).delete();
    await db.profiles.delete(id);
  });
}

/** Stamp lastUsedAt on a profile (and its deck) when it is loaded into a seat. */
export async function markUsed(
  profileId: string,
  deckId?: string,
  db: TcgDb = getDb(),
  now: number = Date.now(),
): Promise<void> {
  await db.transaction("rw", db.profiles, db.decks, async () => {
    await db.profiles.update(profileId, { lastUsedAt: now });
    if (deckId !== undefined) await db.decks.update(deckId, { lastUsedAt: now });
  });
}

// ---------------------------------------------------------------------------------------------
// Decks
// ---------------------------------------------------------------------------------------------

/** Create (or overwrite when `input.id` is given) a deck of an existing profile. */
export async function saveDeck(
  input: DeckInput,
  db: TcgDb = getDb(),
  now: number = Date.now(),
): Promise<Deck> {
  const name = cleanName(input.name);
  if (!name) throw new Error("Deck name is required");
  if (!(await db.profiles.get(input.profileId))) throw new Error("Unknown profile");
  const commanders = (input.commanders ?? [])
    .map((c) => c.trim())
    .filter(Boolean)
    .slice(0, 2);
  const deck: Deck = stripUndefined({
    ...cleanArt(input),
    id: input.id ?? nanoid(),
    name,
    commanders,
    updatedAt: now,
  });
  const row: StoredDeck = { ...deck, schemaVersion: DECK_SCHEMA_VERSION };
  await db.decks.put(row);
  return deck;
}

export async function getDeck(id: string, db: TcgDb = getDb()): Promise<Deck | undefined> {
  const row = await db.decks.get(id);
  return row ? toDeck(row) : undefined;
}

/**
 * Decks of a profile, recently used first (then by name). With `presetId`, only decks of that
 * preset (or decks without a preset) are returned.
 */
export async function listDecks(
  profileId: string,
  presetId?: string,
  db: TcgDb = getDb(),
): Promise<Deck[]> {
  const rows = await db.decks.where("profileId").equals(profileId).toArray();
  return rows
    .map(toDeck)
    .filter((d) => presetId === undefined || !d.presetId || d.presetId === presetId)
    .sort((a, b) => (b.lastUsedAt ?? -1) - (a.lastUsedAt ?? -1) || a.name.localeCompare(b.name));
}

export async function deleteDeck(id: string, db: TcgDb = getDb()): Promise<void> {
  await db.decks.delete(id);
}

// ---------------------------------------------------------------------------------------------
// PROF-011 name-only suggestion
// ---------------------------------------------------------------------------------------------

async function readGames(key: string, db: TcgDb): Promise<string[]> {
  const row = await db.kv.get(key);
  const v = row?.value;
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/** Record that a profile-less seat used `name` in game `gameId`. Returns the distinct game count. */
export async function recordNameUse(
  name: string,
  gameId: string,
  db: TcgDb = getDb(),
): Promise<number> {
  const norm = normalizeName(name);
  if (!norm) return 0;
  const key = NAME_USE_PREFIX + norm;
  return db.transaction("rw", db.kv, async () => {
    const games = await readGames(key, db);
    if (games.includes(gameId)) return games.length;
    const next = [...games, gameId].slice(-MAX_TRACKED_GAMES);
    await db.kv.put({ key, value: next });
    return next.length;
  });
}

/** Distinct games in which the name was used by a seat without a profile. */
export async function nameUseCount(name: string, db: TcgDb = getDb()): Promise<number> {
  const norm = normalizeName(name);
  if (!norm) return 0;
  return (await readGames(NAME_USE_PREFIX + norm, db)).length;
}

/** PROF-011: offer "Save {name} as a profile?" */
export async function shouldSuggestProfile(name: string, db: TcgDb = getDb()): Promise<boolean> {
  const norm = normalizeName(name);
  if (!norm) return false;
  if ((await nameUseCount(name, db)) < SUGGEST_AFTER_GAMES) return false;
  if (await db.kv.get(NAME_DISMISSED_PREFIX + norm)) return false;
  return (await findProfilesByName(name, db)).length === 0;
}

export async function dismissProfileSuggestion(name: string, db: TcgDb = getDb()): Promise<void> {
  const norm = normalizeName(name);
  if (norm) await db.kv.put({ key: NAME_DISMISSED_PREFIX + norm, value: true });
}
