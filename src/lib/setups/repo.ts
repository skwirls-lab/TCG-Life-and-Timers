/**
 * Saved setups repository ("Presets" in the UI) on the Dexie `setups` table (DB v2). Rows are a
 * `SavedSetup` plus `schemaVersion`; every write is validated with zod and rows that fail
 * validation are skipped on read (never crash the launcher).
 */
import { nanoid } from "nanoid";
import { getDb, type StoredSetup, type TcgDb } from "@/lib/db";
import {
  MAX_SETUP_NAME,
  SAVED_SETUP_SCHEMA_VERSION,
  SavedSetupSchema,
  SetupDraftSchema,
  type SavedSetup,
  type SetupDraft,
} from "./types";

export interface SetupRepoOptions {
  db?: TcgDb;
  now?: number;
}

/** Trimmed, whitespace-collapsed, ≤ 60 chars. */
export function cleanSetupName(name: string): string {
  return name.trim().replace(/\s+/g, " ").slice(0, MAX_SETUP_NAME).trim();
}

export function toSetupRow(setup: SavedSetup): StoredSetup {
  return { ...SavedSetupSchema.parse(setup), schemaVersion: SAVED_SETUP_SCHEMA_VERSION };
}

/** A validated setup from a stored row (undefined when the row is invalid). */
export function fromSetupRow(row: StoredSetup | undefined): SavedSetup | undefined {
  if (!row) return undefined;
  const { schemaVersion: _v, ...rest } = row;
  const parsed = SavedSetupSchema.safeParse(rest);
  return parsed.success ? parsed.data : undefined;
}

const byOrder = (a: SavedSetup, b: SavedSetup) => a.order - b.order || a.createdAt - b.createdAt;

/** Saved setups in launcher order. */
export async function listSetups(db: TcgDb = getDb()): Promise<SavedSetup[]> {
  const rows = await db.setups.toArray();
  return rows
    .map(fromSetupRow)
    .filter((s): s is SavedSetup => s !== undefined)
    .sort(byOrder);
}

export async function countSetups(db: TcgDb = getDb()): Promise<number> {
  return (await listSetups(db)).length;
}

export async function getSetup(id: string, db: TcgDb = getDb()): Promise<SavedSetup | undefined> {
  return fromSetupRow(await db.setups.get(id));
}

/** Store a new setup at the end of the list. */
export async function createSetup(
  name: string,
  draft: SetupDraft,
  opts: SetupRepoOptions = {},
): Promise<SavedSetup> {
  const db = opts.db ?? getDb();
  const now = opts.now ?? Date.now();
  const clean = cleanSetupName(name);
  if (!clean) throw new Error("Preset name is required");
  const existing = await listSetups(db);
  const setup: SavedSetup = {
    ...SetupDraftSchema.parse(draft),
    id: nanoid(12),
    name: clean,
    order: existing.length ? existing[existing.length - 1]!.order + 1 : 0,
    createdAt: now,
    updatedAt: now,
  };
  await db.setups.put(toSetupRow(setup));
  return setup;
}

/** Replace a setup's contents (and optionally its name), keeping id, order and createdAt. */
export async function updateSetup(
  id: string,
  draft: SetupDraft,
  opts: SetupRepoOptions & { name?: string } = {},
): Promise<SavedSetup> {
  const db = opts.db ?? getDb();
  const prev = await getSetup(id, db);
  if (!prev) throw new Error(`Unknown preset ${id}`);
  const name = opts.name !== undefined ? cleanSetupName(opts.name) : prev.name;
  const next: SavedSetup = {
    ...SetupDraftSchema.parse(draft),
    id,
    name: name || prev.name,
    order: prev.order,
    createdAt: prev.createdAt,
    updatedAt: opts.now ?? Date.now(),
    ...(prev.lastUsedAt !== undefined ? { lastUsedAt: prev.lastUsedAt } : {}),
  };
  await db.setups.put(toSetupRow(next));
  return next;
}

async function patch(
  id: string,
  change: (s: SavedSetup) => SavedSetup,
  opts: SetupRepoOptions,
): Promise<SavedSetup | undefined> {
  const db = opts.db ?? getDb();
  return db.transaction("rw", db.setups, async () => {
    const prev = await getSetup(id, db);
    if (!prev) return undefined;
    const next = { ...change(prev), updatedAt: opts.now ?? Date.now() };
    await db.setups.put(toSetupRow(next));
    return next;
  });
}

export async function renameSetup(
  id: string,
  name: string,
  opts: SetupRepoOptions = {},
): Promise<SavedSetup | undefined> {
  const clean = cleanSetupName(name);
  if (!clean) throw new Error("Preset name is required");
  return patch(id, (s) => ({ ...s, name: clean }), opts);
}

/** Stamp lastUsedAt when a game starts from the setup. */
export async function markSetupUsed(id: string, opts: SetupRepoOptions = {}): Promise<void> {
  const now = opts.now ?? Date.now();
  await patch(id, (s) => ({ ...s, lastUsedAt: now }), { ...opts, now });
}

export async function deleteSetup(id: string, db: TcgDb = getDb()): Promise<void> {
  await db.setups.delete(id);
}

/** Move a setup one place up (-1) or down (+1); orders are renumbered 0…n-1. */
export async function moveSetup(
  id: string,
  dir: -1 | 1,
  opts: SetupRepoOptions = {},
): Promise<SavedSetup[]> {
  const db = opts.db ?? getDb();
  const now = opts.now ?? Date.now();
  return db.transaction("rw", db.setups, async () => {
    const list = await listSetups(db);
    const from = list.findIndex((s) => s.id === id);
    const to = from + dir;
    if (from < 0 || to < 0 || to >= list.length) return list;
    [list[from], list[to]] = [list[to]!, list[from]!];
    const out: SavedSetup[] = [];
    for (const [i, s] of list.entries()) {
      if (s.order === i) {
        out.push(s);
        continue;
      }
      const next = { ...s, order: i, updatedAt: now };
      await db.setups.put(toSetupRow(next));
      out.push(next);
    }
    return out;
  });
}

/** Rewrite profile ids on every seat (guest → account merge, B-7). */
export async function renameProfilesInSetups(
  renames: ReadonlyMap<string, string>,
  db: TcgDb = getDb(),
): Promise<void> {
  for (const row of await db.setups.toArray()) {
    const seats = Array.isArray(row.seats) ? (row.seats as { profileId?: unknown }[]) : null;
    if (!seats?.some((s) => typeof s.profileId === "string" && renames.has(s.profileId))) continue;
    await db.setups.put({
      ...row,
      seats: seats.map((s) =>
        typeof s.profileId === "string" && renames.has(s.profileId)
          ? { ...s, profileId: renames.get(s.profileId) }
          : s,
      ),
    });
  }
}
