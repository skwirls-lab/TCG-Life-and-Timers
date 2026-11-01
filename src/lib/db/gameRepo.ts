/**
 * Active game persistence (ARCH-006, GAME-016, REL-001). Only `session.game` is stored; the undo
 * buffer is in-memory (see src/engine/undo.ts). Debouncing lives in the game store.
 *
 * Multi-tab safety (B-2): every tab has its own Dexie connection, and the repo remembers per
 * connection which active game this tab last loaded or wrote ("owned"). A save only deletes the
 * row this tab itself replaced (a reset / new game in this tab) — never another tab's game. When
 * the shared pointer names a game this tab does not own, the save keeps the pointer (the other
 * tab is the active writer), still stores this tab's row (no data loss) and reports a conflict;
 * `takeOver` (a new game / "Use here" in this tab) moves the pointer without deleting anything.
 * Cross-tab notification lives in `./tabGuard.ts`.
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

/** The active game id each connection (tab) last loaded or wrote (null = none). */
const owned = new WeakMap<TcgDb, string | null>();

/** The active game id this connection owns (undefined = it never loaded or saved one). */
export function ownedActiveId(db: TcgDb = getDb()): string | null | undefined {
  return owned.get(db);
}

export type SaveActiveResult = "saved" | "conflict";

export async function saveActive(
  session: GameSession,
  db: TcgDb = getDb(),
  opts: { takeOver?: boolean } = {},
): Promise<SaveActiveResult> {
  const game = session.game;
  const row: StoredGame = {
    id: game.id,
    schemaVersion: game.schemaVersion,
    updatedAt: game.activity.lastAt ?? game.createdAt,
    game,
  };
  const result = await db.transaction("rw", db.games, db.kv, async () => {
    const ptr = await db.kv.get(ACTIVE_GAME_KEY);
    const prev = typeof ptr?.value === "string" ? ptr.value : null;
    if (prev !== null && prev !== game.id) {
      if (prev === owned.get(db)) {
        // A reset/new game in this tab gets a new id: drop the row this tab replaced.
        await db.games.delete(prev);
      } else if (!opts.takeOver) {
        // Another tab's game is active: never delete or repoint it; keep ours stored.
        await db.games.put(row);
        return "conflict" as const;
      }
    }
    await db.games.put(row);
    await db.kv.put({ key: ACTIVE_GAME_KEY, value: game.id });
    return "saved" as const;
  });
  if (result === "saved") owned.set(db, game.id);
  return result;
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
  owned.set(db, null);
  if (typeof ptr?.value !== "string") return { session: null, corrupt: false };
  const row = await db.games.get(ptr.value);
  if (!row) {
    await db.kv.delete(ACTIVE_GAME_KEY);
    return { session: null, corrupt: false };
  }
  try {
    const session = createSession(parseStoredGame(row.game));
    owned.set(db, row.id);
    return { session, corrupt: false };
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

/** Drop this tab's active game. Another tab's active game (B-2) is left alone. */
export async function clearActive(db: TcgDb = getDb()): Promise<void> {
  const mine = owned.get(db);
  await db.transaction("rw", db.games, db.kv, async () => {
    const ptr = await db.kv.get(ACTIVE_GAME_KEY);
    if (typeof ptr?.value !== "string") return;
    if (mine !== undefined && mine !== ptr.value) {
      if (mine !== null) await db.games.delete(mine);
      return;
    }
    await db.games.delete(ptr.value);
    await db.kv.delete(ACTIVE_GAME_KEY);
  });
  owned.set(db, null);
}
