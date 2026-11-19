/** Dexie 4 database `tcg-life` (ARCH-006). Row types are minimal; feature lanes own payloads. */
import { Dexie, type EntityTable } from "dexie";
import type { Game } from "@/engine";
import { applyVersions, DB_NAME, DB_VERSIONS, type DbVersion } from "./migrations";

export interface StoredGame {
  id: string;
  schemaVersion: number;
  updatedAt: number;
  game: Game;
}

/** Completed game record (HIST-003). Shape owned by the HISTORY lane. */
export interface StoredRecord {
  id: string;
  schemaVersion: number;
  endedAt: number;
  presetId: string;
  [field: string]: unknown;
}

export interface StoredProfile {
  id: string;
  schemaVersion: number;
  name: string;
  /** Case/whitespace-insensitive name (HIST-033). */
  normalizedName: string;
  [field: string]: unknown;
}

export interface StoredDeck {
  id: string;
  schemaVersion: number;
  profileId: string;
  name: string;
  [field: string]: unknown;
}

export interface StoredPreset {
  id: string;
  schemaVersion: number;
  preset: unknown;
  updatedAt: number;
}

/** Saved setup ("Preset" in the UI): shape owned by src/lib/setups (SavedSetupSchema). */
export interface StoredSetup {
  id: string;
  schemaVersion: number;
  order: number;
  updatedAt: number;
  [field: string]: unknown;
}

export interface StoredSetting {
  key: string;
  value: unknown;
  updatedAt: number;
}

export interface StoredArt {
  id: string;
  blob: Blob;
  meta: Record<string, unknown>;
}

export interface StoredKv {
  key: string;
  value: unknown;
}

export class TcgDb extends Dexie {
  games!: EntityTable<StoredGame, "id">;
  records!: EntityTable<StoredRecord, "id">;
  profiles!: EntityTable<StoredProfile, "id">;
  decks!: EntityTable<StoredDeck, "id">;
  presets!: EntityTable<StoredPreset, "id">;
  /** Saved setups (DB v2). */
  setups!: EntityTable<StoredSetup, "id">;
  settings!: EntityTable<StoredSetting, "key">;
  art!: EntityTable<StoredArt, "id">;
  kv!: EntityTable<StoredKv, "key">;

  constructor(name: string = DB_NAME, versions: readonly DbVersion[] = DB_VERSIONS) {
    super(name);
    applyVersions(this, versions);
  }
}

let instance: TcgDb | null = null;

/** Shared app database (lazily created). */
export function getDb(): TcgDb {
  instance ??= new TcgDb();
  return instance;
}

/** Test hook: swap the shared instance (pass null to drop it). */
export function setDbForTests(db: TcgDb | null): void {
  instance = db;
}

/** Normalized identity name (HIST-033): trimmed, collapsed whitespace, lower-case. */
export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}
