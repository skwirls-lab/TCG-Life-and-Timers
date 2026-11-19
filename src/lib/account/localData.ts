/**
 * Local account data helpers: snapshot the synced tables in the remote item shape (merge
 * planning) and clear them (AUTH-004 "Remove my data from this device"; the active game stays).
 */
import { APP_SETTINGS_KEY, getDb, type TcgDb } from "@/lib/db";
import { localAdapters, settingsAdapter } from "@/lib/sync/dexieLocal";
import { isDeviceOnlySetting, PRESET_DEFAULTS_PREFIX } from "@/lib/sync/mappers";
import type { SyncItem } from "@/lib/sync/types";

export const MERGE_COLLECTIONS = [
  "profiles",
  "decks",
  "presets",
  "setups",
  "records",
  "art",
  "settings",
] as const;
export type MergeCollection = (typeof MERGE_COLLECTIONS)[number];
export type DataSnapshot = Record<MergeCollection, SyncItem[]>;

export function emptySnapshot(): DataSnapshot {
  return {
    profiles: [],
    decks: [],
    presets: [],
    setups: [],
    records: [],
    art: [],
    settings: [],
  };
}

export async function snapshotLocal(db: TcgDb = getDb()): Promise<DataSnapshot> {
  return {
    profiles: await localAdapters.profiles(db).list(),
    decks: await localAdapters.decks(db).list(),
    presets: await localAdapters.presets(db).list(),
    setups: await localAdapters.setups(db).list(),
    records: await localAdapters.records(db).list(),
    art: await localAdapters.art(db).list(),
    settings: await settingsAdapter(db).list(),
  };
}

export interface ClearOptions {
  /** Game records are account data only when history sync is on (`can('historySync')`). */
  includeRecords: boolean;
  now?: number;
}

/**
 * Remove synced account data from this device: profiles, decks, custom game types, saved setups
 * ("Presets"), synced settings
 * (device-only settings stay), uploaded-art metadata and (optionally) game records. The active
 * game (`games` + the active pointer) and local-only art are kept.
 */
export async function clearLocalAccountData(
  opts: ClearOptions,
  db: TcgDb = getDb(),
): Promise<void> {
  await db.transaction(
    "rw",
    [db.profiles, db.decks, db.presets, db.setups, db.settings, db.art, db.records],
    async () => {
      await db.profiles.clear();
      await db.decks.clear();
      await db.presets.clear();
      await db.setups.clear();
      if (opts.includeRecords) await db.records.clear();
      await db.settings.where("key").startsWith(PRESET_DEFAULTS_PREFIX).delete();
      const app = await db.settings.get(APP_SETTINGS_KEY);
      if (app && app.value && typeof app.value === "object") {
        const device = Object.fromEntries(
          Object.entries(app.value).filter(([k]) => isDeviceOnlySetting(k)),
        );
        await db.settings.put({
          key: APP_SETTINGS_KEY,
          value: device,
          updatedAt: opts.now ?? Date.now(),
        });
      }
      const art = await db.art.toArray();
      const synced = art.filter((a) => typeof a.meta?.storagePath === "string").map((a) => a.id);
      if (synced.length) await db.art.bulkDelete(synced);
    },
  );
}
