/** Dexie-backed local adapters and kv store for the sync engine (T4.3). */
import { liveQuery } from "dexie";
import {
  normalizeName,
  type StoredArt,
  type StoredDeck,
  type StoredPreset,
  type StoredProfile,
  type StoredRecord,
  type StoredSetting,
  type TcgDb,
} from "@/lib/db";
import {
  artMapper,
  deckMapper,
  planSettingsApply,
  presetMapper,
  profileMapper,
  recordMapper,
  settingsToItem,
  type RowMapper,
} from "./mappers";
import type { KvStore, LocalAdapter, SyncItem, Unsubscribe } from "./types";

type Log = (msg: string, detail?: unknown) => void;

function watch(query: () => Promise<unknown>, onChange: () => void): Unsubscribe {
  const sub = liveQuery(query).subscribe({ next: () => onChange(), error: () => onChange() });
  return () => sub.unsubscribe();
}

/** The slice of a Dexie table the adapter needs. */
export interface RowTable<Row> {
  toArray(): Promise<Row[]>;
  get(id: string): Promise<Row | undefined>;
  put(row: Row): Promise<unknown>;
  delete(id: string): Promise<void>;
}

/** Generic row table adapter (profiles, decks, presets, records, art). */
export function tableAdapter<Row extends { id: string }>(
  table: RowTable<Row>,
  mapper: RowMapper<Row>,
  log: Log = () => {},
): LocalAdapter {
  return {
    async list() {
      const rows = await table.toArray();
      const out: SyncItem[] = [];
      for (const row of rows) {
        const item = mapper.toItem(row, log);
        if (item) out.push(item);
      }
      return out;
    },
    async apply(item) {
      if (item.deleted) {
        await table.delete(item.id);
        return;
      }
      const existing = await table.get(item.id);
      await table.put(mapper.fromItem(item, existing));
    },
    subscribe: (onChange) => watch(() => table.toArray(), onChange),
  };
}

export const localAdapters = {
  profiles: (db: TcgDb, log?: Log) => tableAdapter<StoredProfile>(db.profiles, profileMapper, log),
  decks: (db: TcgDb, log?: Log) => tableAdapter<StoredDeck>(db.decks, deckMapper, log),
  presets: (db: TcgDb, log?: Log) => tableAdapter<StoredPreset>(db.presets, presetMapper, log),
  records: (db: TcgDb, log?: Log) => tableAdapter<StoredRecord>(db.records, recordMapper, log),
  art: (db: TcgDb, log?: Log) => tableAdapter<StoredArt>(db.art, artMapper, log),
};

/** App settings + preset defaults + the "me" profile (PROF-003) as the single users/{uid} item. */
export function settingsAdapter(
  db: TcgDb,
  opts: { log?: Log; onApplied?: () => void } = {},
): LocalAdapter {
  return {
    async list() {
      const rows = await db.settings.toArray();
      const me = (await db.profiles.toArray()).find((p) => p.isMe === true);
      return [settingsToItem(rows, me?.id, opts.log)];
    },
    async apply(item) {
      if (item.deleted) return; // the user doc is never tombstoned
      await db.transaction("rw", db.settings, db.profiles, async () => {
        const rows = await db.settings.toArray();
        const plan = planSettingsApply(item, rows);
        if (plan.put.length) await db.settings.bulkPut(plan.put as StoredSetting[]);
        if (plan.delete.length) await db.settings.bulkDelete(plan.delete);
        const profiles = await db.profiles.toArray();
        for (const p of profiles) {
          const isMe = p.id === plan.meProfileId;
          if ((p.isMe === true) !== isMe) {
            const next: StoredProfile = {
              ...p,
              normalizedName: p.normalizedName || normalizeName(p.name),
            };
            if (isMe) next.isMe = true;
            else delete next.isMe;
            await db.profiles.put(next);
          }
        }
      });
      opts.onApplied?.();
    },
    subscribe: (onChange) =>
      watch(() => Promise.all([db.settings.toArray(), db.profiles.toArray()]), onChange),
  };
}

export function dexieKv(db: TcgDb): KvStore {
  return {
    async get(key) {
      return (await db.kv.get(key))?.value;
    },
    async set(key, value) {
      await db.kv.put({ key, value });
    },
    async delete(key) {
      await db.kv.delete(key);
    },
  };
}
