/** HIST-024 record filter (applies to Games, Players, Decks and Insights). Pure. */
import { normalizeName } from "@/lib/db/db";
import type { GameRecord, RecordPlayer } from "@/lib/records/types";

export interface RecordFilter {
  /** endedAt ≥ from (epoch ms, inclusive). */
  from?: number;
  /** endedAt < to (epoch ms, exclusive). */
  to?: number;
  presetIds?: string[];
  playerCounts?: number[];
  /** Every listed identity must have played. */
  identities?: string[];
  /** Any listed deck key must have been played. */
  decks?: string[];
  startValues?: number[];
  timer?: "on" | "off";
  winnerOnly?: boolean;
  /** HIST-033: show default "Player N" names in Players / Decks / Insights. */
  includeDefaultNames?: boolean;
}

export const EMPTY_FILTER: RecordFilter = {};

/** Deck identity: the deck id, else the player identity + deck / commander name. */
export function deckKey(p: Pick<RecordPlayer, "deckId" | "deckName" | "commanders" | "identity">) {
  if (p.deckId) return `d:${p.deckId}`;
  const label = p.deckName?.trim() || p.commanders.filter(Boolean).join(" / ");
  return label ? `x:${p.identity}|${normalizeName(label)}` : null;
}

const has = <T>(list: readonly T[] | undefined): list is readonly T[] =>
  list !== undefined && list.length > 0;

export function matchesFilter(r: GameRecord, f: RecordFilter): boolean {
  if (f.from !== undefined && r.endedAt < f.from) return false;
  if (f.to !== undefined && r.endedAt >= f.to) return false;
  if (has(f.presetIds) && !f.presetIds.includes(r.presetId)) return false;
  if (has(f.playerCounts) && !f.playerCounts.includes(r.playerCount)) return false;
  if (has(f.startValues) && !f.startValues.includes(r.startValue)) return false;
  if (f.timer === "on" && r.timerMode === "off") return false;
  if (f.timer === "off" && r.timerMode !== "off") return false;
  if (f.winnerOnly && r.outcome !== "win") return false;
  if (has(f.identities)) {
    const ids = new Set(r.players.map((p) => p.identity));
    if (!f.identities.every((id) => ids.has(id))) return false;
  }
  if (has(f.decks)) {
    const keys = new Set(r.players.map(deckKey));
    if (!f.decks.some((k) => keys.has(k))) return false;
  }
  return true;
}

export function applyFilter(records: readonly GameRecord[], f: RecordFilter): GameRecord[] {
  return records.filter((r) => matchesFilter(r, f));
}

export type FilterChipKey =
  | "date"
  | "presetIds"
  | "playerCounts"
  | "identities"
  | "decks"
  | "startValues"
  | "timer"
  | "winnerOnly"
  | "includeDefaultNames";

/** Active filter parts, in display order (the UI turns them into chips). */
export function activeFilterKeys(f: RecordFilter): FilterChipKey[] {
  const out: FilterChipKey[] = [];
  if (f.from !== undefined || f.to !== undefined) out.push("date");
  if (has(f.presetIds)) out.push("presetIds");
  if (has(f.playerCounts)) out.push("playerCounts");
  if (has(f.identities)) out.push("identities");
  if (has(f.decks)) out.push("decks");
  if (has(f.startValues)) out.push("startValues");
  if (f.timer) out.push("timer");
  if (f.winnerOnly) out.push("winnerOnly");
  if (f.includeDefaultNames) out.push("includeDefaultNames");
  return out;
}

/** Remove one chip's part of the filter. */
export function clearFilterKey(f: RecordFilter, key: FilterChipKey): RecordFilter {
  const drop = key === "date" ? ["from", "to"] : [key];
  return Object.fromEntries(Object.entries(f).filter(([k]) => !drop.includes(k))) as RecordFilter;
}

/** Free tier (§17.2): only the date range applies (plus the HIST-033 default-names toggle). */
export function freeTierFilter(f: RecordFilter): RecordFilter {
  const out: RecordFilter = {};
  if (f.from !== undefined) out.from = f.from;
  if (f.to !== undefined) out.to = f.to;
  if (f.includeDefaultNames) out.includeDefaultNames = true;
  return out;
}

/** Distinct values present in the records (filter sheet options). */
export function filterOptions(records: readonly GameRecord[]) {
  const presets = new Map<string, string>();
  const counts = new Set<number>();
  const starts = new Set<number>();
  for (const r of records) {
    presets.set(r.presetId, r.presetName);
    counts.add(r.playerCount);
    starts.add(r.startValue);
  }
  const num = (s: Set<number>) => [...s].sort((a, b) => a - b);
  return {
    presets: [...presets.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    playerCounts: num(counts),
    startValues: num(starts),
  };
}
