/**
 * Local row ⇄ remote document mapping for every synced collection, validated both ways with the
 * schemas of src/lib/firebase/docs.ts (the single source of truth for document shapes).
 * Mappers must round-trip: `toItem(fromItem(item))` has the same `data` as `item`, so applying a
 * remote change never looks like a fresh local edit.
 */
import type { ZodType } from "zod";
import type { StoredArt, StoredDeck, StoredPreset, StoredProfile, StoredRecord } from "@/lib/db";
import { normalizeName } from "@/lib/db";
import {
  artDataSchema,
  artRefSchema,
  COLOR_LETTERS,
  deckDataSchema,
  gameDataSchema,
  LIMITS,
  presetDataSchema,
  profileDataSchema,
  userDataSchema,
} from "@/lib/firebase/docs";
import { DECK_SCHEMA_VERSION, PROFILE_SCHEMA_VERSION } from "@/lib/profiles/types";
import { toJsonObject } from "./json";
import type { JsonObject, SyncItem } from "./types";

export interface RowMapper<Row> {
  /** null when the row can't (or shouldn't) be synced; the reason is passed to `log`. */
  toItem(row: Row, log?: (msg: string) => void): SyncItem | null;
  fromItem(item: SyncItem, existing: Row | undefined): Row;
}

/** Deck preset placeholder: the remote schema requires a preset id, local decks may have none. */
export const NO_PRESET = "_none";

/** Device-only app settings that never leave the device (SET-014). */
export const DEVICE_ONLY_SETTINGS = [
  "keepAwake",
  "keepAwakeFallback",
  "haptics",
  "hideSystemBars",
  "sounds",
] as const;
export function isDeviceOnlySetting(key: string): boolean {
  return key.startsWith("keepAwake") || (DEVICE_ONLY_SETTINGS as readonly string[]).includes(key);
}

function validated<T>(
  schema: ZodType<T>,
  value: unknown,
  what: string,
  log?: (msg: string) => void,
): JsonObject | null {
  const r = schema.safeParse(value);
  if (!r.success) {
    log?.(`sync: skipping invalid ${what}: ${r.error.issues[0]?.message ?? "invalid"}`);
    return null;
  }
  return toJsonObject(r.data as object);
}

const num = (v: unknown, fallback = 0) =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;
const str = (v: unknown) => (typeof v === "string" ? v : "");

interface LocalArtRef {
  kind: string;
  value: string;
  focal?: { x: number; y: number; zoom?: number };
  artist?: string;
  cardName?: string;
}

/** Remote art refs carry the full focal point {x, y, zoom?} (D-052). */
function artToRemote(art: unknown): unknown {
  if (!art || typeof art !== "object") return undefined;
  const a = art as LocalArtRef;
  return {
    kind: a.kind,
    value: a.value,
    focal: a.focal
      ? {
          x: a.focal.x,
          y: a.focal.y,
          ...(a.focal.zoom !== undefined ? { zoom: a.focal.zoom } : {}),
        }
      : undefined,
    artist: a.artist,
    cardName: a.cardName,
  };
}

function artFromRemote(remote: unknown, existing: unknown): LocalArtRef | undefined {
  const parsed = artRefSchema.safeParse(remote);
  if (!parsed.success) return undefined;
  const r = parsed.data;
  const prevZoom = (existing as LocalArtRef | undefined)?.focal?.zoom;
  const out: LocalArtRef = { kind: r.kind, value: r.value };
  if (r.focal) out.focal = { x: r.focal.x, y: r.focal.y, zoom: r.focal.zoom ?? prevZoom ?? 1 };
  if (r.artist !== undefined) out.artist = r.artist;
  if (r.cardName !== undefined) out.cardName = r.cardName;
  return out;
}

function withOptional<T extends object>(base: T, key: string, value: unknown): T {
  const out = Object.fromEntries(Object.entries(base).filter(([k]) => k !== key));
  if (value !== undefined) out[key] = value;
  return out as T;
}

export const profileMapper: RowMapper<StoredProfile> = {
  toItem(row, log) {
    const name = str(row.name).trim().replace(/\s+/g, " ").slice(0, LIMITS.profileNameMax);
    const data = validated(
      profileDataSchema,
      {
        name,
        normalizedName: normalizeName(name),
        color: str(row.color),
        contrast: row.contrast === true,
        art: artToRemote(row.art),
      },
      `profile ${row.id}`,
      log,
    );
    return data ? { id: row.id, updatedAt: num(row.updatedAt), deleted: false, data } : null;
  },
  fromItem(item, existing) {
    const d = item.data;
    const base: StoredProfile = {
      ...existing,
      id: item.id,
      schemaVersion: PROFILE_SCHEMA_VERSION,
      name: str(d.name),
      normalizedName: str(d.normalizedName) || normalizeName(str(d.name)),
      color: str(d.color),
      contrast: d.contrast === true,
      updatedAt: item.updatedAt,
    };
    return withOptional(base, "art", artFromRemote(d.art, existing?.art));
  },
};

function colorLetters(v: unknown): string[] {
  const src = Array.isArray(v) ? v.join("") : str(v);
  const out: string[] = [];
  for (const ch of src.toUpperCase())
    if ((COLOR_LETTERS as readonly string[]).includes(ch) && !out.includes(ch)) out.push(ch);
  return out;
}

export const deckMapper: RowMapper<StoredDeck> = {
  toItem(row, log) {
    const data = validated(
      deckDataSchema,
      {
        name: str(row.name).slice(0, LIMITS.deckNameMax),
        presetId: str(row.presetId) || NO_PRESET,
        commanders: (Array.isArray(row.commanders) ? (row.commanders as unknown[]) : [])
          .filter((c): c is string => typeof c === "string" && c.length > 0)
          .map((c) => c.slice(0, LIMITS.commanderNameMax))
          .slice(0, LIMITS.commandersMax),
        colorIdentity: colorLetters(row.colorIdentity),
        art: artToRemote(row.art),
      },
      `deck ${row.id}`,
      log,
    );
    if (!data || !row.profileId) return null;
    return {
      id: row.id,
      parent: row.profileId,
      updatedAt: num(row.updatedAt),
      deleted: false,
      data,
    };
  },
  fromItem(item, existing) {
    const d = item.data;
    const letters = colorLetters(d.colorIdentity).join("");
    let row: StoredDeck = {
      ...existing,
      id: item.id,
      schemaVersion: DECK_SCHEMA_VERSION,
      profileId: item.parent ?? existing?.profileId ?? "",
      name: str(d.name),
      commanders: Array.isArray(d.commanders) ? d.commanders.map(str) : [],
      updatedAt: item.updatedAt,
    };
    row = withOptional(row, "presetId", d.presetId === NO_PRESET ? undefined : str(d.presetId));
    row = withOptional(row, "colorIdentity", letters || undefined);
    return withOptional(row, "art", artFromRemote(d.art, existing?.art));
  },
};

export const presetMapper: RowMapper<StoredPreset> = {
  toItem(row, log) {
    const p = (row.preset && typeof row.preset === "object" ? row.preset : {}) as Record<
      string,
      unknown
    >;
    const data = validated(
      presetDataSchema,
      {
        name: str(p.name).slice(0, LIMITS.presetNameMax),
        game: str(p.game).slice(0, LIMITS.gameNameMax),
        payload: JSON.stringify(row.preset ?? null),
        schemaVersion: row.schemaVersion,
      },
      `preset ${row.id}`,
      log,
    );
    return data ? { id: row.id, updatedAt: num(row.updatedAt), deleted: false, data } : null;
  },
  fromItem(item) {
    return {
      id: item.id,
      schemaVersion: num(item.data.schemaVersion, 1),
      preset: JSON.parse(str(item.data.payload) || "null") as unknown,
      updatedAt: item.updatedAt,
    };
  },
};

const GAME_FIELDS = [
  "schemaVersion",
  "presetId",
  "game",
  "startedAt",
  "endedAt",
  "durationMs",
  "seats",
  "log",
] as const;

/**
 * Game records (HIST-003) sync when they carry the `users/{uid}/games` fields (see docs.ts
 * gameDataSchema); other record shapes stay local.
 */
export const recordMapper: RowMapper<StoredRecord> = {
  toItem(row, log) {
    const pick: Record<string, unknown> = {};
    for (const k of GAME_FIELDS) if (row[k] !== undefined) pick[k] = row[k];
    const data = validated(gameDataSchema, pick, `record ${row.id}`, log);
    return data
      ? { id: row.id, updatedAt: num(row.updatedAt, num(row.endedAt)), deleted: false, data }
      : null;
  },
  fromItem(item, existing) {
    const d = item.data;
    return {
      ...existing,
      ...d,
      id: item.id,
      schemaVersion: num(d.schemaVersion, 1),
      endedAt: num(d.endedAt),
      presetId: str(d.presetId),
    };
  },
};

const ART_FIELDS = ["storagePath", "width", "height", "bytes", "contentType", "name"] as const;

/**
 * Art metadata (ART-022): rows sync once `meta.storagePath` exists (i.e. after the upload).
 * Remote-only art lands as a row with an empty blob and `meta.remoteOnly: true`; the ART lane
 * downloads the binary from Storage on demand.
 */
export const artMapper: RowMapper<StoredArt> = {
  toItem(row, log) {
    const meta = row.meta ?? {};
    if (typeof meta.storagePath !== "string") return null; // not uploaded: local only
    const pick: Record<string, unknown> = {};
    for (const k of ART_FIELDS) pick[k] = meta[k];
    const focal = meta.focal as { x?: unknown; y?: unknown; zoom?: unknown } | undefined;
    if (focal && typeof focal === "object")
      pick.focal = {
        x: focal.x,
        y: focal.y,
        ...(typeof focal.zoom === "number" ? { zoom: focal.zoom } : {}),
      };
    const data = validated(artDataSchema, pick, `art ${row.id}`, log);
    return data ? { id: row.id, updatedAt: num(meta.updatedAt), deleted: false, data } : null;
  },
  fromItem(item, existing) {
    const prevFocal = existing?.meta.focal as { zoom?: number } | undefined;
    const d = item.data as Record<string, unknown>;
    const meta: Record<string, unknown> = { ...existing?.meta, ...d, updatedAt: item.updatedAt };
    if (d.focal && typeof d.focal === "object")
      meta.focal = { ...(prevFocal?.zoom ? { zoom: prevFocal.zoom } : {}), ...(d.focal as object) };
    else delete meta.focal;
    if (!existing) meta.remoteOnly = true;
    return {
      id: item.id,
      blob: existing?.blob ?? new Blob([], { type: str(d.contentType) }),
      meta,
    };
  },
};

// ---------------------------------------------------------------------------------------------
// Settings → users/{uid} (`settings` map + `meProfileId`)
// ---------------------------------------------------------------------------------------------

export const SETTINGS_ITEM_ID = "user";
export const APP_KEY = "app";
export const PRESET_DEFAULTS_PREFIX = "presetDefaults:";

export function isSyncedSettingKey(key: string): boolean {
  return key === APP_KEY || key.startsWith(PRESET_DEFAULTS_PREFIX);
}

export interface SettingsRowLike {
  key: string;
  value: unknown;
  updatedAt: number;
}

/** App settings without device-only keys. */
export function syncedAppSettings(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value).filter(([k]) => !isDeviceOnlySetting(k)));
}

/** Build the single settings item from the local settings rows and the "me" profile id. */
export function settingsToItem(
  rows: SettingsRowLike[],
  meProfileId: string | undefined,
  log?: (msg: string) => void,
): SyncItem {
  const settings: Record<string, unknown> = {};
  let updatedAt = 0;
  for (const r of rows) {
    if (!isSyncedSettingKey(r.key)) continue;
    const value = r.key === APP_KEY ? syncedAppSettings(r.value) : r.value;
    if (r.key === APP_KEY && Object.keys(value as object).length === 0) continue; // device-only
    settings[r.key] = value;
    updatedAt = Math.max(updatedAt, num(r.updatedAt));
  }
  const candidate = { displayName: "", settings, meProfileId };
  const ok = validated(userDataSchema, candidate, "settings", log);
  const data: JsonObject = ok
    ? toJsonObject({ settings: ok.settings ?? {}, meProfileId: ok.meProfileId })
    : { settings: {} };
  return { id: SETTINGS_ITEM_ID, updatedAt, deleted: false, data };
}

/** No synced settings and no "me" profile: nothing worth creating a user doc for. */
export function isEmptySettingsItem(item: SyncItem): boolean {
  const settings = item.data.settings;
  return (
    item.data.meProfileId === undefined &&
    (!settings || (typeof settings === "object" && Object.keys(settings).length === 0))
  );
}

export interface SettingsPlan {
  put: SettingsRowLike[];
  delete: string[];
  meProfileId: string | undefined;
}

/**
 * Local writes that make the synced settings rows match a remote settings item exactly (so the
 * result maps back to the same item and is never pushed again). Device-only values stay.
 */
export function planSettingsApply(item: SyncItem, rows: SettingsRowLike[]): SettingsPlan {
  const remote = (item.data.settings ?? {}) as Record<string, unknown>;
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const put: SettingsRowLike[] = [];
  const del: string[] = [];
  const localApp = byKey.get(APP_KEY)?.value;
  const device =
    localApp && typeof localApp === "object"
      ? Object.fromEntries(Object.entries(localApp).filter(([k]) => isDeviceOnlySetting(k)))
      : {};
  for (const [key, value] of Object.entries(remote)) {
    if (!isSyncedSettingKey(key)) continue;
    if (key === APP_KEY)
      put.push({
        key,
        value: { ...syncedAppSettings(value), ...device },
        updatedAt: item.updatedAt,
      });
    else put.push({ key, value, updatedAt: item.updatedAt });
  }
  if (!(APP_KEY in remote) && Object.keys(syncedAppSettings(localApp)).length > 0)
    put.push({ key: APP_KEY, value: device, updatedAt: item.updatedAt });
  for (const r of rows)
    if (r.key.startsWith(PRESET_DEFAULTS_PREFIX) && !(r.key in remote)) del.push(r.key);
  const me = item.data.meProfileId;
  return { put, delete: del, meProfileId: typeof me === "string" ? me : undefined };
}
