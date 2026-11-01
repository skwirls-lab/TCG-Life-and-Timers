/**
 * Records repository (HIST-003, HIST-007, HIST-034, HIST-035) over the Dexie `records` table.
 *
 * - `saveRecord` is write-once: an existing id is kept unless `replace` is set (D-013/D-053).
 * - Soft cap (HIST-007): beyond RECORD_SOFT_CAP the oldest records are compacted (log dropped).
 * - Edits (winner / names / deck) bump `updatedAt` and set `edited`; they stay local (write-once
 *   sync never pushes updates).
 */
import { getDb, normalizeName, type StoredRecord, type TcgDb } from "@/lib/db/db";
import { assignPlaces, buildRecord, syncSeats } from "./build";
import { decodeLog } from "./compress";
import { hydrateRecord } from "./hydrate";
import { NAME_PREFIX, PROFILE_PREFIX, identityOf } from "./identity";
import { RECORD_SOFT_CAP, type GameRecord, type RecordOutcome, type RecordPlayer } from "./types";

export interface RepoOptions {
  db?: TcgDb;
  now?: number;
}

const dbOf = (o?: RepoOptions) => o?.db ?? getDb();
const nowOf = (o?: RepoOptions) => o?.now ?? Date.now();

function toRow(r: GameRecord): StoredRecord {
  return r as unknown as StoredRecord;
}

/** Save a record. Returns false when a record with that id already exists (write-once). */
export async function saveRecord(
  record: GameRecord,
  opts: RepoOptions & { replace?: boolean; cap?: number } = {},
): Promise<boolean> {
  const db = dbOf(opts);
  const saved = await db.transaction("rw", db.records, async () => {
    const existing = await db.records.get(record.id);
    if (existing && !opts.replace) return false;
    const createdAt =
      existing && typeof existing.createdAt === "number" ? existing.createdAt : record.createdAt;
    await db.records.put(toRow({ ...record, createdAt }));
    return true;
  });
  if (saved) await enforceCap({ ...opts, cap: opts.cap });
  return saved;
}

export async function getRecord(id: string, opts?: RepoOptions): Promise<GameRecord | undefined> {
  const row = await dbOf(opts).records.get(id);
  return row ? hydrateRecord(row) : undefined;
}

/** All records, newest first. */
export async function listRecords(opts?: RepoOptions): Promise<GameRecord[]> {
  const rows = await dbOf(opts).records.orderBy("endedAt").reverse().toArray();
  return rows.map(hydrateRecord);
}

export async function countRecords(opts?: RepoOptions): Promise<number> {
  return dbOf(opts).records.count();
}

export async function deleteRecord(id: string, opts?: RepoOptions): Promise<void> {
  await dbOf(opts).records.delete(id);
}

/** HIST-007: compact the oldest records beyond the soft cap (log dropped, summary kept). */
export async function enforceCap(opts: RepoOptions & { cap?: number } = {}): Promise<number> {
  const db = dbOf(opts);
  const cap = opts.cap ?? RECORD_SOFT_CAP;
  const total = await db.records.count();
  if (total <= cap) return 0;
  const old = await db.records
    .orderBy("endedAt")
    .limit(total - cap)
    .toArray();
  let n = 0;
  for (const row of old) {
    if (row.log === undefined && row.compacted === true) continue;
    const { log: _log, ...rest } = row;
    await db.records.put({ ...rest, compacted: true } as StoredRecord);
    n++;
  }
  return n;
}

/**
 * Records that arrived from another device carry only the sync fields. When the snapshot log is
 * present, rebuild the local detail from it (keeping the synced winners / times) and store it.
 */
export async function enrichPartial(record: GameRecord, opts?: RepoOptions): Promise<GameRecord> {
  if (!record.partial || !record.log) return record;
  const game = await decodeLog(record.log);
  if (!game) return record;
  const winners = record.seats
    .map((s, i) => (s.winner ? game.seats[i]?.id : undefined))
    .filter((id): id is string => id !== undefined);
  const rebuilt = buildRecord(game, {
    now: record.endedAt,
    decision: winners.length ? { kind: "winners", seatIds: winners } : { kind: "auto" },
  });
  const out: GameRecord = {
    ...rebuilt,
    startedAt: record.startedAt,
    endedAt: record.endedAt,
    durationMs: record.durationMs,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    log: record.log,
  };
  await dbOf(opts).records.put(toRow(out));
  return out;
}

// ---------------------------------------------------------------------------------------------
// HIST-035 edit a past game
// ---------------------------------------------------------------------------------------------

export interface RecordEdit {
  /** New winners (seat ids); [] with outcome 'draw' / 'none'. */
  winners?: string[];
  outcome?: RecordOutcome;
  /** seatId → name */
  names?: Record<string, string>;
  /** seatId → deck (undefined fields clear) */
  decks?: Record<string, { deckId?: string; deckName?: string }>;
  /** seatId → profile id (null unlinks) */
  profiles?: Record<string, string | null>;
}

/** Recompute the sync seats / winners / places after the players changed. */
export function refreshDerived(r: GameRecord, players: RecordPlayer[], outcome: RecordOutcome) {
  const placed = assignPlaces(players, outcome);
  return {
    ...r,
    players: placed,
    outcome,
    winners: placed.filter((p) => p.winner).map((p) => p.seatId),
    seats: syncSeats(placed),
  };
}

export function applyEdit(r: GameRecord, edit: RecordEdit, now: number): GameRecord {
  let outcome = r.outcome;
  const players = r.players.map((p) => {
    let q: RecordPlayer = { ...p };
    if (edit.winners) {
      q.winner = edit.winners.includes(p.seatId);
      if (q.winner) {
        const { eliminatedOrder: _e, ...rest } = q;
        q = rest;
      } else {
        const idx = r.eliminations.findIndex((e) => e.seatId === p.seatId);
        if (idx >= 0) q.eliminatedOrder = idx + 1;
      }
    }
    const name = edit.names?.[p.seatId];
    if (name !== undefined && name.trim()) {
      q.name = name.trim();
      if (!q.profileId) q.identity = identityOf(q);
    }
    const deck = edit.decks?.[p.seatId];
    if (deck) {
      const { deckId: _d, deckName: _n, ...rest } = q;
      q = { ...rest };
      if (deck.deckId) q.deckId = deck.deckId;
      if (deck.deckName?.trim()) q.deckName = deck.deckName.trim();
    }
    if (edit.profiles && p.seatId in edit.profiles) {
      const pid = edit.profiles[p.seatId];
      const { profileId: _p, ...rest } = q;
      q = pid ? { ...rest, profileId: pid } : rest;
      q.identity = identityOf(q);
    }
    return q;
  });
  if (edit.winners) {
    outcome = edit.winners.length ? "win" : (edit.outcome ?? "none");
  } else if (edit.outcome) {
    outcome = edit.outcome;
  }
  return { ...refreshDerived(r, players, outcome), updatedAt: now, edited: true };
}

export async function updateRecord(
  id: string,
  edit: RecordEdit,
  opts?: RepoOptions,
): Promise<GameRecord | undefined> {
  const db = dbOf(opts);
  const row = await db.records.get(id);
  if (!row) return undefined;
  const next = applyEdit(hydrateRecord(row), edit, nowOf(opts));
  await db.records.put(toRow(next));
  return next;
}

// ---------------------------------------------------------------------------------------------
// HIST-034 merge / rename / link identities
// ---------------------------------------------------------------------------------------------

export interface IdentityChange {
  /** Number of player entries rewritten. */
  count: number;
  /** Restore the affected records as they were (snackbar Undo). */
  undo: () => Promise<void>;
}

async function rewrite(
  fn: (p: RecordPlayer) => RecordPlayer | null,
  opts?: RepoOptions,
): Promise<IdentityChange> {
  const db = dbOf(opts);
  const now = nowOf(opts);
  const before: StoredRecord[] = [];
  let count = 0;
  await db.transaction("rw", db.records, async () => {
    const rows = await db.records.toArray();
    for (const row of rows) {
      const r = hydrateRecord(row);
      let changed = false;
      const players = r.players.map((p) => {
        const q = fn(p);
        if (!q) return p;
        changed = true;
        count++;
        return q;
      });
      if (!changed) continue;
      before.push(row);
      await db.records.put(toRow({ ...refreshDerived(r, players, r.outcome), updatedAt: now }));
    }
  });
  return {
    count,
    undo: async () => {
      await db.records.bulkPut(before);
    },
  };
}

/** Merge identity `from` into `into` (e.g. two "Declan" rows). */
export async function mergeIdentities(
  from: string,
  into: string,
  opts?: RepoOptions & { name?: string },
): Promise<IdentityChange> {
  if (from === into) return { count: 0, undo: async () => {} };
  const profileId = into.startsWith(PROFILE_PREFIX) ? into.slice(PROFILE_PREFIX.length) : null;
  return rewrite((p) => {
    if (p.identity !== from) return null;
    const q: RecordPlayer = { ...p, identity: into };
    if (profileId) q.profileId = profileId;
    if (opts?.name) q.name = opts.name;
    return q;
  }, opts);
}

/** Rename an identity everywhere; a name-only identity moves to the new normalized name. */
export async function renameIdentity(
  identity: string,
  name: string,
  opts?: RepoOptions,
): Promise<IdentityChange> {
  const clean = name.trim().replace(/\s+/g, " ");
  if (!clean) return { count: 0, undo: async () => {} };
  return rewrite((p) => {
    if (p.identity !== identity) return null;
    const q: RecordPlayer = { ...p, name: clean };
    if (identity.startsWith(NAME_PREFIX)) q.identity = `${NAME_PREFIX}${normalizeName(clean)}`;
    return q;
  }, opts);
}

/** Link a name-only identity to a profile (PROF-011 / HIST-034). */
export async function linkIdentityToProfile(
  identity: string,
  profileId: string,
  opts?: RepoOptions & { name?: string },
): Promise<IdentityChange> {
  return mergeIdentities(identity, `${PROFILE_PREFIX}${profileId}`, opts);
}

/** Import records, skipping ids that already exist (dedupe). */
export async function importRecords(
  records: readonly GameRecord[],
  opts?: RepoOptions,
): Promise<{ added: number; skipped: number }> {
  let added = 0;
  let skipped = 0;
  for (const r of records) {
    if (await saveRecord(r, { ...opts, cap: Number.POSITIVE_INFINITY })) added++;
    else skipped++;
  }
  await enforceCap(opts);
  return { added, skipped };
}
