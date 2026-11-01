/** Insights dashboard metrics (HIST-023 + our additions). Pure functions over records. */
import { isDefaultIdentity } from "@/lib/records/identity";
import type { CauseKind, GameRecord } from "@/lib/records/types";
import { identityNames, pct, weightedTurnMs, type StatsOptions } from "./players";

const visible = (identity: string, o?: StatsOptions) =>
  o?.includeDefaultNames === true || !isDefaultIdentity(identity);

export interface Summary {
  games: number;
  totalMs: number;
  /** null without games. */
  avgMs: number | null;
}

/** Summary tiles: games, total play time (active), average game. */
export function summary(records: readonly GameRecord[]): Summary {
  const totalMs = records.reduce((a, r) => a + r.durationMs, 0);
  return {
    games: records.length,
    totalMs,
    avgMs: records.length ? Math.round(totalMs / records.length) : null,
  };
}

export interface PositionStat {
  /** 1 = went first. */
  position: number;
  /** Decided games that had this position. */
  games: number;
  wins: number;
  pct: number | null;
}

/** Turn-order advantage: win % by starting position over games with a winner. */
export function turnOrderAdvantage(records: readonly GameRecord[]): PositionStat[] {
  const games = new Map<number, number>();
  const wins = new Map<number, number>();
  for (const r of records) {
    if (r.outcome !== "win") continue;
    if (!r.players.some((p) => p.turnPosition !== undefined)) continue;
    for (const p of r.players) {
      if (p.turnPosition === undefined) continue;
      games.set(p.turnPosition, (games.get(p.turnPosition) ?? 0) + 1);
      if (p.winner) wins.set(p.turnPosition, (wins.get(p.turnPosition) ?? 0) + 1);
    }
  }
  return [...games.keys()]
    .sort((a, b) => a - b)
    .map((position) => {
      const g = games.get(position)!;
      const w = wins.get(position) ?? 0;
      return { position, games: g, wins: w, pct: g ? w / g : null };
    });
}

export interface Durations {
  avgMs: number | null;
  longest: { id: string; ms: number } | null;
  shortest: { id: string; ms: number } | null;
  /** Over games with turn tracking. */
  avgTurns: number | null;
  avgTurnMs: number | null;
}

export function durations(records: readonly GameRecord[]): Durations {
  let longest: Durations["longest"] = null;
  let shortest: Durations["shortest"] = null;
  for (const r of records) {
    if (!longest || r.durationMs > longest.ms) longest = { id: r.id, ms: r.durationMs };
    if (!shortest || r.durationMs < shortest.ms) shortest = { id: r.id, ms: r.durationMs };
  }
  const tracked = records.filter((r) => r.turnTracking && r.turns > 0);
  return {
    avgMs: summary(records).avgMs,
    longest,
    shortest,
    avgTurns: tracked.length ? tracked.reduce((a, r) => a + r.turns, 0) / tracked.length : null,
    avgTurnMs: weightedTurnMs(records.flatMap((r) => r.players)),
  };
}

export interface PresetStat {
  presetId: string;
  presetName: string;
  games: number;
  /** Best win % among identities with ≥ 1 win (ties: more wins, then name). */
  leader: { identity: string; name: string; wins: number; winPct: number } | null;
}

export function byPreset(records: readonly GameRecord[], o?: StatsOptions): PresetStat[] {
  const names = identityNames(records);
  const groups = new Map<string, GameRecord[]>();
  for (const r of records) groups.set(r.presetId, [...(groups.get(r.presetId) ?? []), r]);
  return [...groups.entries()]
    .map(([presetId, list]) => {
      const wl = new Map<string, { wins: number; losses: number }>();
      for (const r of list) {
        for (const p of r.players) {
          if (!visible(p.identity, o)) continue;
          const cur = wl.get(p.identity) ?? { wins: 0, losses: 0 };
          if (p.winner) cur.wins++;
          else if (r.outcome === "win") cur.losses++;
          wl.set(p.identity, cur);
        }
      }
      let leader: PresetStat["leader"] = null;
      for (const [identity, { wins, losses }] of wl) {
        if (wins === 0) continue;
        const winPct = pct(wins, losses)!;
        const name = names.get(identity) ?? identity;
        if (
          !leader ||
          winPct > leader.winPct ||
          (winPct === leader.winPct &&
            (wins > leader.wins || (wins === leader.wins && name.localeCompare(leader.name) < 0)))
        ) {
          leader = { identity, name, wins, winPct };
        }
      }
      return { presetId, presetName: list[0]!.presetName, games: list.length, leader };
    })
    .sort((a, b) => b.games - a.games || a.presetName.localeCompare(b.presetName));
}

export interface CauseStat {
  kind: CauseKind;
  count: number;
  pct: number;
}

/** Elimination causes breakdown (life / poison / commander damage / time / concede …). */
export function eliminationCauses(records: readonly GameRecord[]): CauseStat[] {
  const counts = new Map<CauseKind, number>();
  let total = 0;
  for (const r of records) {
    for (const e of r.eliminations) {
      counts.set(e.causeKind, (counts.get(e.causeKind) ?? 0) + 1);
      total++;
    }
  }
  return [...counts.entries()]
    .map(([kind, count]) => ({ kind, count, pct: count / total }))
    .sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind));
}

export interface IdentityCount {
  identity: string;
  name: string;
  count: number;
  games: number;
  pct: number;
}

/** First blood: who is eliminated first, as a share of their games. */
export function firstBlood(records: readonly GameRecord[], o?: StatsOptions): IdentityCount[] {
  const names = identityNames(records);
  const counts = new Map<string, number>();
  const games = new Map<string, number>();
  for (const r of records) {
    for (const p of r.players) games.set(p.identity, (games.get(p.identity) ?? 0) + 1);
    const first = r.eliminations[0];
    const who = first && r.players.find((p) => p.seatId === first.seatId);
    if (who) counts.set(who.identity, (counts.get(who.identity) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([id]) => visible(id, o))
    .map(([identity, count]) => {
      const g = games.get(identity)!;
      return { identity, name: names.get(identity) ?? identity, count, games: g, pct: count / g };
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export interface DamageLeader {
  identity: string;
  name: string;
  total: number;
  games: number;
}

/** Commander damage leaderboard: total commander damage dealt to opponents. */
export function commanderLeaderboard(
  records: readonly GameRecord[],
  o?: StatsOptions,
): DamageLeader[] {
  const names = identityNames(records);
  const totals = new Map<string, { total: number; games: number }>();
  for (const r of records) {
    for (const p of r.players) {
      if (p.commanderDamageDealt <= 0 || !visible(p.identity, o)) continue;
      const cur = totals.get(p.identity) ?? { total: 0, games: 0 };
      cur.total += p.commanderDamageDealt;
      cur.games++;
      totals.set(p.identity, cur);
    }
  }
  return [...totals.entries()]
    .map(([identity, v]) => ({ identity, name: names.get(identity) ?? identity, ...v }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

export interface ClockRow {
  identity: string;
  name: string;
  avgTurnMs: number | null;
  timedTurns: number;
  responseMs: number;
  responses: number;
  timeouts: number;
}

export interface ClockInsights {
  rows: ClockRow[];
  slowest: ClockRow | null;
  fastest: ClockRow | null;
  /** Most total time spent responding. */
  responder: ClockRow | null;
  /** Most timeouts. */
  timeouts: ClockRow | null;
}

/** Clock stats: slowest / fastest average turn, response time, timeouts. */
export function clockInsights(records: readonly GameRecord[], o?: StatsOptions): ClockInsights {
  const names = identityNames(records);
  const acc = new Map<string, ClockRow & { ms: number }>();
  for (const r of records) {
    for (const p of r.players) {
      const c = p.clock;
      if (!c || !visible(p.identity, o)) continue;
      const row = acc.get(p.identity) ?? {
        identity: p.identity,
        name: names.get(p.identity) ?? p.name,
        avgTurnMs: null,
        timedTurns: 0,
        responseMs: 0,
        responses: 0,
        timeouts: 0,
        ms: 0,
      };
      if (c.avgTurnMs !== null && c.timedTurns > 0) {
        row.ms += c.avgTurnMs * c.timedTurns;
        row.timedTurns += c.timedTurns;
      }
      row.responseMs += c.responseMs;
      row.responses += c.responses;
      row.timeouts += c.timeouts;
      acc.set(p.identity, row);
    }
  }
  const rows: ClockRow[] = [...acc.values()]
    .map(({ ms, ...row }) => ({
      ...row,
      avgTurnMs: row.timedTurns ? Math.round(ms / row.timedTurns) : null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const timed = rows.filter((r) => r.avgTurnMs !== null);
  const pick = (list: ClockRow[], better: (a: ClockRow, b: ClockRow) => boolean) =>
    list.reduce<ClockRow | null>((best, r) => (!best || better(r, best) ? r : best), null);
  return {
    rows,
    slowest: pick(timed, (a, b) => a.avgTurnMs! > b.avgTurnMs!),
    fastest: pick(timed, (a, b) => a.avgTurnMs! < b.avgTurnMs!),
    responder: pick(
      rows.filter((r) => r.responseMs > 0),
      (a, b) => a.responseMs > b.responseMs,
    ),
    timeouts: pick(
      rows.filter((r) => r.timeouts > 0),
      (a, b) => a.timeouts > b.timeouts,
    ),
  };
}

export interface Playgroup {
  key: string;
  identities: string[];
  names: string[];
  games: number;
  lastPlayed: number;
}

/** Playgroups: the same set of players together over time (≥ 2 games). */
export function playgroups(records: readonly GameRecord[]): Playgroup[] {
  const names = identityNames(records);
  const groups = new Map<string, Playgroup>();
  for (const r of records) {
    const ids = [...new Set(r.players.map((p) => p.identity))].sort();
    const key = ids.join("+");
    const g = groups.get(key) ?? {
      key,
      identities: ids,
      names: ids.map((id) => names.get(id) ?? id),
      games: 0,
      lastPlayed: 0,
    };
    g.games++;
    g.lastPlayed = Math.max(g.lastPlayed, r.endedAt);
    groups.set(key, g);
  }
  return [...groups.values()]
    .filter((g) => g.games >= 2)
    .sort((a, b) => b.games - a.games || b.lastPlayed - a.lastPlayed);
}
