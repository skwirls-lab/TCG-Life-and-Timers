/**
 * Timer reducer (TMR-050): every chess-clock transition is a pure function of (game, action, now).
 *
 * Called by the main reducer (after the core counter/turn reduction, before threshold
 * evaluation) for every TimerAction and for the hook actions in TIMER_HOOK_ACTIONS. `prev` is
 * the game before the action (e.g. who held the turn before PASS_TURN). After threshold
 * evaluation the main reducer calls `syncTimer`, which keeps the clocks consistent with
 * eliminations, turn changes and game end caused by any action (TMR-023).
 *
 * Model (§9.8): clock values are exact as of `runningSince`. Every transition first *settles*
 * the running clock to `now` (charging the holder), then changes who holds it. Undo is a plain
 * snapshot restore (GameSession): restoring the state before a PASS_TURN puts the clock back on
 * the passer with its old `runningSince`, so recomputing at `now` charges all time since then —
 * including the time after the pass — to the original holder, exactly as TMR-004 requires.
 *
 * Holder rules: holder = top of the response stack, else the turn holder (activeSeat), while
 * the timer is running or paused; null when idle/ended. A hold starts whenever the holder
 * changes (bankDelay grants `delayMs` free per hold). Freeze-mode responses (TMR-010) keep the
 * responder as holder but charge nobody.
 */
import { appendEvent } from "../log";
import { eliminateSeat } from "../thresholds";
import { advanceTurn } from "../turn";
import type { EventMetaValue, Game, GameAction, SeatId, TimerAction } from "../types";
import {
  chargeClock,
  clockRemaining,
  dueKind,
  graceLeft,
  isCharging,
  isLimited,
  projectTimer,
} from "./clock";
import { initialTimerState, type SeatClock, type TimerConfig, type TimerState } from "./types";

export const TIMER_ACTION_TYPES = [
  "TIMER_RESPOND",
  "TIMER_PASS_BACK",
  "TIMER_RETURN_TO_ACTIVE",
  "TIMER_PAUSE",
  "TIMER_RESUME",
  "TIMER_ADJUST",
  "TIMER_SET",
  "TIMER_TIMEOUT",
  "TIMER_SET_CONFIG",
] as const satisfies readonly TimerAction["type"][];

/** Non-timer actions the timer reducer also sees, so clock accounting can hook them. */
export const TIMER_HOOK_ACTIONS = [
  "START_GAME",
  "PASS_TURN",
  "ELIMINATE",
  "CONCEDE",
  "REVIVE",
  "RESET_GAME",
  "SEAT_ADD",
  "SEAT_REMOVE",
  "RESOLVE_PROMPT",
  "END_GAME",
] as const satisfies readonly GameAction["type"][];

export function isTimerAction(action: GameAction): action is TimerAction {
  return (TIMER_ACTION_TYPES as readonly string[]).includes(action.type);
}

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

const withTimer = (g: Game, timer: TimerState): Game => ({ ...g, timer });

const patchClock = (g: Game, seatId: SeatId, clock: SeatClock): Game =>
  withTimer(g, { ...g.timer, clocks: { ...g.timer.clocks, [seatId]: clock } });

const isAlive = (g: Game, id: SeatId) => g.seats.some((s) => s.id === id && !s.eliminated);

const started = (t: TimerState) => t.status === "running" || t.status === "paused";

function timerEvent(
  g: Game,
  now: number,
  meta: Record<string, EventMetaValue>,
  extra: { seatId?: SeatId; delta?: number; from?: number; to?: number; at?: number } = {},
): Game {
  return appendEvent(g, { kind: "timer", ...extra, meta }, now)[0];
}

/** A fresh hold starts for the new holder (bankDelay free time). */
function newHold(t: TimerState): TimerState {
  if (t.config.mode !== "bankDelay") {
    if (t.holdFreeMs === undefined) return t;
    const { holdFreeMs: _h, ...rest } = t;
    return rest;
  }
  return { ...t, holdFreeMs: t.config.delayMs };
}

/** Leave overtime / flagged when time was added back (increment, adjust). */
function normalizeState(c: SeatClock): SeatClock {
  return (c.state === "overtime" || c.state === "flagged") && c.bankMs > 0
    ? { ...c, state: "normal" }
    : c;
}

/** Settle the running clock to `now` (charges the holder, runs the match timer, logs match end). */
export function settle(g: Game, now: number): Game {
  const t = g.timer;
  const p = projectTimer(t, now);
  if (p === t) return g;
  let out = withTimer(g, p);
  if (t.match && t.match.remainingMs > 0 && p.match && p.match.remainingMs <= 0) {
    out = timerEvent(
      out,
      now,
      { action: "matchEnd", extraTurns: p.match.extraTurnsRemaining ?? 0 },
      { at: t.runningSince! + t.match.remainingMs },
    );
  }
  return out;
}

/** Start the clocks (TMR-002): the turn holder's clock runs from `now`. */
function start(g: Game, now: number): Game {
  const t = g.timer;
  if (t.mode === "off" || t.status !== "idle" || g.status !== "running") return g;
  const active = g.turn.activeSeat;
  const { pausedReason: _p, ...rest } = t;
  return withTimer(g, {
    ...newHold({ ...rest, holder: active }),
    status: "running",
    holder: active,
    runningSince: now,
    responseStack: [],
    turnNumber: g.turn.turnNumber,
  });
}

/** Bookkeeping for a new turn: per-turn allotments refresh, turn time resets, extra turns count. */
function newTurn(g: Game): Game {
  const t = g.timer;
  const cfg = t.config;
  const clocks: Record<SeatId, SeatClock> = {};
  for (const [id, c] of Object.entries(t.clocks)) {
    let next: SeatClock = c.turnUsedMs === 0 ? c : { ...c, turnUsedMs: 0 };
    if (cfg.mode === "perTurn" && c.state !== "timedOut") {
      next = { ...next, bankMs: cfg.perTurnMs, state: "normal" };
    }
    clocks[id] = next;
  }
  let match = t.match;
  if (
    match &&
    t.turnNumber !== undefined &&
    match.remainingMs <= 0 &&
    (match.extraTurnsRemaining ?? 0) > 0
  ) {
    match = { ...match, extraTurnsRemaining: (match.extraTurnsRemaining ?? 0) - 1 };
  }
  return withTimer(g, {
    ...t,
    clocks,
    turnNumber: g.turn.turnNumber,
    ...(match ? { match } : {}),
  });
}

function collapse(stack: readonly SeatId[]): SeatId[] {
  const out: SeatId[] = [];
  for (const id of stack) if (out.at(-1) !== id) out.push(id);
  return out;
}

const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Reconcile the clocks with the rest of the game (TMR-023): stop at game end, restart when a
 * game reopens, move the clock off eliminated seats (the turn passes to the next living seat;
 * eliminated responders leave the stack), apply new-turn bookkeeping. `lagMs` is time already
 * elapsed since a timed-out holder's exact timeout moment; it is charged to the next holder.
 * Returns `game` unchanged when everything is consistent.
 */
export function syncTimer(game: Game, now: number, lagMs = 0): Game {
  const t0 = game.timer;
  if (t0.mode === "off" || t0.status === "idle") return game;
  let g = game;
  if (g.status === "ended") {
    if (t0.status === "ended") return game;
    g = settle(g, now);
    const { pausedReason: _p, holdFreeMs: _h, ...rest } = g.timer;
    return withTimer(g, {
      ...rest,
      status: "ended",
      holder: null,
      runningSince: null,
      responseStack: [],
    });
  }
  if (t0.status === "ended") {
    if (g.status !== "running") return game;
    g = withTimer(g, { ...t0, status: "running", runningSince: now });
  }
  // Clocks only run for living seats: the turn holder must be alive (also without turn tracking).
  if (!isAlive(g, g.turn.activeSeat) && g.seats.some((s) => !s.eliminated)) {
    g = advanceTurn(settle(g, now), now, true);
  }
  // A revived seat that had timed out continues (flagged when no time is left).
  for (const [id, c] of Object.entries(g.timer.clocks)) {
    if (c.state === "timedOut" && isAlive(g, id)) {
      const left = clockRemaining({ ...c, state: "normal" }, g.timer.config);
      g = patchClock(g, id, { ...c, state: left > 0 ? "normal" : "flagged" });
    }
  }
  if (g.timer.turnNumber !== g.turn.turnNumber) g = newTurn(settle(g, now));
  const t = g.timer;
  const active = g.turn.activeSeat;
  const stack = collapse(t.responseStack.filter((id) => isAlive(g, id) && t.clocks[id]));
  const desired = stack.at(-1) ?? (isAlive(g, active) && t.clocks[active] ? active : null);
  if (desired === t.holder && sameList(stack, t.responseStack)) return g;
  g = settle(g, now);
  let timer: TimerState = { ...g.timer, responseStack: stack, holder: desired };
  if (desired !== t.holder) timer = newHold(timer);
  g = withTimer(g, timer);
  if (lagMs > 0 && desired !== null && isCharging(g.timer)) {
    const c = g.timer.clocks[desired]!;
    const r = chargeClock(c, lagMs, g.timer.config, g.timer.holdFreeMs ?? 0);
    g = patchClock(g, desired, r.clock);
    if (g.timer.config.mode === "bankDelay") g = withTimer(g, { ...g.timer, holdFreeMs: r.freeMs });
  }
  return g;
}

// ---------------------------------------------------------------------------------------------
// Timeouts (§9.5, TMR-030)
// ---------------------------------------------------------------------------------------------

interface DueResult {
  game: Game;
  lagMs: number;
}

/** Apply the timeout transition of one due seat. */
function applyTimeout(g: Game, seatId: SeatId, now: number): DueResult {
  const t = g.timer;
  const cfg = t.config;
  const c = t.clocks[seatId]!;
  const kind = dueKind(c, cfg)!;
  const charging = isCharging(t) && t.holder === seatId;
  const finalAction = cfg.finalAction ?? "lose";
  const log = (game: Game, result: string) =>
    timerEvent(game, now, { action: "timeout", result, phase: kind }, { seatId });

  if (kind === "timeout") {
    const over = -clockRemaining(c, cfg); // ≥ 0: time held past 0:00
    if (cfg.timeoutAction === "addOnce" && !c.addOnceUsed) {
      const next = { ...c, bankMs: c.bankMs + cfg.addOnceMs, addOnceUsed: true };
      return { game: log(patchClock(g, seatId, next), "addOnce"), lagMs: 0 };
    }
    if (cfg.timeoutAction === "grace") {
      // Overtime starts at the exact 0:00 moment: the overshoot comes out of grace.
      const next: SeatClock = {
        ...c,
        bankMs: c.bankMs + over,
        graceMs: graceLeft(c, cfg) - over,
        state: "overtime",
      };
      return { game: log(patchClock(g, seatId, next), "overtime"), lagMs: 0 };
    }
    // 'flag' flags; 'lose' loses; a used 'addOnce' applies the final action.
    const action =
      cfg.timeoutAction === "flag" ? "flag" : cfg.timeoutAction === "lose" ? "lose" : finalAction;
    if (action === "flag") {
      return { game: log(patchClock(g, seatId, { ...c, state: "flagged" }), "flagged"), lagMs: 0 };
    }
    // Lose: the seat's clock stops at exactly 0:00; time held past it moves to the next holder.
    const lag = charging ? over : 0;
    const next: SeatClock = {
      ...c,
      bankMs: c.bankMs + lag,
      usedMs: Math.max(0, c.usedMs - lag),
      turnUsedMs: Math.max(0, c.turnUsedMs - lag),
      state: "timedOut",
    };
    return {
      game: eliminate(log(patchClock(g, seatId, next), "eliminated"), seatId, now),
      lagMs: lag,
    };
  }
  // Grace ended → final action.
  const over = -graceLeft(c, cfg);
  if (finalAction === "flag") {
    const next: SeatClock = { ...c, bankMs: c.bankMs - over, graceMs: 0, state: "flagged" };
    return { game: log(patchClock(g, seatId, next), "flagged"), lagMs: 0 };
  }
  const lag = charging ? over : 0;
  const next: SeatClock = {
    ...c,
    graceMs: graceLeft(c, cfg) + lag,
    usedMs: Math.max(0, c.usedMs - lag),
    turnUsedMs: Math.max(0, c.turnUsedMs - lag),
    state: "timedOut",
  };
  return {
    game: eliminate(log(patchClock(g, seatId, next), "eliminated"), seatId, now),
    lagMs: lag,
  };
}

function eliminate(g: Game, seatId: SeatId, now: number): Game {
  return eliminateSeat(g, seatId, { kind: "time" }, now);
}

/** Apply every due timeout (the scheduler normally dispatches them at the exact moment). */
function resolveDue(game: Game, now: number): DueResult {
  let g = game;
  let lagMs = 0;
  for (let guard = 0; guard < 4 * g.seats.length + 4; guard++) {
    const t = g.timer;
    const seat = g.seats.find((s) => {
      const c = t.clocks[s.id];
      return !s.eliminated && c !== undefined && dueKind(c, t.config) !== null;
    });
    if (!seat) break;
    const r = applyTimeout(g, seat.id, now);
    g = r.game;
    lagMs = Math.max(lagMs, r.lagMs);
  }
  return { game: g, lagMs };
}

// ---------------------------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------------------------

/** Keys that may change while the clocks run (structure keys only apply before START). */
const RUNTIME_KEYS = [
  "incrementMs",
  "delayMs",
  "graceMs",
  "timeoutAction",
  "addOnceMs",
  "finalAction",
  "warningsMs",
  "responses",
  "passMode",
  "autoPauseBackground",
  "autoPauseMenus",
  "showTenths",
  "showTurnTime",
] as const satisfies readonly (keyof TimerConfig)[];

function setConfig(game: Game, patch: Partial<TimerConfig>, now: number): Game {
  const t = game.timer;
  if (t.status === "idle") {
    const config: TimerConfig = { ...t.config, ...patch };
    if (JSON.stringify(config) === JSON.stringify(t.config)) return game;
    const timer = initialTimerState(
      config,
      game.seats.map((s) => s.id),
    );
    const options =
      config.mode !== "off" && !game.options.turnTracking
        ? { ...game.options, turnTracking: true }
        : game.options;
    return { ...game, options, timer };
  }
  const picked: Partial<TimerConfig> = {};
  for (const k of RUNTIME_KEYS) {
    if (k in patch) (picked as Record<string, unknown>)[k] = patch[k];
  }
  const config: TimerConfig = { ...t.config, ...picked };
  if (JSON.stringify(config) === JSON.stringify(t.config)) return game;
  const g = settle(game, now);
  return withTimer(g, { ...g.timer, config });
}

// ---------------------------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------------------------

/** Current priority holder (stack top, else the turn holder) as stored. */
const priority = (t: TimerState, g: Game): SeatId => t.responseStack.at(-1) ?? g.turn.activeSeat;

function lastRespondAt(g: Game, seatId: SeatId): number | undefined {
  for (let i = g.log.length - 1; i >= 0; i--) {
    const e = g.log[i]!;
    if (e.kind === "timer" && e.seatId === seatId && e.meta?.action === "respond") return e.at;
  }
  return undefined;
}

/** Validate + apply a timer action on a settled game. Returns null when the action is a no-op. */
function timerTransition(game: Game, action: TimerAction, now: number): Game | null {
  const t = game.timer;
  switch (action.type) {
    case "TIMER_RESPOND": {
      if (!started(t) || t.config.responses === "disabled") return null;
      if (!isAlive(game, action.seatId) || !t.clocks[action.seatId]) return null;
      if (priority(t, game) === action.seatId) return null;
      const g = settle(game, now);
      const stack = [...g.timer.responseStack, action.seatId];
      return timerEvent(
        withTimer(g, { ...g.timer, responseStack: stack }),
        now,
        { action: "respond", depth: stack.length },
        { seatId: action.seatId },
      );
    }
    case "TIMER_PASS_BACK": {
      if (!started(t) || t.responseStack.at(-1) !== action.seatId) return null;
      const g = settle(game, now);
      const since = lastRespondAt(g, action.seatId);
      const stack = g.timer.responseStack.slice(0, -1);
      return timerEvent(
        withTimer(g, { ...g.timer, responseStack: stack }),
        now,
        {
          action: "passBack",
          depth: stack.length,
          durationMs: since === undefined ? null : now - since,
          to: stack.at(-1) ?? g.turn.activeSeat,
        },
        { seatId: action.seatId },
      );
    }
    case "TIMER_RETURN_TO_ACTIVE": {
      if (!started(t) || t.responseStack.length === 0) return null;
      const g = settle(game, now);
      return timerEvent(
        withTimer(g, { ...g.timer, responseStack: [] }),
        now,
        { action: "returnToActive", cleared: t.responseStack.length },
        { seatId: g.turn.activeSeat },
      );
    }
    case "TIMER_PAUSE": {
      if (t.status !== "running") return null;
      const reason = action.reason ?? "user";
      const g = settle(game, now);
      return timerEvent(
        withTimer(g, { ...g.timer, status: "paused", runningSince: null, pausedReason: reason }),
        now,
        { action: "pause", reason },
      );
    }
    case "TIMER_RESUME": {
      if (t.status !== "paused") return null;
      const { pausedReason, ...rest } = t;
      return timerEvent(withTimer(game, { ...rest, status: "running", runningSince: now }), now, {
        action: "resume",
        reason: pausedReason ?? "user",
      });
    }
    case "TIMER_ADJUST":
    case "TIMER_SET": {
      const c0 = t.clocks[action.seatId];
      if (!c0) return null;
      const value = action.type === "TIMER_ADJUST" ? action.deltaMs : action.bankMs;
      if (!Number.isFinite(value)) return null;
      const g = settle(game, now);
      const c = g.timer.clocks[action.seatId]!;
      const countup = !isLimited(t.mode);
      const from = countup ? c.usedMs : c.bankMs;
      const raw = action.type === "TIMER_ADJUST" ? from + value : value;
      const to = countup ? Math.max(0, raw) : raw;
      if (to === from) return null;
      const next = countup ? { ...c, usedMs: to } : normalizeState({ ...c, bankMs: to });
      // TMR-022: adjustments are logged and visibly marked in history.
      return timerEvent(
        patchClock(g, action.seatId, next),
        now,
        { action: action.type === "TIMER_SET" ? "set" : "adjust", adjusted: true },
        { seatId: action.seatId, delta: to - from, from, to },
      );
    }
    case "TIMER_TIMEOUT": {
      const c = projectTimer(t, now).clocks[action.seatId];
      if (!c || !isAlive(game, action.seatId) || !dueKind(c, t.config)) return null;
      return settle(game, now);
    }
    case "TIMER_SET_CONFIG":
      return null;
  }
}

/** PASS_TURN hook (TMR-003, TMR-009): stop the passer, apply the increment, log the time used. */
function passTurn(game: Game, prev: Game, now: number): Game {
  const t = prev.timer;
  if (t.status === "idle") return start(game, now);
  if (!started(t)) return game;
  const passer = prev.turn.activeSeat;
  if (t.responseStack.length > 0 && t.responseStack.at(-1) !== passer) return prev;
  let g = settle(game, now);
  const due = resolveDue(g, now);
  g = due.game;
  if (g.timer.responseStack.length > 0) g = withTimer(g, { ...g.timer, responseStack: [] });
  const c = g.timer.clocks[passer];
  if (!c) return g;
  const cfg = g.timer.config;
  let incrementMs = 0;
  if (cfg.mode === "bankIncrement" && cfg.incrementMs > 0 && isAlive(g, passer)) {
    incrementMs = cfg.incrementMs;
    g = patchClock(g, passer, normalizeState({ ...c, bankMs: c.bankMs + incrementMs }));
  }
  // Annotate the core's turn event with the passer's time this turn (TURN-002).
  const idx = g.log.findLastIndex((e) => e.kind === "turn" && e.meta?.from === passer);
  if (idx >= prev.log.length) {
    const e = g.log[idx]!;
    const meta = { ...e.meta, timeUsedMs: c.turnUsedMs, ...(incrementMs ? { incrementMs } : {}) };
    const log = [...g.log];
    log[idx] = { ...e, meta };
    g = { ...g, log };
  }
  return syncTimer(g, now, due.lagMs);
}

export function reduceTimer(game: Game, action: GameAction, now: number, prev: Game = game): Game {
  if (action.type === "TIMER_SET_CONFIG") return setConfig(game, action.config, now);
  if (game.timer.mode === "off" && prev.timer.mode === "off") return game;
  if (isTimerAction(action)) {
    const g = timerTransition(game, action, now);
    if (g === null) return game;
    const due = resolveDue(g, now);
    return syncTimer(due.game, now, due.lagMs);
  }
  switch (action.type) {
    case "START_GAME":
      return syncTimer(start(game, now), now);
    case "PASS_TURN":
      if (game === prev) return game;
      return passTurn(game, prev, now);
    default:
      if (game === prev) return game;
      return syncTimer(game, now);
  }
}
