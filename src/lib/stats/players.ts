/**
 * Player & deck stats (HIST-021, HIST-022, HIST-033). Pure functions over records.
 *
 * W/L: a win is a game the identity won; a loss is a game someone else won. Draws and
 * "No winner" games count as games but not as W/L. Win % = W / (W + L) (null when 0).
 */
import { isDefaultIdentity } from "@/lib/records/identity";
import type { CauseKind, GameRecord, RecordPlayer } from "@/lib/records/types";
import { deckKey } from "./filter";

export interface WL {
  games: number;
  wins: number;
  losses: number;
  /** 0..1, null without decided games. */
  winPct: number | null;
}

export interface Bucket extends WL {
  key: string;
  label: string;
}

export const pct = (wins: number, losses: number): number | null =>
  wins + losses > 0 ? wins / (wins + losses) : null;

function tally(target: WL, r: GameRecord, p: RecordPlayer) {
  target.games++;
  if (p.winner) target.wins++;
  else if (r.outcome === "win") target.losses++;
  target.winPct = pct(target.wins, target.losses);
}

const empty = (): WL => ({ games: 0, wins: 0, losses: 0, winPct: null });

export interface IdentityRow extends WL {
  identity: string;
  name: string;
  profileId?: string;
  lastPlayed: number;
  isDefault: boolean;
}

export interface StatsOptions {
  includeDefaultNames?: boolean;
}

const visible = (identity: string, o?: StatsOptions) =>
  o?.includeDefaultNames === true || !isDefaultIdentity(identity);

/** Players list: one row per identity, most games first. */
export function playerRows(records: readonly GameRecord[], o?: StatsOptions): IdentityRow[] {
  const rows = new Map<string, IdentityRow>();
  for (const r of records) {
    for (const p of r.players) {
      if (!visible(p.identity, o)) continue;
      let row = rows.get(p.identity);
      if (!row) {
        row = {
          identity: p.identity,
          name: p.name,
          lastPlayed: r.endedAt,
          isDefault: isDefaultIdentity(p.identity),
          ...empty(),
        };
        if (p.profileId) row.profileId = p.profileId;
        rows.set(p.identity, row);
      }
      if (r.endedAt >= row.lastPlayed) {
        row.lastPlayed = r.endedAt;
        row.name = p.name.trim() || row.name;
      }
      tally(row, r, p);
    }
  }
  return [...rows.values()].sort(
    (a, b) => b.games - a.games || b.wins - a.wins || a.name.localeCompare(b.name),
  );
}

/** Names of identities (most recent name), for labels. */
export function identityNames(records: readonly GameRecord[]): Map<string, string> {
  const out = new Map<string, { name: string; at: number }>();
  for (const r of records) {
    for (const p of r.players) {
      const cur = out.get(p.identity);
      if (!cur || r.endedAt >= cur.at) {
        out.set(p.identity, { name: p.name.trim() || cur?.name || p.name, at: r.endedAt });
      }
    }
  }
  return new Map([...out.entries()].map(([k, v]) => [k, v.name]));
}

function bucketize(
  map: Map<string, Bucket>,
  key: string,
  label: string,
  r: GameRecord,
  p: RecordPlayer,
) {
  let b = map.get(key);
  if (!b) {
    b = { key, label, ...empty() };
    map.set(key, b);
  }
  tally(b, r, p);
}

const byGames = (a: Bucket, b: Bucket) => b.games - a.games || a.label.localeCompare(b.label);
const byPosition = (a: Bucket, b: Bucket) => Number(a.key) - Number(b.key);

/** Average turn length over clock stats, weighted by timed turns (null without data). */
export function weightedTurnMs(players: readonly RecordPlayer[]): number | null {
  let ms = 0;
  let turns = 0;
  for (const p of players) {
    const c = p.clock;
    if (!c || c.avgTurnMs === null || c.timedTurns <= 0) continue;
    ms += c.avgTurnMs * c.timedTurns;
    turns += c.timedTurns;
  }
  return turns > 0 ? Math.round(ms / turns) : null;
}

export interface HeadToHead {
  identity: string;
  name: string;
  games: number;
  /** Games this player won against them. */
  wins: number;
  /** Games they won. */
  losses: number;
}

export interface PlayerDetail {
  row: IdentityRow;
  byPreset: Bucket[];
  byDeck: Bucket[];
  byPosition: Bucket[];
  avgTurnMs: number | null;
  headToHead: HeadToHead[];
  /** Most games together. */
  favoriteOpponents: HeadToHead[];
  commonCause: { kind: CauseKind; count: number } | null;
  games: GameRecord[];
}

export function playerDetail(
  records: readonly GameRecord[],
  identity: string,
  o?: StatsOptions,
): PlayerDetail | null {
  const row = playerRows(records, { includeDefaultNames: true }).find(
    (x) => x.identity === identity,
  );
  if (!row) return null;
  const names = identityNames(records);
  const presets = new Map<string, Bucket>();
  const decks = new Map<string, Bucket>();
  const positions = new Map<string, Bucket>();
  const h2h = new Map<string, HeadToHead>();
  const causes = new Map<CauseKind, number>();
  const mine: RecordPlayer[] = [];
  const games: GameRecord[] = [];
  for (const r of records) {
    const me = r.players.find((p) => p.identity === identity);
    if (!me) continue;
    games.push(r);
    mine.push(me);
    bucketize(presets, r.presetId, r.presetName, r, me);
    const dk = deckKey(me);
    if (dk) bucketize(decks, dk, me.deckName || me.commanders.join(" / "), r, me);
    if (me.turnPosition !== undefined) {
      bucketize(positions, String(me.turnPosition), String(me.turnPosition), r, me);
    }
    const elim = r.eliminations.find((e) => e.seatId === me.seatId);
    if (elim && !me.winner) causes.set(elim.causeKind, (causes.get(elim.causeKind) ?? 0) + 1);
    for (const other of r.players) {
      if (other.identity === identity || !visible(other.identity, o)) continue;
      let h = h2h.get(other.identity);
      if (!h) {
        h = {
          identity: other.identity,
          name: names.get(other.identity) ?? other.name,
          games: 0,
          wins: 0,
          losses: 0,
        };
        h2h.set(other.identity, h);
      }
      h.games++;
      if (me.winner) h.wins++;
      if (other.winner) h.losses++;
    }
  }
  let commonCause: PlayerDetail["commonCause"] = null;
  for (const [kind, count] of causes) {
    if (!commonCause || count > commonCause.count) commonCause = { kind, count };
  }
  const headToHead = [...h2h.values()].sort(
    (a, b) => b.games - a.games || a.name.localeCompare(b.name),
  );
  return {
    row,
    byPreset: [...presets.values()].sort(byGames),
    byDeck: [...decks.values()].sort(byGames),
    byPosition: [...positions.values()].sort(byPosition),
    avgTurnMs: weightedTurnMs(mine),
    headToHead,
    favoriteOpponents: headToHead.slice(0, 3),
    commonCause,
    games,
  };
}

// ---------------------------------------------------------------------------------------------
// Decks (HIST-022)
// ---------------------------------------------------------------------------------------------

export interface DeckRow extends WL {
  key: string;
  deckName: string;
  commanders: string[];
  identity: string;
  playerName: string;
  art?: RecordPlayer["art"];
  color: string;
  lastPlayed: number;
}

export function deckRows(records: readonly GameRecord[], o?: StatsOptions): DeckRow[] {
  const rows = new Map<string, DeckRow>();
  for (const r of records) {
    for (const p of r.players) {
      const key = deckKey(p);
      if (!key || !visible(p.identity, o)) continue;
      let row = rows.get(key);
      if (!row) {
        row = {
          key,
          deckName: p.deckName || p.commanders.join(" / "),
          commanders: p.commanders,
          identity: p.identity,
          playerName: p.name,
          color: p.color,
          lastPlayed: r.endedAt,
          ...empty(),
        };
        rows.set(key, row);
      }
      if (r.endedAt >= row.lastPlayed) {
        row.lastPlayed = r.endedAt;
        row.playerName = p.name;
        if (p.art) row.art = p.art;
        if (p.commanders.length) row.commanders = p.commanders;
      }
      if (!row.art && p.art) row.art = p.art;
      tally(row, r, p);
    }
  }
  return [...rows.values()].sort(
    (a, b) => b.games - a.games || b.wins - a.wins || a.deckName.localeCompare(b.deckName),
  );
}

export interface DamageRow {
  identity: string;
  name: string;
  amount: number;
}

export interface DeckDetail {
  row: DeckRow;
  byPosition: Bucket[];
  avgPlace: number | null;
  games: GameRecord[];
  damageTo: DamageRow[];
  damageFrom: DamageRow[];
}

export function deckDetail(records: readonly GameRecord[], key: string): DeckDetail | null {
  const row = deckRows(records, { includeDefaultNames: true }).find((d) => d.key === key);
  if (!row) return null;
  const names = identityNames(records);
  const positions = new Map<string, Bucket>();
  const to = new Map<string, number>();
  const from = new Map<string, number>();
  const games: GameRecord[] = [];
  let places = 0;
  let placed = 0;
  for (const r of records) {
    const me = r.players.find((p) => deckKey(p) === key);
    if (!me) continue;
    games.push(r);
    if (me.turnPosition !== undefined) {
      bucketize(positions, String(me.turnPosition), String(me.turnPosition), r, me);
    }
    if (me.place !== undefined) {
      places += me.place;
      placed++;
    }
    const idOf = (seatId: string) => r.players.find((p) => p.seatId === seatId)?.identity;
    for (const c of r.commanderDamage) {
      if (c.from === me.seatId && c.to !== me.seatId) {
        const id = idOf(c.to);
        if (id) to.set(id, (to.get(id) ?? 0) + c.amount);
      } else if (c.to === me.seatId && c.from !== me.seatId) {
        const id = idOf(c.from);
        if (id) from.set(id, (from.get(id) ?? 0) + c.amount);
      }
    }
  }
  const rowsOf = (m: Map<string, number>): DamageRow[] =>
    [...m.entries()]
      .map(([identity, amount]) => ({ identity, name: names.get(identity) ?? identity, amount }))
      .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
  return {
    row,
    byPosition: [...positions.values()].sort(byPosition),
    avgPlace: placed ? places / placed : null,
    games,
    damageTo: rowsOf(to),
    damageFrom: rowsOf(from),
  };
}
