/**
 * Stored row → GameRecord. Rows written by this device carry every field; rows that arrived from
 * another device via sync carry only the D-013 fields, so the local view is rebuilt from `seats`.
 */
import type { StoredRecord } from "@/lib/db/db";
import { identityOf } from "./identity";
import {
  RECORD_SCHEMA_VERSION,
  type GameRecord,
  type RecordOutcome,
  type RecordPlayer,
  type RecordSeat,
} from "./types";

const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const str = (v: unknown, d = "") => (typeof v === "string" ? v : d);

function seatsOf(row: Record<string, unknown>): RecordSeat[] {
  const raw = Array.isArray(row.seats) ? (row.seats as unknown[]) : [];
  return raw
    .filter((s): s is Record<string, unknown> => typeof s === "object" && s !== null)
    .map((s) => {
      const out: RecordSeat = { name: str(s.name), winner: s.winner === true };
      if (typeof s.profileId === "string") out.profileId = s.profileId;
      if (typeof s.deckId === "string") out.deckId = s.deckId;
      if (typeof s.deckName === "string") out.deckName = s.deckName;
      if (typeof s.place === "number") out.place = s.place;
      return out;
    });
}

function playersFromSeats(seats: RecordSeat[]): RecordPlayer[] {
  return seats.map((s, i) => {
    const p: RecordPlayer = {
      seatId: `s${i}`,
      name: s.name,
      identity: identityOf(s),
      commanders: [],
      color: "#60a5fa",
      seatIndex: i,
      winner: s.winner,
      finals: {},
      primary: 0,
      commanderDamageDealt: 0,
    };
    if (s.profileId) p.profileId = s.profileId;
    if (s.deckId) p.deckId = s.deckId;
    if (s.deckName) p.deckName = s.deckName;
    if (s.place !== undefined) p.place = s.place;
    return p;
  });
}

/** True when the value looks like a full local record (has the players array). */
function isFull(row: Record<string, unknown>): boolean {
  return Array.isArray(row.players) && typeof row.presetName === "string";
}

export function hydrateRecord(stored: StoredRecord | Record<string, unknown>): GameRecord {
  const row = stored as Record<string, unknown>;
  if (isFull(row)) {
    const r = row as unknown as GameRecord;
    return {
      ...r,
      schemaVersion: num(r.schemaVersion, RECORD_SCHEMA_VERSION),
      seats: seatsOf(row),
      eliminations: Array.isArray(r.eliminations) ? r.eliminations : [],
      commanderDamage: Array.isArray(r.commanderDamage) ? r.commanderDamage : [],
      winners: Array.isArray(r.winners) ? r.winners : [],
    };
  }
  const seats = seatsOf(row);
  const players = playersFromSeats(seats);
  const winners = players.filter((p) => p.winner).map((p) => p.seatId);
  const startedAt = num(row.startedAt);
  const endedAt = Math.max(startedAt, num(row.endedAt));
  const outcome: RecordOutcome = winners.length ? "win" : "none";
  const record: GameRecord = {
    id: str(row.id),
    schemaVersion: num(row.schemaVersion, RECORD_SCHEMA_VERSION),
    presetId: str(row.presetId),
    game: str(row.game),
    startedAt,
    endedAt,
    durationMs: num(row.durationMs),
    seats,
    createdAt: num(row.createdAt, endedAt),
    updatedAt: num(row.updatedAt, endedAt),
    presetName: str(row.game, str(row.presetId)),
    wallMs: endedAt - startedAt,
    playerCount: seats.length,
    primaryCounterId: "",
    primaryCounterName: "",
    startValue: 0,
    turns: 0,
    rounds: 0,
    turnTracking: false,
    timerMode: "off",
    outcome,
    winners,
    eliminations: [],
    players,
    commanderDamage: [],
    changes: 0,
    partial: true,
  };
  if (typeof row.log === "string") record.log = row.log;
  return record;
}
