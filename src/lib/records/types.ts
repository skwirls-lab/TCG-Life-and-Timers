/**
 * Completed game record (HIST-003). Stored in the Dexie `records` table (id = game id).
 *
 * The top-level D-013 fields (`schemaVersion, presetId, game, startedAt, endedAt, durationMs,
 * seats, log`) are the only ones the sync engine sends to `users/{uid}/games` (D-053; write-once).
 * Everything else is local-only detail used by stats. A record that arrives from another device
 * carries only the sync fields; `hydrateRecord` rebuilds the local view from them.
 */
import type { ArtKind, EliminationCause, GameOptions, TimerConfig, TimerMode } from "@/engine";

export const RECORD_SCHEMA_VERSION = 1;
/** Firestore log cap (LIMITS.gameLogMax). */
export const MAX_LOG_BYTES = 500 * 1024;
/** HIST-007 soft cap: older records are compacted (log dropped). */
export const RECORD_SOFT_CAP = 1000;
/** HIST-030 default idle gap. */
export const DEFAULT_IDLE_GAP_MS = 15 * 60_000;

/** D-013 seat entry (users/{uid}/games seats[]). Strict shape: no extra keys. */
export interface RecordSeat {
  name: string;
  profileId?: string;
  deckId?: string;
  deckName?: string;
  winner: boolean;
  place?: number;
}

export type CauseKind = "life" | "poison" | "commander" | "counter" | "time" | "concede" | "manual";

export interface RecordElimination {
  seatId: string;
  name: string;
  cause: EliminationCause;
  causeKind: CauseKind;
  /** Counter name for threshold causes ("Life", "Poison"). */
  counterName?: string;
  sourceSeatId?: string;
  turn: number;
  round: number;
  at: number;
}

export interface RecordClockStats {
  /** Wall time the seat held a running clock. */
  usedMs: number;
  turns: number;
  timedTurns: number;
  avgTurnMs: number | null;
  timeouts: number;
  /** Total time spent responding (sum of Respond → Pass back). */
  responseMs: number;
  responses: number;
}

export interface RecordPlayer {
  seatId: string;
  /** Display name at the time of the game (editable, HIST-035). */
  name: string;
  /** Stats identity (HIST-033): `p:<profileId>` or `n:<normalized name>`. Rewritten by merges. */
  identity: string;
  profileId?: string;
  deckId?: string;
  deckName?: string;
  commanders: string[];
  color: string;
  art?: { kind: ArtKind; value: string; focal?: { x: number; y: number; zoom: number } };
  /** Index in seat order (0-based). */
  seatIndex: number;
  /** Position in turn order counted from the starting player (= 1). */
  turnPosition?: number;
  winner: boolean;
  place?: number;
  /** Elimination order (1 = first out). */
  eliminatedOrder?: number;
  /** Final values of the seat's counters (`counterId` or `counterId#commanderIndex`). */
  finals: Record<string, number>;
  /** Final value of the primary counter. */
  primary: number;
  /** Total commander damage dealt to opponents. */
  commanderDamageDealt: number;
  clock?: RecordClockStats;
}

export interface CommanderDamageEntry {
  from: string;
  to: string;
  amount: number;
}

export type RecordOutcome = "win" | "draw" | "none";

/** Everything needed to rebuild the game for "Rematch with same setup" (HIST-020). */
export interface RecordConfig {
  layoutId: string;
  options: GameOptions;
  timer: TimerConfig;
  startOverrides: Record<string, number>;
  thresholdOverrides: Record<string, number | null>;
  perSeatStart: Record<string, Record<string, number>>;
  perSeatThreshold: Record<string, Record<string, number | null>>;
  enabledCounters: string[];
}

export interface GameRecord {
  id: string;
  schemaVersion: number;
  // --- D-013 sync fields --------------------------------------------------------------------
  presetId: string;
  /** Game name ("Magic: The Gathering"). */
  game: string;
  startedAt: number;
  endedAt: number;
  /** Active play time (HIST-030). */
  durationMs: number;
  seats: RecordSeat[];
  /** Compressed final game snapshot: gzip → base64 ("H4sI…"), or plain JSON fallback. */
  log?: string;
  // --- local-only ---------------------------------------------------------------------------
  createdAt: number;
  updatedAt: number;
  presetName: string;
  format?: string;
  wallMs: number;
  playerCount: number;
  primaryCounterId: string;
  primaryCounterName: string;
  /** Starting value of the primary counter (seat 1 / per-game override). */
  startValue: number;
  startingSeatId?: string;
  turns: number;
  rounds: number;
  turnTracking: boolean;
  timerMode: TimerMode;
  outcome: RecordOutcome;
  winners: string[];
  eliminations: RecordElimination[];
  players: RecordPlayer[];
  commanderDamage: CommanderDamageEntry[];
  /** Counter changes logged (HIST-031 meaningful activity). */
  changes: number;
  config?: RecordConfig;
  logTruncated?: boolean;
  /** HIST-007 soft cap: the log was dropped. */
  compacted?: boolean;
  /** Edited after the fact (HIST-035). */
  edited?: boolean;
  /** Only sync fields were present (arrived from another device). */
  partial?: boolean;
}

/** Who-won decision (HIST-031). */
export type WinnerDecision =
  | { kind: "auto" }
  | { kind: "winners"; seatIds: string[] }
  | { kind: "draw" }
  | { kind: "none" }
  | { kind: "discard" };
