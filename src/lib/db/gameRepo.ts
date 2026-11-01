/**
 * Active game persistence (ARCH-006, GAME-016, REL-001). Only `session.game` is stored; the undo
 * buffer is in-memory (see src/engine/undo.ts). Debouncing lives in the game store.
 */
import { createSession, GameSchema, type Game, type GameSession } from "@/engine";
import { getDb, type StoredGame, type TcgDb } from "./db";
import { migrateGame } from "./migrations";

export const ACTIVE_GAME_KEY = "activeGameId";
export const CORRUPT_BACKUP_PREFIX = "corruptBackup:";

export interface LoadActiveResult {
  session: GameSession | null;
  /** A stored game failed migration/validation; it was backed up and cleared (show a notice). */
  corrupt: boolean;
  backupKey?: string;
}

export async function saveActive(session: GameSession, db: TcgDb = getDb()): Promise<void> {
  const game = session.game;
  const row: StoredGame = {
    id: game.id,
    schemaVersion: game.schemaVersion,
    updatedAt: game.activity.lastAt ?? game.createdAt,
    game,
  };
  await db.transaction("rw", db.games, db.kv, async () => {
    const prev = await db.kv.get(ACTIVE_GAME_KEY);
    // A reset/new game gets a new id: drop the previous active row.
    if (typeof prev?.value === "string" && prev.value !== game.id)
      await db.games.delete(prev.value);
    await db.games.put(row);
    await db.kv.put({ key: ACTIVE_GAME_KEY, value: game.id });
  });
}

/** Validate a stored game (migrating older schema versions). Throws when invalid. */
export function parseStoredGame(raw: unknown): Game {
  return GameSchema.parse(migrateGame(raw));
}

export async function loadActive(
  db: TcgDb = getDb(),
  now: number = Date.now(),
): Promise<LoadActiveResult> {
  const ptr = await db.kv.get(ACTIVE_GAME_KEY);
  if (typeof ptr?.value !== "string") return { session: null, corrupt: false };
  const row = await db.games.get(ptr.value);
  if (!row) {
    await db.kv.delete(ACTIVE_GAME_KEY);
    return { session: null, corrupt: false };
  }
  try {
    return { session: createSession(parseStoredGame(row.game)), corrupt: false };
  } catch {
    const backupKey = `${CORRUPT_BACKUP_PREFIX}${now}`;
    await db.transaction("rw", db.games, db.kv, async () => {
      await db.kv.put({ key: backupKey, value: row });
      await db.games.delete(row.id);
      await db.kv.delete(ACTIVE_GAME_KEY);
    });
    return { session: null, corrupt: true, backupKey };
  }
}

export async function clearActive(db: TcgDb = getDb()): Promise<void> {
  await db.transaction("rw", db.games, db.kv, async () => {
    const ptr = await db.kv.get(ACTIVE_GAME_KEY);
    if (typeof ptr?.value === "string") await db.games.delete(ptr.value);
    await db.kv.delete(ACTIVE_GAME_KEY);
  });
}
