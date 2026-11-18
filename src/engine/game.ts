/** Game factory (createGame), RESET_GAME (GAME-010/011) and mid-game seat add/remove (LAY-009). */
import { enabledDefs, initialValues, seatKeys, startValue } from "./counters";
import { keyInvolvesSeat } from "./keys";
import { appendEvent } from "./log";
import {
  GAME_SCHEMA_VERSION,
  MAX_SEATS,
  MIN_SEATS,
  SEAT_COLORS,
  defaultGameOptions,
} from "./options";
import { randomId, type Rng } from "./rng";
import { initialTurn, nextSeat, pickFirstSeat, turnOrderFor, type FirstPick } from "./turn";
import { initialClock, initialTimerState, pruneSeatExtra } from "./timer/types";
import type {
  CounterId,
  FirstPlayerRule,
  Game,
  NewGameConfig,
  PreviousResult,
  Seat,
  SeatId,
  SeatInput,
} from "./types";

type TokenMap = Record<CounterId, SeatId | null>;

/** Build a seat from input; `index` is the 0-based seat position used for defaults. */
export function makeSeat(
  input: SeatInput | undefined,
  index: number,
  usedIds: ReadonlySet<SeatId>,
  usedColors: ReadonlySet<string> = new Set(),
): Seat {
  let id = input?.id;
  if (id === undefined || id === "" || usedIds.has(id)) {
    let n = index + 1;
    while (usedIds.has(`s${n}`)) n++;
    id = `s${n}`;
  }
  const color =
    input?.color ??
    SEAT_COLORS.find((c) => !usedColors.has(c)) ??
    SEAT_COLORS[index % SEAT_COLORS.length]!;
  const seat: Seat = {
    id,
    name: input?.name?.trim() ? input.name.trim() : `Player ${index + 1}`,
    commanders: input?.commanders ? [...input.commanders] : [],
    color,
    eliminated: false,
    contrast: input?.contrast ?? false,
  };
  if (input?.profileId !== undefined) seat.profileId = input.profileId;
  if (input?.deckId !== undefined) seat.deckId = input.deckId;
  if (input?.deckName !== undefined) seat.deckName = input.deckName;
  if (input?.art !== undefined) seat.art = input.art;
  if (input?.teamId !== undefined) seat.teamId = input.teamId;
  if (input?.rotationOverride !== undefined) seat.rotationOverride = input.rotationOverride;
  return seat;
}

function initialTokens(game: Pick<Game, "preset">): TokenMap {
  const tokens: TokenMap = {};
  for (const def of game.preset.counters) if (def.scope === "token") tokens[def.id] = null;
  return tokens;
}

function firstPick(
  seats: Seat[],
  rule: FirstPlayerRule,
  rng: Rng,
  previous: PreviousResult | undefined,
  explicit: SeatId | undefined,
): FirstPick {
  if (explicit !== undefined && seats.some((s) => s.id === explicit)) {
    return { firstSeat: explicit, awaitingFirstPlayer: false };
  }
  return pickFirstSeat(seats, rule, rng, previous);
}

function firstPlayerEvent(game: Game, now: number): Game {
  return appendEvent(
    game,
    {
      kind: "firstPlayer",
      seatId: game.turn.firstSeat,
      meta: { rule: game.options.firstPlayerRule, awaiting: game.turn.awaitingFirstPlayer },
    },
    now,
  )[0];
}

/**
 * Create a game (status 'ready') from a preset, player count, seat inputs and overrides.
 * Picks the first player with `rng` per the first-player rule (GAME-011/012).
 */
export function createGame(config: NewGameConfig, rng: Rng, now: number): Game {
  const { preset } = config;
  const players = config.players ?? config.seats?.length ?? preset.defaultPlayers;
  if (!Number.isInteger(players) || players < MIN_SEATS || players > MAX_SEATS) {
    throw new RangeError(`createGame: players must be ${MIN_SEATS}–${MAX_SEATS}, got ${players}`);
  }
  const seats: Seat[] = [];
  const used = new Set<SeatId>();
  const colors = new Set<string>();
  for (let i = 0; i < players; i++) {
    const seat = makeSeat(config.seats?.[i], i, used, colors);
    used.add(seat.id);
    colors.add(seat.color);
    seats.push(seat);
  }
  const timerConfig = { ...preset.defaults.timer, ...config.timer };
  const options = defaultGameOptions({
    turnTracking: timerConfig.mode !== "off",
    firstPlayerRule: preset.defaults.firstPlayerRule,
    ...preset.defaults.options,
    ...config.options,
  });
  const ids = new Set(preset.counters.map((c) => c.id));
  const primary = preset.counters.find((c) => c.isPrimary);
  const enabled: CounterId[] = (
    config.enabledCounters ?? preset.counters.filter((c) => c.enabledByDefault).map((c) => c.id)
  ).filter((id) => ids.has(id));
  if (primary && !enabled.includes(primary.id)) enabled.unshift(primary.id);

  const id = config.id ?? randomId(rng);
  const fp = firstPick(
    seats,
    options.firstPlayerRule,
    rng,
    config.previousResult,
    config.firstSeatId,
  );
  const base: Game = {
    schemaVersion: GAME_SCHEMA_VERSION,
    id,
    createdAt: now,
    preset,
    seats,
    layoutId: config.layoutId ?? preset.defaults.layoutByPlayers?.[String(players)] ?? "default",
    options,
    startOverrides: { ...config.startOverrides },
    thresholdOverrides: { ...config.thresholdOverrides },
    perSeatStart: { ...config.perSeatStart },
    perSeatThreshold: { ...config.perSeatThreshold },
    enabledCounters: enabled,
    values: {},
    tokens: initialTokens({ preset }),
    turn: initialTurn(turnOrderFor(seats, options.turnOrder), fp),
    timer: initialTimerState(
      timerConfig,
      seats.map((s) => s.id),
    ),
    status: "ready",
    eliminations: [],
    pendingPrompts: [],
    suppressedTriggers: [],
    log: [],
    seq: 0,
    activity: { changes: 0, lastAt: null, activeMs: 0 },
    ...(config.previousResult ? { previous: config.previousResult } : {}),
  };
  return firstPlayerEvent({ ...base, values: initialValues(base) }, now);
}

/** Summary of a game's outcome for the next game's first-player rule. */
export function previousResultOf(game: Game): PreviousResult {
  const first = game.eliminations[0]?.seatId;
  return {
    winners: game.result?.winners ?? [],
    ...(first !== undefined ? { firstEliminated: first } : {}),
  };
}

/**
 * GAME-010 reset: keeps names, art, seat order, layout, options, overrides and enabled counters;
 * resets values, tokens, eliminations, turn and timer state; starts a fresh log and a new game id;
 * picks a new first player with `rng` (GAME-011).
 */
export function resetGame(game: Game, rng: Rng, now: number): Game {
  const previous = previousResultOf(game);
  const seats = game.seats.map((s) => {
    const { eliminatedCause: _c, ...rest } = s;
    return { ...rest, eliminated: false };
  });
  const fp = pickFirstSeat(seats, game.options.firstPlayerRule, rng, previous);
  const { startedAt: _s, endedAt: _e, result: _r, ...rest } = game;
  let g: Game = {
    ...rest,
    id: randomId(rng),
    createdAt: now,
    seats,
    tokens: initialTokens(game),
    turn: initialTurn(turnOrderFor(seats, game.options.turnOrder), fp),
    timer: initialTimerState(
      game.timer.config,
      seats.map((s) => s.id),
    ),
    status: "ready",
    eliminations: [],
    pendingPrompts: [],
    suppressedTriggers: [],
    log: [],
    activity: { changes: 0, lastAt: null, activeMs: 0 },
    previous,
  };
  g = { ...g, values: initialValues(g) };
  [g] = appendEvent(
    g,
    { kind: "reset", meta: { previousWinners: previous.winners.join(",") } },
    now,
  );
  return firstPlayerEvent(g, now);
}

/** LAY-009: add a seat mid-game with preset start values, inserted at `index` in seat/turn order. */
export function addSeat(
  game: Game,
  input: SeatInput | undefined,
  index: number | undefined,
  now: number,
): Game {
  if (game.seats.length >= MAX_SEATS) return game;
  const used = new Set(game.seats.map((s) => s.id));
  const colors = new Set(game.seats.map((s) => s.color));
  const seat = makeSeat(input, game.seats.length, used, colors);
  const at = Math.max(0, Math.min(index ?? game.seats.length, game.seats.length));
  const seats = [...game.seats.slice(0, at), seat, ...game.seats.slice(at)];
  let g: Game = { ...game, seats };
  const values = { ...g.values };
  for (const def of enabledDefs(g)) {
    if (def.scope === "player" || def.scope === "playerVsOpponent") {
      for (const target of seats) {
        for (const k of seatKeys(g, def, target)) {
          if (target.id === seat.id || keyInvolvesSeat(k, seat.id)) {
            values[k] = startValue(g, def, target.id);
          }
        }
      }
    }
  }
  g = {
    ...g,
    values,
    turn: { ...g.turn, order: turnOrderFor(seats, g.options.turnOrder) },
    timer: {
      ...g.timer,
      clocks: { ...g.timer.clocks, [seat.id]: initialClock(g.timer.config, seat.id) },
    },
  };
  return appendEvent(
    g,
    { kind: "seatAdd", seatId: seat.id, meta: { name: seat.name, index: at } },
    now,
  )[0];
}

function omitKey<T>(rec: Record<string, T>, key: string): Record<string, T> {
  if (!(key in rec)) return rec;
  const { [key]: _omit, ...rest } = rec;
  return rest;
}

/** LAY-009: remove a seat mid-game; recorded as a concession in history. */
export function removeSeat(game: Game, seatId: SeatId, now: number): Game {
  const seat = game.seats.find((s) => s.id === seatId);
  if (!seat || game.seats.length <= MIN_SEATS) return game;
  const seats = game.seats.filter((s) => s.id !== seatId);
  const order = turnOrderFor(seats, game.options.turnOrder);
  const successor = nextSeat(game, seatId) ?? order[0]!;
  const fallback = successor === seatId ? order[0]! : successor;
  const values: Record<string, number> = {};
  for (const [k, v] of Object.entries(game.values)) if (!keyInvolvesSeat(k, seatId)) values[k] = v;
  const tokens: TokenMap = {};
  for (const [k, v] of Object.entries(game.tokens)) tokens[k] = v === seatId ? null : v;
  const eliminations = seat.eliminated
    ? game.eliminations.map((e) => (e.seatId === seatId ? { ...e, removed: true } : e))
    : [
        ...game.eliminations,
        {
          seatId,
          name: seat.name,
          cause: { kind: "concede" as const },
          turn: game.turn.turnNumber,
          round: game.turn.round,
          at: now,
          removed: true,
        },
      ];
  const turnsTaken = omitKey(game.turn.turnsTaken, seatId);
  const g: Game = {
    ...game,
    seats,
    values,
    tokens,
    eliminations,
    perSeatStart: omitKey(game.perSeatStart, seatId),
    perSeatThreshold: omitKey(game.perSeatThreshold, seatId),
    pendingPrompts: game.pendingPrompts.filter((p) => p.seatId !== seatId),
    suppressedTriggers: game.suppressedTriggers.filter((t) => !t.includes(`|${seatId}|`)),
    turn: {
      ...game.turn,
      order,
      turnsTaken,
      activeSeat: game.turn.activeSeat === seatId ? fallback : game.turn.activeSeat,
      firstSeat: game.turn.firstSeat === seatId ? fallback : game.turn.firstSeat,
    },
    timer: {
      ...game.timer,
      // TMR-060: a later seat may reuse this id; it must not inherit the extra time.
      config: pruneSeatExtra(
        game.timer.config,
        seats.map((s) => s.id),
      ),
      clocks: omitKey(game.timer.clocks, seatId),
      responseStack: game.timer.responseStack.filter((s) => s !== seatId),
      holder: game.timer.holder === seatId ? null : game.timer.holder,
    },
  };
  return appendEvent(g, { kind: "seatRemove", seatId, meta: { name: seat.name } }, now)[0];
}
