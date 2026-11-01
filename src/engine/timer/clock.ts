/**
 * Pure clock math (PRD §9.2, §9.5, §9.6, §9.8, TMR-044, TMR-051).
 *
 * Stored clock values are exact as of `timer.runningSince`; everything else is projected with
 * integer arithmetic from `now`, so there is no accumulated drift: the remaining time after any
 * sequence of events equals the configured bank minus the exact held wall time.
 *
 * Charging rules for `ms` of held time:
 *  - usedMs / turnUsedMs always grow by `ms` (wall time held; stats, TURN-002).
 *  - bankDelay: the first `holdFreeMs` of each hold are free (simple delay).
 *  - perTurnReserve: the per-turn part (perTurnMs − turnUsedMs) is consumed before the reserve.
 *  - overtime: the remainder comes out of the grace pool; otherwise out of `bankMs`.
 *  - off / countup: no limit; only used time is tracked.
 */
import type { Game, SeatId } from "../types";
import type { ClockState, SeatClock, TimerConfig, TimerMode, TimerState } from "./types";

/** Modes with a time limit (timeouts and warnings apply). */
export function isLimited(mode: TimerMode): boolean {
  return mode !== "off" && mode !== "countup";
}

/** The holder's clock is being charged right now (running, not frozen by a response — TMR-010). */
export function isCharging(t: TimerState): boolean {
  return (
    t.status === "running" &&
    t.holder !== null &&
    t.runningSince !== null &&
    !(t.config.responses === "freeze" && t.responseStack.length > 0)
  );
}

/** Grace left for a clock (undefined = the full configured grace). */
export function graceLeft(c: SeatClock, cfg: TimerConfig): number {
  return c.graceMs ?? cfg.graceMs;
}

/** perTurnReserve: per-turn time left this turn (0 in other modes). */
export function turnLeftMs(c: SeatClock, cfg: TimerConfig): number {
  return cfg.mode === "perTurnReserve" ? Math.max(0, cfg.perTurnMs - c.turnUsedMs) : 0;
}

/** Time left before the next timeout action applies (per state). */
export function clockRemaining(c: SeatClock, cfg: TimerConfig): number {
  if (!isLimited(cfg.mode)) return Number.POSITIVE_INFINITY;
  const pool = c.state === "overtime" ? graceLeft(c, cfg) : c.bankMs;
  return turnLeftMs(c, cfg) + pool;
}

/** Charge `ms` of held time to a clock; returns the new clock and the free delay left. */
export function chargeClock(
  c: SeatClock,
  ms: number,
  cfg: TimerConfig,
  freeMs: number,
): { clock: SeatClock; freeMs: number } {
  if (ms <= 0) return { clock: c, freeMs };
  let x = ms;
  let free = freeMs;
  if (cfg.mode === "bankDelay") {
    const f = Math.min(x, Math.max(0, free));
    x -= f;
    free -= f;
  }
  const next: SeatClock = { ...c, usedMs: c.usedMs + ms, turnUsedMs: c.turnUsedMs + ms };
  if (isLimited(cfg.mode) && x > 0) {
    x -= Math.min(x, turnLeftMs(c, cfg));
    if (c.state === "overtime") next.graceMs = graceLeft(c, cfg) - x;
    else next.bankMs = c.bankMs - x;
  }
  return { clock: next, freeMs: free };
}

/** Timer state settled to `now` (clocks + match), without applying timeouts or logging. */
export function projectTimer(t: TimerState, now: number): TimerState {
  if (t.status !== "running" || t.runningSince === null) return t;
  const elapsed = now - t.runningSince;
  if (elapsed <= 0) return t;
  const next: TimerState = { ...t, runningSince: now };
  const h = t.holder;
  const c = h === null ? undefined : t.clocks[h];
  if (isCharging(t) && h !== null && c) {
    const r = chargeClock(c, elapsed, t.config, t.holdFreeMs ?? 0);
    next.clocks = { ...t.clocks, [h]: r.clock };
    if (t.config.mode === "bankDelay") next.holdFreeMs = r.freeMs;
  }
  if (t.match && t.match.remainingMs > 0) {
    next.match = { ...t.match, remainingMs: Math.max(0, t.match.remainingMs - elapsed) };
  }
  return next;
}

/** A seat's clock projected to `now` (undefined for unknown seats). */
export function clockAt(
  game: Pick<Game, "timer">,
  seatId: SeatId,
  now: number,
): SeatClock | undefined {
  return projectTimer(game.timer, now).clocks[seatId];
}

/** Remaining time before the seat's next timeout action (Infinity for off / count-up). */
export function remaining(game: Pick<Game, "timer">, seatId: SeatId, now: number): number {
  const c = clockAt(game, seatId, now);
  if (!c) return 0;
  return clockRemaining(c, game.timer.config);
}

/** Total time the seat has held the clock (stats). */
export function timeUsed(game: Pick<Game, "timer">, seatId: SeatId, now: number): number {
  return clockAt(game, seatId, now)?.usedMs ?? 0;
}

/** Time the seat has held the clock during the current turn (TMR-043). */
export function turnTimeUsed(game: Pick<Game, "timer">, seatId: SeatId, now: number): number {
  return clockAt(game, seatId, now)?.turnUsedMs ?? 0;
}

/**
 * The value a seat's chip shows: used time for count-up, the per-turn part then the reserve for
 * perTurnReserve, the grace countdown in overtime, otherwise the bank (negative when flagged).
 */
export function displayMs(game: Pick<Game, "timer">, seatId: SeatId, now: number): number {
  const c = clockAt(game, seatId, now);
  return c ? clockDisplayMs(c, game.timer.config) : 0;
}

/** `displayMs` for an already settled clock. */
export function clockDisplayMs(c: SeatClock, cfg: TimerConfig): number {
  if (cfg.mode === "off") return 0;
  if (cfg.mode === "countup") return c.usedMs;
  const turnLeft = turnLeftMs(c, cfg);
  if (turnLeft > 0) return turnLeft;
  return c.state === "overtime" ? graceLeft(c, cfg) : c.bankMs;
}

/** Display state of a seat's clock. */
export function clockState(game: Pick<Game, "timer">, seatId: SeatId): ClockState {
  return game.timer.clocks[seatId]?.state ?? "normal";
}

/** The seat whose clock is running; null unless the timer runs (TMR-041). */
export function holder(game: Pick<Game, "timer" | "status">): SeatId | null {
  return game.timer.status === "running" && game.status !== "ended" ? game.timer.holder : null;
}

/** Match / round timer (TMR-032): remaining time and whether time has been called. */
export function matchRemaining(
  game: Pick<Game, "timer">,
  now: number,
): { remainingMs: number; timeCalled: boolean; extraTurnsRemaining: number } | null {
  const m = projectTimer(game.timer, now).match;
  if (!m) return null;
  return {
    remainingMs: m.remainingMs,
    timeCalled: m.remainingMs <= 0,
    extraTurnsRemaining: m.extraTurnsRemaining ?? 0,
  };
}

/** Due timeout kind for a clock (the TIMER_TIMEOUT predicate). */
export function dueKind(c: SeatClock, cfg: TimerConfig): "timeout" | "graceEnd" | null {
  if (!isLimited(cfg.mode)) return null;
  if (c.state === "normal" && clockRemaining(c, cfg) <= 0) return "timeout";
  if (c.state === "overtime" && graceLeft(c, cfg) <= 0) return "graceEnd";
  return null;
}

export type SignificantEventKind = "warning" | "timeout" | "graceEnd" | "matchEnd";

export interface SignificantEvent {
  /** Epoch ms when it happens (≤ now when already due). */
  at: number;
  kind: SignificantEventKind;
  seatId?: SeatId;
  /** warning: the threshold being crossed. */
  thresholdMs?: number;
}

const KIND_RANK: Record<SignificantEventKind, number> = {
  timeout: 0,
  graceEnd: 1,
  matchEnd: 2,
  warning: 3,
};

/**
 * TMR-051: the next moment the scheduler must act — a low-time warning (TMR-031), a timeout or
 * grace end (dispatch TIMER_TIMEOUT), or the match timer reaching 0 (TMR-032). Already-due
 * timeouts (e.g. after a late pass) are returned with `at = now`.
 */
export function nextSignificantEvent(
  game: Pick<Game, "timer" | "status" | "seats">,
  now: number,
): SignificantEvent | null {
  const t0 = game.timer;
  if (t0.mode === "off" || game.status === "ended") return null;
  if (t0.status !== "running" && t0.status !== "paused") return null;
  const t = projectTimer(t0, now);
  const cfg = t.config;
  const out: SignificantEvent[] = [];
  for (const seat of game.seats) {
    const c = t.clocks[seat.id];
    if (seat.eliminated || !c) continue;
    const due = dueKind(c, cfg);
    if (due) out.push({ at: now, kind: due, seatId: seat.id });
  }
  if (isCharging(t) && t.holder !== null) {
    const h = t.holder;
    const c = t.clocks[h];
    const free = cfg.mode === "bankDelay" ? Math.max(0, t.holdFreeMs ?? 0) : 0;
    if (c && isLimited(cfg.mode) && !dueKind(c, cfg)) {
      const left = clockRemaining(c, cfg);
      if (c.state === "normal") {
        out.push({ at: now + free + left, kind: "timeout", seatId: h });
        const w = cfg.warningsMs.filter((x) => x > 0 && x < left).sort((a, b) => b - a)[0];
        if (w !== undefined)
          out.push({ at: now + free + left - w, kind: "warning", seatId: h, thresholdMs: w });
      } else if (c.state === "overtime") {
        out.push({ at: now + free + left, kind: "graceEnd", seatId: h });
      }
    }
  }
  if (t.status === "running" && t.match && t.match.remainingMs > 0) {
    out.push({ at: now + t.match.remainingMs, kind: "matchEnd" });
  }
  out.sort((a, b) => a.at - b.at || KIND_RANK[a.kind] - KIND_RANK[b.kind]);
  return out[0] ?? null;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * TMR-040 display format: `m:ss` under 1 h, `h:mm:ss` from 1 h, `s.t` under 10 s (when
 * showTenths), negative values with a leading "−" (U+2212). Values are truncated (a clock never
 * shows more time than is left).
 */
export function formatClock(ms: number, opts: { showTenths?: boolean } = {}): string {
  if (!Number.isFinite(ms)) return "∞";
  const showTenths = opts.showTenths ?? true;
  const abs = Math.abs(ms);
  const sign = ms < 0 ? "−" : "";
  if (showTenths && abs < 10_000) {
    const tenths = Math.floor(abs / 100);
    return `${sign}${Math.floor(tenths / 10)}.${tenths % 10}`;
  }
  const total = Math.floor(abs / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${sign}${h}:${pad2(m)}:${pad2(s)}` : `${sign}${m}:${pad2(s)}`;
}

/** TURN-002: turns completed by a seat and their average length (from the turn events). */
export function turnStats(
  game: Pick<Game, "log" | "turn">,
  seatId: SeatId,
): { turns: number; timedTurns: number; totalMs: number; averageMs: number | null } {
  let timedTurns = 0;
  let totalMs = 0;
  for (const e of game.log) {
    if (e.kind !== "turn" || e.meta?.from !== seatId) continue;
    const used = e.meta.timeUsedMs;
    if (typeof used === "number") {
      timedTurns++;
      totalMs += used;
    }
  }
  return {
    turns: game.turn.turnsTaken[seatId] ?? 0,
    timedTurns,
    totalMs,
    averageMs: timedTurns > 0 ? Math.round(totalMs / timedTurns) : null,
  };
}
