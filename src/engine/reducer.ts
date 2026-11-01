/**
 * Main game reducer (ARCH-002, ARCH-004): `reduce(game, action, ctx) → game`, pure and immutable.
 *
 * Pipeline per action: core reduction → `reduceTimer` (timer actions + hook actions) →
 * threshold evaluation / game-end detection (CTR-003). History actions (UNDO/REDO/UNDO_TO) are
 * handled by `reduceSession` in undo.ts; `reduce` returns the game unchanged for them.
 * Invalid actions (unknown seat/counter, disabled counter, out-of-range index) are no-ops that
 * return the same object.
 */
import {
  applyNumberChange,
  enabledDef,
  getValue,
  normalizeAddress,
  type ChangeResult,
  type CounterAddress,
} from "./counters";
import { addSeat, removeSeat, resetGame } from "./game";
import { counterKey } from "./keys";
import { appendEvent } from "./log";
import type { Rng } from "./rng";
import { eliminateSeat, endGame, evaluate, reviveSeat, seatLoseTriggerIds } from "./thresholds";
import { isTimerAction, reduceTimer, syncTimer, TIMER_HOOK_ACTIONS } from "./timer/reducer";
import { advanceTurn, turnOrderFor } from "./turn";
import type {
  CounterDefinition,
  CounterId,
  EventMetaValue,
  Game,
  GameAction,
  Seat,
  SeatId,
} from "./types";

export interface ReduceContext {
  rng: Rng;
  /** INP-006 batching (default true). reduceSession disables it right after UNDO/REDO. */
  allowMerge?: boolean;
}

export interface ReduceResult {
  game: Game;
  /** The change merged into the previous log event (no new undo step). */
  merged: boolean;
}

const unchanged = (game: Game): ReduceResult => ({ game, merged: false });

function actionNow(game: Game, action: GameAction): number {
  if ("now" in action && typeof action.now === "number") return action.now;
  return game.activity.lastAt ?? game.createdAt;
}

function seatOf(game: Game, id: SeatId | undefined): Seat | undefined {
  return id === undefined ? undefined : game.seats.find((s) => s.id === id);
}

function patchSeat(game: Game, seatId: SeatId, patch: (s: Seat) => Seat): Game {
  if (!seatOf(game, seatId)) return game;
  return { ...game, seats: game.seats.map((s) => (s.id === seatId ? patch(s) : s)) };
}

function numberDef(game: Game, id: CounterId | undefined): CounterDefinition | undefined {
  if (id === undefined) return undefined;
  const def = enabledDef(game, id);
  return def && def.kind === "number" ? def : undefined;
}

function addOrSet(
  game: Game,
  def: CounterDefinition | undefined,
  a: Omit<CounterAddress, "counterId">,
  compute: (current: number) => number,
  now: number,
  allowMerge: boolean,
): ChangeResult {
  if (!def) return unchanged(game);
  const addr = normalizeAddress(game, def, a);
  if (!addr) return unchanged(game);
  const cur = getValue(
    game,
    counterKey(addr.counterId, addr.seatId, addr.sourceSeatId, addr.sourceIndex),
  );
  const target = compute(cur);
  if (!Number.isFinite(target)) return unchanged(game);
  return applyNumberChange(game, def, addr, target, now, allowMerge);
}

/** Set a boolean/enum value and log it; returns the event id (or null when unchanged). */
function setDiscrete(
  game: Game,
  def: CounterDefinition,
  addr: CounterAddress,
  next: number,
  now: number,
  linkedTo?: string,
): [Game, string | null] {
  const key = counterKey(addr.counterId, addr.seatId, addr.sourceSeatId, addr.sourceIndex);
  const from = getValue(game, key);
  if (from === next) return [game, null];
  const g: Game = { ...game, values: { ...game.values, [key]: next } };
  return appendEvent(
    g,
    {
      kind: "counter",
      counterId: def.id,
      ...(addr.seatId !== undefined ? { seatId: addr.seatId } : {}),
      delta: next - from,
      from,
      to: next,
      ...(linkedTo !== undefined ? { linkedTo } : {}),
    },
    now,
  );
}

function defaultCounter(
  game: Game,
  pred: (d: CounterDefinition) => boolean,
): CounterDefinition | undefined {
  return game.preset.counters.find((d) => game.enabledCounters.includes(d.id) && pred(d));
}

function core(game: Game, action: GameAction, ctx: ReduceContext): ReduceResult {
  const now = actionNow(game, action);
  const allowMerge = ctx.allowMerge ?? true;
  switch (action.type) {
    case "COUNTER_ADD":
      return addOrSet(
        game,
        numberDef(game, action.counterId),
        action,
        (v) => v + action.delta,
        now,
        allowMerge,
      );
    case "COUNTER_SET":
      return addOrSet(
        game,
        numberDef(game, action.counterId),
        action,
        () => action.value,
        now,
        false,
      );
    case "CMD_DAMAGE_ADD": {
      const def =
        action.counterId !== undefined
          ? numberDef(game, action.counterId)
          : defaultCounter(game, (d) => d.scope === "playerVsOpponent" && d.kind === "number");
      return addOrSet(
        game,
        def,
        {
          seatId: action.targetSeatId,
          sourceSeatId: action.sourceSeatId,
          sourceIndex: action.sourceIndex,
        },
        (v) => v + action.delta,
        now,
        allowMerge,
      );
    }
    case "CMD_TAX_CAST": {
      const def =
        action.counterId !== undefined
          ? numberDef(game, action.counterId)
          : defaultCounter(
              game,
              (d) => d.category === "tax" && d.kind === "number" && d.scope === "player",
            );
      return addOrSet(
        game,
        def,
        {
          seatId: action.seatId,
          sourceIndex: def?.perCommander ? action.commanderIndex : undefined,
        },
        (v) => v + action.delta,
        now,
        allowMerge,
      );
    }
    case "BOOL_TOGGLE": {
      const def = enabledDef(game, action.counterId);
      if (!def || def.kind !== "boolean") return unchanged(game);
      const addr = normalizeAddress(game, def, action);
      if (!addr) return unchanged(game);
      const cur = getValue(game, counterKey(addr.counterId, addr.seatId));
      const next = action.value === undefined ? (cur ? 0 : 1) : action.value ? 1 : 0;
      const [first, id] = setDiscrete(game, def, addr, next, now);
      let g = first;
      if (id !== null && next === 1 && def.exclusiveGroup) {
        // Mutually exclusive booleans (e.g. Asleep / Confused / Paralyzed).
        for (const other of g.preset.counters) {
          if (
            other.id === def.id ||
            other.kind !== "boolean" ||
            other.exclusiveGroup !== def.exclusiveGroup
          )
            continue;
          if (!g.enabledCounters.includes(other.id) || other.scope !== def.scope) continue;
          [g] = setDiscrete(g, other, { ...addr, counterId: other.id }, 0, now, id);
        }
      }
      return unchanged(g);
    }
    case "ENUM_NEXT":
    case "ENUM_SET": {
      const def = enabledDef(game, action.counterId);
      const n = def?.enumValues?.length ?? 0;
      if (!def || def.kind !== "enum" || n === 0) return unchanged(game);
      const addr = normalizeAddress(game, def, action);
      if (!addr) return unchanged(game);
      const cur = getValue(game, counterKey(addr.counterId, addr.seatId));
      let next: number;
      if (action.type === "ENUM_SET") {
        if (!Number.isInteger(action.index)) return unchanged(game);
        next = Math.max(0, Math.min(n - 1, action.index));
      } else {
        // TOK-003: day/night never returns to Neither (enumCycleFrom = 1).
        next = cur + 1 >= n ? Math.min(def.enumCycleFrom ?? 0, n - 1) : cur + 1;
      }
      return unchanged(setDiscrete(game, def, addr, next, now)[0]);
    }
    case "TOKEN_GIVE":
    case "TOKEN_CLEAR": {
      const def = enabledDef(game, action.counterId);
      if (!def || def.scope !== "token") return unchanged(game);
      const to = action.type === "TOKEN_GIVE" ? action.seatId : null;
      if (to !== null && !seatOf(game, to)) return unchanged(game);
      const from = game.tokens[def.id] ?? null;
      if (from === to) return unchanged(game);
      const g: Game = { ...game, tokens: { ...game.tokens, [def.id]: to } };
      return unchanged(
        appendEvent(
          g,
          {
            kind: "token",
            counterId: def.id,
            ...(to !== null ? { seatId: to } : {}),
            meta: { from, to },
          },
          now,
        )[0],
      );
    }
    case "COUNTER_ENABLE": {
      const def = game.preset.counters.find((c) => c.id === action.counterId);
      if (!def || (def.isPrimary && !action.enabled)) return unchanged(game);
      const has = game.enabledCounters.includes(def.id);
      if (has === action.enabled) return unchanged(game);
      const enabledCounters = action.enabled
        ? [...game.enabledCounters, def.id]
        : game.enabledCounters.filter((id) => id !== def.id);
      const tokens =
        def.scope === "token" && !(def.id in game.tokens)
          ? { ...game.tokens, [def.id]: null }
          : game.tokens;
      return unchanged({ ...game, enabledCounters, tokens });
    }
    case "ELIMINATE":
      return unchanged(eliminateSeat(game, action.seatId, action.cause ?? { kind: "manual" }, now));
    case "CONCEDE":
      return unchanged(eliminateSeat(game, action.seatId, { kind: "concede" }, now));
    case "REVIVE": {
      const seat = seatOf(game, action.seatId);
      if (!seat?.eliminated) return unchanged(game);
      // Suppress the thresholds that are still met so auto-KO doesn't immediately re-eliminate.
      const suppress = seatLoseTriggerIds(game, seat.id).filter(
        (t) => !game.suppressedTriggers.includes(t),
      );
      const g = reviveSeat(
        { ...game, suppressedTriggers: [...game.suppressedTriggers, ...suppress] },
        seat.id,
        now,
      );
      return unchanged(g);
    }
    case "RESOLVE_PROMPT": {
      const prompt = game.pendingPrompts.find((p) => p.id === action.promptId);
      if (!prompt) return unchanged(game);
      let g: Game = {
        ...game,
        pendingPrompts: game.pendingPrompts.filter((p) => p.id !== prompt.id),
      };
      if (!action.accept) {
        g = { ...g, suppressedTriggers: [...g.suppressedTriggers, prompt.trigger] };
      } else if (prompt.kind === "eliminate") {
        g = eliminateSeat(g, prompt.seatId, prompt.cause, now);
      } else {
        g = endGame(g, [prompt.seatId], "winThreshold", now);
      }
      return unchanged(g);
    }
    case "END_GAME": {
      const winners = action.winners.filter((id) => seatOf(game, id));
      return unchanged(endGame(game, winners, "manual", now));
    }
    case "RESET_GAME":
      return unchanged(resetGame(game, ctx.rng, now));
    case "SET_FIRST_PLAYER": {
      if (!seatOf(game, action.seatId)) return unchanged(game);
      const notStarted = game.startedAt === undefined || game.turn.turnNumber === 1;
      let g: Game = {
        ...game,
        turn: {
          ...game.turn,
          firstSeat: action.seatId,
          activeSeat: notStarted ? action.seatId : game.turn.activeSeat,
          awaitingFirstPlayer: false,
        },
      };
      [g] = appendEvent(
        g,
        { kind: "firstPlayer", seatId: action.seatId, meta: { rule: "manual" } },
        now,
      );
      return unchanged(g);
    }
    case "START_GAME": {
      if (game.status !== "ready") return unchanged(game);
      return unchanged(startGame(game, now));
    }
    case "PASS_TURN": {
      if (game.status === "ended" || game.status === "setup") return unchanged(game);
      const g = game.status === "ready" ? startGame(game, now) : game;
      return unchanged(advanceTurn(g, now, true));
    }
    case "LOG_NOTE": {
      const meta: Record<string, EventMetaValue> = { ...action.meta };
      if (action.text !== undefined) meta.text = action.text;
      const g = appendEvent(
        game,
        {
          kind: action.kind,
          ...(action.seatId !== undefined && seatOf(game, action.seatId)
            ? { seatId: action.seatId }
            : {}),
          meta,
        },
        now,
      )[0];
      return unchanged(g);
    }
    case "SEAT_RENAME": {
      const name = action.name.trim();
      if (!name) return unchanged(game);
      return unchanged(patchSeat(game, action.seatId, (s) => ({ ...s, name })));
    }
    case "SEAT_SET_ART":
      return unchanged(
        patchSeat(game, action.seatId, (s) => {
          const { art: _a, ...rest } = s;
          return action.art ? { ...rest, art: action.art } : rest;
        }),
      );
    case "SEAT_SET_COLOR":
      return unchanged(patchSeat(game, action.seatId, (s) => ({ ...s, color: action.color })));
    case "SEAT_SET_COMMANDERS":
      return unchanged(
        patchSeat(game, action.seatId, (s) => ({
          ...s,
          commanders: action.commanders.slice(0, 2),
        })),
      );
    case "SEAT_SET_PROFILE":
      return unchanged(
        patchSeat(game, action.seatId, (s) => {
          const { profileId: _p, deckId: _d, deckName: _n, ...rest } = s;
          const out: Seat = { ...rest };
          if (action.profileId !== undefined) out.profileId = action.profileId;
          if (action.deckId !== undefined) out.deckId = action.deckId;
          if (action.deckName !== undefined) out.deckName = action.deckName;
          if (action.name?.trim()) out.name = action.name.trim();
          return out;
        }),
      );
    case "SEAT_SET_ROTATION":
      return unchanged(
        patchSeat(game, action.seatId, (s) => {
          const { rotationOverride: _r, ...rest } = s;
          return action.rotation !== undefined
            ? { ...rest, rotationOverride: action.rotation }
            : rest;
        }),
      );
    case "SEAT_SET_CONTRAST":
      return unchanged(
        patchSeat(game, action.seatId, (s) => ({ ...s, contrast: action.contrast })),
      );
    case "SEAT_REORDER": {
      const ids = game.seats.map((s) => s.id);
      const order = action.order;
      const valid =
        order.length === ids.length &&
        new Set(order).size === ids.length &&
        order.every((id) => ids.includes(id));
      if (!valid || order.every((id, i) => id === ids[i])) return unchanged(game);
      const seats = order.map((id) => game.seats.find((s) => s.id === id)!);
      let g: Game = {
        ...game,
        seats,
        turn: { ...game.turn, order: turnOrderFor(seats, game.options.turnOrder) },
      };
      [g] = appendEvent(g, { kind: "seatReorder", meta: { order: order.join(",") } }, now);
      return unchanged(g);
    }
    case "SEAT_ADD":
      return unchanged(addSeat(game, action.seat, action.index, now));
    case "SEAT_REMOVE":
      return unchanged(removeSeat(game, action.seatId, now));
    case "SET_OPTION": {
      if (game.options[action.key] === action.value) return unchanged(game);
      const options = { ...game.options, [action.key]: action.value };
      let g: Game = { ...game, options };
      if (action.key === "turnOrder") {
        g = { ...g, turn: { ...g.turn, order: turnOrderFor(g.seats, options.turnOrder) } };
      }
      return unchanged(g);
    }
    default:
      // History actions (reduceSession) and timer actions (reduceTimer).
      return unchanged(game);
  }
}

function startGame(game: Game, now: number): Game {
  const active = game.turn.activeSeat;
  const g: Game = {
    ...game,
    status: "running",
    startedAt: now,
    turn: {
      ...game.turn,
      turnStartedAt: now,
      awaitingFirstPlayer: false,
      turnsTaken: { ...game.turn.turnsTaken, [active]: (game.turn.turnsTaken[active] ?? 0) + 1 },
    },
  };
  return appendEvent(g, { kind: "start", seatId: active }, now)[0];
}

const HOOKS: ReadonlySet<string> = new Set(TIMER_HOOK_ACTIONS);

/** Reduce with batching metadata (used by reduceSession to decide undo steps). */
export function reduceWithMeta(game: Game, action: GameAction, ctx: ReduceContext): ReduceResult {
  if (action.type === "UNDO" || action.type === "REDO" || action.type === "UNDO_TO")
    return unchanged(game);
  const now = actionNow(game, action);
  const r = core(game, action, ctx);
  let g = r.game;
  if (isTimerAction(action) || HOOKS.has(action.type)) g = reduceTimer(g, action, now, game);
  if (g === game) return unchanged(game);
  // TMR-023: keep the clocks consistent with eliminations / game end from any action.
  return { game: syncTimer(evaluate(g, now), now), merged: r.merged };
}

/** Pure reducer: `(game, action, { rng }) → game`. */
export function reduce(game: Game, action: GameAction, ctx: ReduceContext): Game {
  return reduceWithMeta(game, action, ctx).game;
}
