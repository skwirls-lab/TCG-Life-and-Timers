/**
 * Versioned schema for the `tcg-life` IndexedDB (instructions §8 Persistence, §10.5).
 *
 * Two layers:
 * 1. DB_VERSIONS — Dexie table/index schema per DB version. To change tables or indexes, APPEND a
 *    new entry (never edit a shipped one) with an optional `upgrade` that rewrites rows.
 * 2. Entity migrations — every persisted entity carries `schemaVersion`; `migrateEntity` walks a
 *    stored value forward through per-version functions (GAME_MIGRATIONS for games).
 */
import type { Dexie, Transaction } from "dexie";
import { GAME_SCHEMA_VERSION } from "@/engine";

export const DB_NAME = "tcg-life";

export interface DbVersion {
  version: number;
  /** Dexie store spec per table (`null` deletes a table). */
  stores: Record<string, string | null>;
  upgrade?: (tx: Transaction) => Promise<void> | void;
}

/** Tables of v1, plus `setups` (saved setups, shown as "Presets") from v2. */
export const DB_VERSIONS: readonly DbVersion[] = [
  {
    version: 1,
    stores: {
      games: "id, updatedAt", // active + recent sessions
      records: "id, endedAt, presetId", // completed game records (HIST-003)
      profiles: "id, normalizedName",
      decks: "id, profileId",
      presets: "id", // custom presets
      settings: "key", // app settings + per-preset defaults
      art: "id", // uploaded / cached art blobs
      kv: "key", // misc (active pointer, corrupt backups, flags)
    },
  },
  {
    version: 2,
    // Saved setups ("Presets" in the UI), ordered on the launcher. No row rewrite needed.
    stores: { setups: "id, order" },
  },
];

/** Register versions on a Dexie instance (call in the constructor, before open). */
export function applyVersions(db: Dexie, versions: readonly DbVersion[]): void {
  for (const v of versions) {
    const ver = db.version(v.version).stores(v.stores);
    if (v.upgrade) ver.upgrade(v.upgrade);
  }
}

export type EntityMigration = (value: Record<string, unknown>) => Record<string, unknown>;

/** Migrations keyed by the version they upgrade FROM (n → n+1). */
export type EntityMigrations = Readonly<Record<number, EntityMigration>>;

/** Game entity migrations (none yet: GAME_SCHEMA_VERSION = 1). */
export const GAME_MIGRATIONS: EntityMigrations = {};

export class MigrationError extends Error {}

/**
 * Walk `value` from its `schemaVersion` up to `target`. Throws MigrationError for non-objects,
 * missing versions, versions newer than `target`, or gaps in the migration chain.
 */
export function migrateEntity(
  value: unknown,
  target: number,
  migrations: EntityMigrations,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null) throw new MigrationError("not an object");
  let cur = value as Record<string, unknown>;
  let v = cur.schemaVersion;
  if (typeof v !== "number" || !Number.isInteger(v) || v < 1) {
    throw new MigrationError("missing schemaVersion");
  }
  if (v > target) throw new MigrationError(`schemaVersion ${v} is newer than ${target}`);
  while (v < target) {
    const step = migrations[v];
    if (!step) throw new MigrationError(`no migration from v${v}`);
    cur = { ...step(cur), schemaVersion: v + 1 };
    v += 1;
  }
  return cur;
}

export function migrateGame(value: unknown): Record<string, unknown> {
  return migrateEntity(value, GAME_SCHEMA_VERSION, GAME_MIGRATIONS);
}
