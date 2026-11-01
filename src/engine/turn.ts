/** Turn tracking (TURN-001, TMR-003) and first-player selection (GAME-011, GAME-012). */
import { counterKey } from "./keys";
import { appendEvent } from "./log";
import { enabledDefs, seatKeys, startValue } from "./counters";
import { pick, type Rng } from "./rng";
import type {
  CounterKey,
  FirstPlayerRule,
  Game,
  PreviousResult,
  Seat,
  SeatId,
  TurnOrder,
  TurnState,
} from "./types";

/** Traversal order: seat order (clockwise) or its reverse. */
export function turnOrderFor(seats: readonly Pick<Seat, "id">[], dir: TurnOrder): SeatId[] {
  const ids = seats.map((s) => s.id);
  return dir === "counterclockwise" ? ids.reverse() : ids;
}

/**
 * Next non-eliminated seat after `from` in turn order (wrapping). Returns `from` when it is the
 * only living seat, and null when nobody is alive. Never returns an eliminated seat.
 */
export function nextSeat(game: Pick<Game, "seats" | "turn">, from: SeatId): SeatId | null {
  const order = game.turn.order;
  const alive = new Set(game.seats.filter((s) => !s.eliminated).map((s) => s.id));
  const n = order.length;
  const start = order.indexOf(from);
  for (let step = 1; step <= n; step++) {
    const id = order[(((start + step) % n) + n) % n]!;
    if (alive.has(id)) return id;
  }
  return null;
}

/** Position of a seat relative to the first seat in turn order. */
function relPos(order: readonly SeatId[], first: SeatId, id: SeatId): number {
  const n = order.length;
  const fi = Math.max(0, order.indexOf(first));
  return (order.indexOf(id) - fi + n) % n;
}

/** Keys to reset on a pass (CUS-008): global counters always, player counters for `endedSeat`. */
function turnResetEntries(game: Game, endedSeat: SeatId): [CounterKey, number][] {
  const out: [CounterKey, number][] = [];
  const seat = game.seats.find((s) => s.id === endedSeat);
  for (const def of enabledDefs(game)) {
    if (!def.resetOnTurnPass) continue;
    if (def.scope === "global") out.push([counterKey(def.id), startValue(game, def)]);
    else if (def.scope === "player" && seat) {
      for (const k of seatKeys(game, def, seat)) out.push([k, startValue(game, def, seat.id)]);
    }
  }
  return out;
}

/**
 * Advance the turn to the next living seat: turnNumber++, round++ when wrapping past the first
 * seat, per-turn counters reset (when `resetFlags`). Logs a 'turn' event.
 */
export function advanceTurn(game: Game, now: number, resetFlags: boolean): Game {
  const cur = game.turn.activeSeat;
  const nxt = nextSeat(game, cur);
  if (nxt === null) return game;
  const { order, firstSeat } = game.turn;
  const wrapped = relPos(order, firstSeat, nxt) <= relPos(order, firstSeat, cur);
  let g: Game = game;
  if (resetFlags && game.options.resetPerTurnFlags) {
    const entries = turnResetEntries(game, cur);
    if (entries.length) {
      const values = { ...g.values };
      for (const [k, v] of entries) values[k] = v;
      g = { ...g, values };
    }
  }
  const turn: TurnState = {
    ...g.turn,
    activeSeat: nxt,
    turnNumber: g.turn.turnNumber + 1,
    round: g.turn.round + (wrapped ? 1 : 0),
    turnStartedAt: now,
    turnsTaken: { ...g.turn.turnsTaken, [nxt]: (g.turn.turnsTaken[nxt] ?? 0) + 1 },
  };
  g = { ...g, turn };
  [g] = appendEvent(
    g,
    {
      kind: "turn",
      seatId: nxt,
      meta: { from: cur, turnNumber: turn.turnNumber, round: turn.round },
    },
    now,
  );
  return g;
}

export interface FirstPick {
  firstSeat: SeatId;
  awaitingFirstPlayer: boolean;
  rolloff?: Record<SeatId, number[]>;
}

/** GAME-011/012: choose the first seat. 'loser'/'winner' fall back to random without a previous result. */
export function pickFirstSeat(
  seats: readonly Pick<Seat, "id">[],
  rule: FirstPlayerRule,
  rng: Rng,
  previous?: PreviousResult,
): FirstPick {
  const ids = seats.map((s) => s.id);
  if (ids.length === 0) throw new RangeError("pickFirstSeat: no seats");
  const random = (): FirstPick => ({ firstSeat: pick(rng, ids), awaitingFirstPlayer: false });
  switch (rule) {
    case "choose":
      return { firstSeat: ids[0]!, awaitingFirstPlayer: true };
    case "loser": {
      const s = previous?.firstEliminated;
      return s !== undefined && ids.includes(s)
        ? { firstSeat: s, awaitingFirstPlayer: false }
        : random();
    }
    case "winner": {
      const s = previous?.winners.find((w) => ids.includes(w));
      return s !== undefined ? { firstSeat: s, awaitingFirstPlayer: false } : random();
    }
    case "rolloff": {
      const rolls: Record<SeatId, number[]> = {};
      let contenders = ids;
      while (contenders.length > 1) {
        let best = 0;
        for (const id of contenders) {
          const r = rng.int(20) + 1;
          (rolls[id] ??= []).push(r);
          best = Math.max(best, r);
        }
        contenders = contenders.filter((id) => rolls[id]!.at(-1) === best);
      }
      return { firstSeat: contenders[0]!, awaitingFirstPlayer: false, rolloff: rolls };
    }
    default:
      return random();
  }
}

/** Fresh turn state for a first seat. */
export function initialTurn(order: SeatId[], fp: FirstPick): TurnState {
  return {
    order,
    firstSeat: fp.firstSeat,
    activeSeat: fp.firstSeat,
    turnNumber: 1,
    round: 1,
    turnStartedAt: null,
    turnsTaken: {},
    awaitingFirstPlayer: fp.awaitingFirstPlayer,
    ...(fp.rolloff ? { rolloff: fp.rolloff } : {}),
  };
}
