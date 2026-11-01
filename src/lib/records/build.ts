/**
 * Pure game → record builder (T6.1: HIST-003, HIST-030, HIST-032).
 * Time always comes from the caller (`now`); nothing here reads the clock.
 */
import {
  counterDef,
  parseCounterKey,
  primaryCounter,
  seatCounters,
  startValue,
  timeUsed,
  turnStats,
  type EliminationCause,
  type Game,
} from "@/engine";
import { activeTime } from "./activity";
import { encodeLog, type EncodeOptions } from "./compress";
import { identityOf } from "./identity";
import {
  RECORD_SCHEMA_VERSION,
  type CauseKind,
  type CommanderDamageEntry,
  type GameRecord,
  type RecordClockStats,
  type RecordElimination,
  type RecordOutcome,
  type RecordPlayer,
  type RecordSeat,
  type WinnerDecision,
} from "./types";

const SEAT_NAME_MAX = 40;
const DECK_NAME_MAX = 60;
const GAME_NAME_MAX = 60;

export interface BuildOptions {
  /** End time for unfinished games (reset / new game) and running clocks. */
  now: number;
  /** HIST-030 idle gap (default: the game's option, else 15 min). */
  idleGapMs?: number;
  decision?: WinnerDecision;
}

// Active time (HIST-030) and the trivial-game rule (HIST-032) live in ./activity (light enough
// for the board bundle); re-exported here for existing imports.
export { activeTime, pauseIntervals, shouldDiscard } from "./activity";

// ---------------------------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------------------------

export function causeKind(game: Game, cause: EliminationCause): CauseKind {
  if (cause.kind !== "threshold") return cause.kind;
  const def = counterDef(game, cause.counterId);
  switch (def?.category) {
    case "life":
      return "life";
    case "poison":
      return "poison";
    case "commander":
      return "commander";
    default:
      return "counter";
  }
}

function eliminations(game: Game): RecordElimination[] {
  const list = game.result?.eliminated ?? game.eliminations;
  return list.map((e) => {
    const out: RecordElimination = {
      seatId: e.seatId,
      name: e.name,
      cause: e.cause,
      causeKind: causeKind(game, e.cause),
      turn: e.turn,
      round: e.round,
      at: e.at,
    };
    if (e.cause.kind === "threshold") {
      const def = counterDef(game, e.cause.counterId);
      if (def) out.counterName = def.name;
      if (e.cause.sourceSeatId !== undefined) out.sourceSeatId = e.cause.sourceSeatId;
    }
    return out;
  });
}

function commanderDamage(game: Game): CommanderDamageEntry[] {
  const sums = new Map<string, number>();
  for (const [key, value] of Object.entries(game.values)) {
    if (!value) continue;
    let parsed;
    try {
      parsed = parseCounterKey(key);
    } catch {
      continue;
    }
    if (!parsed.seatId || !parsed.sourceSeatId) continue;
    const def = counterDef(game, parsed.counterId);
    if (!def || def.scope !== "playerVsOpponent" || def.category !== "commander") continue;
    const k = `${parsed.sourceSeatId}>${parsed.seatId}`;
    sums.set(k, (sums.get(k) ?? 0) + value);
  }
  return [...sums.entries()].map(([k, amount]) => {
    const [from, to] = k.split(">") as [string, string];
    return { from, to, amount };
  });
}

/** Turn-order position (starting player = 1); undefined until a first player is chosen. */
function turnPositions(game: Game): Map<string, number> {
  const out = new Map<string, number>();
  const order = game.turn.order;
  const first = order.indexOf(game.turn.firstSeat);
  if (first < 0 || game.turn.awaitingFirstPlayer) return out;
  order.forEach((id, i) => out.set(id, ((i - first + order.length) % order.length) + 1));
  return out;
}

/** Average turn length from turn events (timer: timeUsedMs; otherwise wall time between turns). */
function turnDurations(game: Game): Map<string, number[]> {
  const out = new Map<string, number[]>();
  let prev = game.startedAt ?? null;
  for (const e of game.log) {
    if (e.kind === "start") prev = e.at;
    if (e.kind !== "turn") continue;
    const from = e.meta?.from;
    if (typeof from === "string" && prev !== null && e.at >= prev) {
      const list = out.get(from) ?? [];
      list.push(e.at - prev);
      out.set(from, list);
    }
    prev = e.at;
  }
  return out;
}

function clockStats(game: Game, seatId: string, end: number, walls: Map<string, number[]>) {
  const timerOn = game.timer.mode !== "off";
  if (!timerOn && !game.options.turnTracking) return undefined;
  const ts = turnStats(game, seatId);
  let avg = ts.averageMs;
  let timed = ts.timedTurns;
  if (avg === null) {
    const list = walls.get(seatId) ?? [];
    timed = list.length;
    avg = list.length ? Math.round(list.reduce((a, b) => a + b, 0) / list.length) : null;
  }
  let timeouts = 0;
  let responseMs = 0;
  let responses = 0;
  for (const e of game.log) {
    if (e.kind !== "timer" || e.seatId !== seatId) continue;
    if (e.meta?.action === "timeout" && e.meta.phase !== "graceEnd") timeouts++;
    if (e.meta?.action === "respond") responses++;
    if (e.meta?.action === "passBack" && typeof e.meta.durationMs === "number") {
      responseMs += e.meta.durationMs;
    }
  }
  const out: RecordClockStats = {
    usedMs: timerOn ? Math.round(timeUsed(game, seatId, end)) : 0,
    turns: ts.turns,
    timedTurns: timed,
    avgTurnMs: avg,
    timeouts,
    responseMs,
    responses,
  };
  return out;
}

export function resolveOutcome(
  game: Game,
  decision: WinnerDecision = { kind: "auto" },
): { winners: string[]; outcome: RecordOutcome } {
  const seatIds = new Set(game.seats.map((s) => s.id));
  switch (decision.kind) {
    case "winners": {
      const winners = decision.seatIds.filter((id) => seatIds.has(id));
      return { winners, outcome: winners.length ? "win" : "none" };
    }
    case "draw":
      return { winners: [], outcome: "draw" };
    case "none":
    case "discard":
      return { winners: [], outcome: "none" };
    default: {
      const winners = (game.result?.winners ?? []).filter((id) => seatIds.has(id));
      if (winners.length) return { winners, outcome: "win" };
      return { winners: [], outcome: game.status === "ended" && game.result ? "draw" : "none" };
    }
  }
}

/** Places: winners 1; eliminated seats from the bottom (first out = last); draws share 1. */
export function assignPlaces(players: RecordPlayer[], outcome: RecordOutcome): RecordPlayer[] {
  const n = players.length;
  const winners = players.filter((p) => p.winner).length;
  return players.map((p) => {
    const { place: _old, ...rest } = p;
    let place: number | undefined;
    if (p.winner) place = 1;
    else if (p.eliminatedOrder !== undefined) place = Math.max(1, n - p.eliminatedOrder + 1);
    else if (winners > 0) place = winners + 1;
    else if (outcome === "draw") place = 1;
    return place !== undefined ? { ...rest, place } : rest;
  });
}

/** The D-013 seats array derived from the players. */
export function syncSeats(players: readonly RecordPlayer[]): RecordSeat[] {
  return players.map((p) => {
    const s: RecordSeat = { name: p.name.slice(0, SEAT_NAME_MAX), winner: p.winner };
    if (p.profileId) s.profileId = p.profileId;
    if (p.deckId) s.deckId = p.deckId;
    if (p.deckName) s.deckName = p.deckName.slice(0, DECK_NAME_MAX);
    if (p.place !== undefined) s.place = p.place;
    return s;
  });
}

// ---------------------------------------------------------------------------------------------
// buildRecord
// ---------------------------------------------------------------------------------------------

/** Build the record (without the compressed log; see `createRecord`). */
export function buildRecord(game: Game, opts: BuildOptions): GameRecord {
  const startedAt = game.startedAt ?? game.createdAt;
  const endedAt = Math.max(startedAt, game.endedAt ?? opts.now);
  const primary = primaryCounter(game.preset);
  const { winners, outcome } = resolveOutcome(game, opts.decision);
  const winnerSet = new Set(winners);
  const elims = eliminations(game);
  const elimOrder = new Map(elims.map((e, i) => [e.seatId, i + 1]));
  const positions = turnPositions(game);
  const walls = turnDurations(game);
  const cmd = commanderDamage(game);

  let players: RecordPlayer[] = game.seats.map((seat, seatIndex) => {
    const finals: Record<string, number> = {};
    for (const v of seatCounters(game, seat.id)) {
      finals[v.sourceIndex !== undefined ? `${v.def.id}#${v.sourceIndex}` : v.def.id] = v.value;
    }
    const p: RecordPlayer = {
      seatId: seat.id,
      name: seat.name,
      identity: identityOf(seat),
      commanders: seat.commanders.filter(Boolean),
      color: seat.color,
      seatIndex,
      winner: winnerSet.has(seat.id),
      finals,
      primary: finals[primary.id] ?? 0,
      commanderDamageDealt: cmd
        .filter((c) => c.from === seat.id && c.to !== seat.id)
        .reduce((a, c) => a + c.amount, 0),
    };
    if (seat.profileId) p.profileId = seat.profileId;
    if (seat.deckId) p.deckId = seat.deckId;
    if (seat.deckName) p.deckName = seat.deckName;
    if (seat.art) {
      p.art = { kind: seat.art.kind, value: seat.art.value };
      if (seat.art.focal) p.art.focal = seat.art.focal;
    }
    const pos = positions.get(seat.id);
    if (pos !== undefined) p.turnPosition = pos;
    const order = elimOrder.get(seat.id);
    if (order !== undefined && !p.winner) p.eliminatedOrder = order;
    const clock = clockStats(game, seat.id, endedAt, walls);
    if (clock) p.clock = clock;
    return p;
  });
  players = assignPlaces(players, outcome);

  const first = positions.size ? game.turn.firstSeat : undefined;
  const record: GameRecord = {
    id: game.id,
    schemaVersion: RECORD_SCHEMA_VERSION,
    presetId: game.preset.id,
    game: (game.preset.game || game.preset.name).slice(0, GAME_NAME_MAX),
    startedAt,
    endedAt,
    durationMs: Math.round(activeTime(game, endedAt, opts.idleGapMs)),
    seats: syncSeats(players),
    createdAt: opts.now,
    updatedAt: opts.now,
    presetName: game.preset.name,
    wallMs: endedAt - startedAt,
    playerCount: game.seats.length,
    primaryCounterId: primary.id,
    primaryCounterName: primary.name,
    startValue: startValue(game, primary, game.seats[0]?.id),
    turns: game.turn.turnNumber,
    rounds: game.turn.round,
    turnTracking: game.options.turnTracking,
    timerMode: game.timer.mode,
    outcome,
    winners,
    eliminations: elims,
    players,
    commanderDamage: cmd,
    changes: game.activity.changes,
    config: {
      layoutId: game.layoutId,
      options: game.options,
      timer: game.timer.config,
      startOverrides: game.startOverrides,
      thresholdOverrides: game.thresholdOverrides,
      perSeatStart: game.perSeatStart,
      perSeatThreshold: game.perSeatThreshold,
      enabledCounters: game.enabledCounters,
    },
  };
  if (game.preset.format) record.format = game.preset.format;
  if (first !== undefined) record.startingSeatId = first;
  return record;
}

/** buildRecord + the compressed snapshot log (HIST-003). */
export async function createRecord(
  game: Game,
  opts: BuildOptions & { encode?: EncodeOptions },
): Promise<GameRecord> {
  const record = buildRecord(game, opts);
  const { log, truncated } = await encodeLog(game, opts.encode);
  if (log !== undefined) record.log = log;
  if (truncated) record.logTruncated = true;
  return record;
}
