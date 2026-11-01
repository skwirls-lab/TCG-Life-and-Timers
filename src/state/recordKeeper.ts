"use client";
/**
 * Record keeper (T6.1 / HIST-003, HIST-008, HIST-032).
 *
 * `startRecordKeeper(store)` subscribes to the game store:
 * - when a game reaches status 'ended' it is saved as a record (unless history is off or the
 *   game is trivial);
 * - when the store switches to a different game while the previous one was unfinished and nobody
 *   called `finalizeBeforeReset` for it (a reset path that bypassed the Who-won flow), the
 *   previous game is saved with no winner (or discarded when trivial).
 *
 * `finalizeBeforeReset(game, decision)` is the Who-won flow's explicit save (HIST-031).
 */
import type { Game } from "@/engine";
import { getDb, type TcgDb } from "@/lib/db/db";
import {
  createRecord,
  historyEnabled,
  saveRecord,
  shouldDiscard,
  type GameRecord,
  type WinnerDecision,
} from "@/lib/records";
import type { useGameStore } from "./gameStore";

export { historyVisible } from "@/lib/records/policy";

type GameStoreApi = Pick<typeof useGameStore, "getState" | "subscribe">;

interface KeeperEnv {
  now: () => number;
  db: () => TcgDb;
  /** Force the plain JSON log (tests). */
  plainLog?: boolean;
}

let env: KeeperEnv = { now: () => Date.now(), db: getDb };
/** Games already finalized by the Who-won flow (or deliberately not saved). */
const handled = new Set<string>();
let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  queue = run.catch((e: unknown) => console.warn("[records] save failed", e));
  return run;
}

/** Test hook: inject clock / db (no args → defaults) and forget handled games. */
export function configureRecordKeeper(overrides?: Partial<KeeperEnv>): void {
  env = overrides ? { ...env, ...overrides } : { now: () => Date.now(), db: getDb };
  handled.clear();
}

/** Resolves when every queued save has finished (tests, before navigation). */
export function recordKeeperIdle(): Promise<void> {
  return queue.then(() => undefined);
}

/** Mark a game as dealt with so the keeper never saves it on its own. */
export function markHandled(gameId: string): void {
  handled.add(gameId);
}

async function persist(game: Game, decision: WinnerDecision, replace: boolean) {
  const record = await createRecord(game, {
    now: env.now(),
    decision,
    encode: env.plainLog ? { plain: true } : undefined,
  });
  const db = env.db();
  if (!replace) {
    const existing = await db.records.get(record.id);
    // Same ending already stored (e.g. the ended game was restored on reload): keep it (and edits).
    if (existing && existing.endedAt === record.endedAt) return null;
    if (existing) replace = true;
  }
  await saveRecord(record, { db, replace });
  return record;
}

/**
 * Save (or discard) the game before a reset / new game according to the Who-won decision.
 * Returns the saved record, or null when nothing was kept.
 */
export function finalizeBeforeReset(
  game: Game,
  decision: WinnerDecision,
): Promise<GameRecord | null> {
  handled.add(game.id);
  if (decision.kind === "discard" || !historyEnabled(game)) return Promise.resolve(null);
  if (decision.kind === "auto" && shouldDiscard(game, env.now())) return Promise.resolve(null);
  return enqueue(() => persist(game, decision, decision.kind !== "auto"));
}

/** Save an ended game (auto result). */
function onEnded(game: Game) {
  if (!historyEnabled(game) || shouldDiscard(game, env.now())) return;
  void enqueue(() => persist(game, { kind: "auto" }, false));
}

/** Previous unfinished game replaced without going through the Who-won flow. */
function onReplaced(prev: Game) {
  if (handled.has(prev.id)) return;
  handled.add(prev.id);
  if (!historyEnabled(prev) || shouldDiscard(prev, env.now())) return;
  void enqueue(() => persist(prev, { kind: "auto" }, false));
}

let stop: (() => void) | null = null;

/** Start the subscription (idempotent). Mount once at app level. Returns a stop function. */
export function startRecordKeeper(store: GameStoreApi): () => void {
  if (stop) return stop;
  const initial = store.getState().session?.game;
  if (initial?.status === "ended") onEnded(initial);
  const unsub = store.subscribe((state, prevState) => {
    const game = state.session?.game;
    const prev = prevState.session?.game;
    if (game === prev) return;
    if (prev && game && prev.id !== game.id && prev.status !== "ended") onReplaced(prev);
    if (game?.status === "ended" && (prev?.id !== game.id || prev.status !== "ended")) {
      onEnded(game);
    }
  });
  stop = () => {
    unsub();
    stop = null;
  };
  return stop;
}

export function stopRecordKeeper(): void {
  stop?.();
}
