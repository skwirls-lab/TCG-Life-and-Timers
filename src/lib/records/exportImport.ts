/**
 * HIST-006 export / import.
 *
 * CSV: one row per game-seat. Columns (in order) are `CSV_COLUMNS`:
 *   game_id, started_at, ended_at (ISO 8601 UTC), preset_id, preset_name, game, player_count,
 *   start_value, active_ms (HIST-030 duration), wall_ms, turns, rounds, timer_mode,
 *   outcome (win | draw | none), seat_index (1-based seat order), turn_position (1 = started),
 *   starting_player (1/0), player_name, identity, profile_id, deck_id, deck_name, commanders
 *   (" / "-joined), winner (1/0), place, eliminated_order, elimination_cause, elimination_turn,
 *   primary_final, commander_damage_dealt, time_used_ms, avg_turn_ms, timeouts, response_ms.
 * JSON: `{ format: "tcg-life-records", version: 1, exportedAt, records }` with full records.
 */
import { z } from "zod";
import { hydrateRecord } from "./hydrate";
import type { GameRecord } from "./types";

export const RECORDS_EXPORT_FORMAT = "tcg-life-records";
export const RECORDS_EXPORT_VERSION = 1;

export const CSV_COLUMNS = [
  "game_id",
  "started_at",
  "ended_at",
  "preset_id",
  "preset_name",
  "game",
  "player_count",
  "start_value",
  "active_ms",
  "wall_ms",
  "turns",
  "rounds",
  "timer_mode",
  "outcome",
  "seat_index",
  "turn_position",
  "starting_player",
  "player_name",
  "identity",
  "profile_id",
  "deck_id",
  "deck_name",
  "commanders",
  "winner",
  "place",
  "eliminated_order",
  "elimination_cause",
  "elimination_turn",
  "primary_final",
  "commander_damage_dealt",
  "time_used_ms",
  "avg_turn_ms",
  "timeouts",
  "response_ms",
] as const;

type Cell = string | number | undefined | null;

/** RFC 4180 quoting; text starting with = + - @ is prefixed with ' (spreadsheet formula guard). */
export function csvCell(v: Cell): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  let s = v;
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const iso = (ms: number) => new Date(ms).toISOString();

export function recordsToCsv(records: readonly GameRecord[]): string {
  const lines: string[] = [CSV_COLUMNS.join(",")];
  for (const r of records) {
    for (const p of r.players) {
      const elim = r.eliminations.find((e) => e.seatId === p.seatId);
      const row: Record<(typeof CSV_COLUMNS)[number], Cell> = {
        game_id: r.id,
        started_at: iso(r.startedAt),
        ended_at: iso(r.endedAt),
        preset_id: r.presetId,
        preset_name: r.presetName,
        game: r.game,
        player_count: r.playerCount,
        start_value: r.startValue,
        active_ms: r.durationMs,
        wall_ms: r.wallMs,
        turns: r.turns,
        rounds: r.rounds,
        timer_mode: r.timerMode,
        outcome: r.outcome,
        seat_index: p.seatIndex + 1,
        turn_position: p.turnPosition,
        starting_player:
          r.startingSeatId === undefined ? "" : r.startingSeatId === p.seatId ? 1 : 0,
        player_name: p.name,
        identity: p.identity,
        profile_id: p.profileId,
        deck_id: p.deckId,
        deck_name: p.deckName,
        commanders: p.commanders.join(" / "),
        winner: p.winner ? 1 : 0,
        place: p.place,
        eliminated_order: p.eliminatedOrder,
        elimination_cause: elim?.causeKind,
        elimination_turn: elim?.turn,
        primary_final: p.primary,
        commander_damage_dealt: p.commanderDamageDealt,
        time_used_ms: p.clock?.usedMs,
        avg_turn_ms: p.clock?.avgTurnMs,
        timeouts: p.clock?.timeouts,
        response_ms: p.clock?.responseMs,
      };
      lines.push(CSV_COLUMNS.map((c) => csvCell(row[c])).join(","));
    }
  }
  return `${lines.join("\r\n")}\r\n`;
}

export function recordsToJson(records: readonly GameRecord[], now: number): string {
  return JSON.stringify(
    {
      format: RECORDS_EXPORT_FORMAT,
      version: RECORDS_EXPORT_VERSION,
      exportedAt: new Date(now).toISOString(),
      records,
    },
    null,
    2,
  );
}

const seatSchema = z.object({
  name: z.string().max(200),
  profileId: z.string().max(100).optional(),
  deckId: z.string().max(100).optional(),
  deckName: z.string().max(200).optional(),
  winner: z.boolean(),
  place: z.number().int().min(1).max(8).optional(),
});

const playerSchema = z
  .object({
    seatId: z.string().min(1).max(100),
    name: z.string().max(200),
    identity: z.string().min(2).max(300),
    winner: z.boolean(),
    seatIndex: z.number().int().min(0).max(7),
    commanders: z.array(z.string()).max(4),
    finals: z.record(z.string(), z.number()),
  })
  .loose();

const recordSchema = z
  .object({
    id: z.string().min(1).max(100),
    schemaVersion: z.number().int().min(1).max(1),
    presetId: z.string().min(1).max(100),
    game: z.string().max(200),
    startedAt: z.number().int().min(0),
    endedAt: z.number().int().min(0),
    durationMs: z.number().int().min(0),
    seats: z.array(seatSchema).min(1).max(8),
    log: z
      .string()
      .max(600 * 1024)
      .optional(),
    players: z.array(playerSchema).min(1).max(8).optional(),
  })
  .loose()
  .refine((r) => r.endedAt >= r.startedAt, "endedAt before startedAt");

export type ImportParse =
  | { ok: true; records: GameRecord[]; invalid: number }
  | { ok: false; error: "json" | "format" | "empty" };

/** Parse an export file. Invalid entries are counted and skipped. */
export function parseRecordsJson(text: string): ImportParse {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: "json" };
  }
  let list: unknown;
  if (Array.isArray(data)) list = data;
  else if (
    typeof data === "object" &&
    data !== null &&
    (data as { format?: unknown }).format === RECORDS_EXPORT_FORMAT
  ) {
    list = (data as { records?: unknown }).records;
  }
  if (!Array.isArray(list)) return { ok: false, error: "format" };
  const records: GameRecord[] = [];
  const seen = new Set<string>();
  let invalid = 0;
  for (const item of list) {
    const parsed = recordSchema.safeParse(item);
    if (!parsed.success || seen.has(parsed.data.id)) {
      invalid++;
      continue;
    }
    seen.add(parsed.data.id);
    records.push(hydrateRecord(parsed.data as Record<string, unknown>));
  }
  if (records.length === 0 && invalid === 0) return { ok: false, error: "empty" };
  return { ok: true, records, invalid };
}

export function exportFileName(kind: "csv" | "json", now: number): string {
  const d = new Date(now).toISOString().slice(0, 10);
  return `tcg-life-games-${d}.${kind}`;
}
