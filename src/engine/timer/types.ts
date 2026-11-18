/**
 * Timer (chess clock) types — PRD §9.2, §9.5, §9.8.
 *
 * Only the data model and defaults live here in W1. The transition logic is implemented by the
 * TIMER-CORE lane in `./reducer.ts` (`reduceTimer`). All timestamps are epoch ms supplied by
 * actions (`now`); the engine never reads the clock (ARCH-005, TMR-050).
 */

export type SeatIdLike = string;

/** §9.2 timer modes. */
export const TIMER_MODES = [
  "off",
  "countup",
  "bank",
  "bankIncrement",
  "bankDelay",
  "perTurn",
  "perTurnReserve",
] as const;
export type TimerMode = (typeof TIMER_MODES)[number];

/** §9.5 what happens at 0:00. */
export const TIMEOUT_ACTIONS = ["lose", "grace", "flag", "addOnce"] as const;
export type TimeoutAction = (typeof TIMEOUT_ACTIONS)[number];

/** What happens after grace / the one-time extension runs out (§9.5 "final action"). */
export const FINAL_ACTIONS = ["lose", "flag"] as const;
export type FinalAction = (typeof FINAL_ACTIONS)[number];

/** TMR-005 / TMR-010 response time accounting. */
export const RESPONSE_MODES = ["charge", "freeze", "disabled"] as const;
export type ResponseMode = (typeof RESPONSE_MODES)[number];

/** TMR-004 pass-turn gesture. */
export const PASS_MODES = ["tap", "hold"] as const;
export type PassMode = (typeof PASS_MODES)[number];

/**
 * Declare-blockers window house rule at 0:00: keep waiting (just alert) or hand the clock back
 * to the attacker automatically.
 */
export const BLOCKERS_TIMEOUTS = ["wait", "return"] as const;
export type BlockersTimeout = (typeof BLOCKERS_TIMEOUTS)[number];

/** TIMER_BLOCKERS_END reasons ("pass" / "cancel" are logged by the engine itself). */
export const BLOCKERS_END_REASONS = ["declared", "timeout"] as const;
export type BlockersEndReason = (typeof BLOCKERS_END_REASONS)[number];

/** Default blockers window length. */
export const DEFAULT_BLOCKERS_MS = 30_000;

/** TMR-031: one low-time warning threshold and how it alerts. */
export interface TimerWarning {
  /** Remaining time at which the warning fires. */
  ms: number;
  sound: boolean;
  vibrate: boolean;
  /** Visual pulse on the tile. */
  flash: boolean;
}

export interface MatchTimerConfig {
  /** Total round length, e.g. 50 min. */
  totalMs: number;
  /** Extra turns after time is called (TMR-032). */
  extraTurns: number;
}

/** Per-game timer configuration (savable as preset default; §13.1-C). */
export interface TimerConfig {
  mode: TimerMode;
  /** Chess-clock bank per seat. */
  bankMs: number;
  /** Fischer increment added on each pass (mode bankIncrement). */
  incrementMs: number;
  /** Free time at the start of each hold (mode bankDelay). */
  delayMs: number;
  /** Per-turn allotment (perTurn, perTurnReserve). */
  perTurnMs: number;
  /** Reserve bank consumed after the per-turn time (perTurnReserve). */
  reserveMs: number;
  /** Overtime length when timeoutAction = 'grace'. */
  graceMs: number;
  timeoutAction: TimeoutAction;
  /** One-time extension when timeoutAction = 'addOnce'. */
  addOnceMs: number;
  /** Applied when grace or the one-time extension runs out (default 'lose'). */
  finalAction?: FinalAction;
  /** Low-time warning thresholds, descending (default 5:00, 1:00, 0:10). */
  warningsMs: number[];
  /**
   * TMR-031 per-threshold alerts (W6, additive). When present it is authoritative and
   * `warningsMs` mirrors its `ms` values (kept for compatibility); absent = every
   * `warningsMs` threshold alerts with sound, vibration and flash.
   */
  warnings?: TimerWarning[];
  responses: ResponseMode;
  passMode: PassMode;
  autoPauseBackground: boolean;
  autoPauseMenus: boolean;
  showTenths: boolean;
  showTurnTime: boolean;
  /** Optional global round timer, combinable with any per-seat mode. */
  match?: MatchTimerConfig;
  /**
   * TMR-060 handicap (additive): signed extra starting time per seat id, added to the seat's
   * base allotment — the bank in bank modes, the per-turn time in per-turn modes (the
   * perTurnReserve reserve stays shared). Increment and delay are the same for every seat.
   * A structure key (applies to idle clocks, restarts, resets and new games). Entries for seats
   * that are not in the game are pruned.
   */
  seatExtraMs?: Record<SeatIdLike, number>;
  /** Declare-blockers window offered on the attacker's tile (additive; absent = off). */
  blockersWindow?: boolean;
  /** Blockers window length (default DEFAULT_BLOCKERS_MS). */
  blockersMs?: number;
  /** What happens when the blockers window reaches 0 (default "wait"). */
  blockersTimeout?: BlockersTimeout;
}

export const CLOCK_STATES = ["normal", "overtime", "flagged", "timedOut"] as const;
export type ClockState = (typeof CLOCK_STATES)[number];

export interface SeatClock {
  /** Remaining as of `runningSince` (may go negative in flag mode). perTurn: this turn's time; perTurnReserve: the reserve. */
  bankMs: number;
  /** Grace left (undefined = the full config.graceMs); not reset between turns. */
  graceMs?: number;
  /** Total time held (wall time while holding a running, non-frozen clock; stats). */
  usedMs: number;
  /** Time held during the current turn (reset on every turn change; perTurnReserve per-turn part). */
  turnUsedMs: number;
  state: ClockState;
  /** 'addOnce' extension already consumed. */
  addOnceUsed?: boolean;
  /** TMR-060: this seat's per-turn allowance when it differs from config.perTurnMs. */
  turnMs?: number;
}

export const TIMER_STATUSES = ["idle", "running", "paused", "ended"] as const;
export type TimerStatus = (typeof TIMER_STATUSES)[number];

export const PAUSE_REASONS = ["user", "background", "setup", "menu"] as const;
export type PauseReason = (typeof PAUSE_REASONS)[number];

export interface MatchTimerState {
  totalMs: number;
  remainingMs: number;
  extraTurnsRemaining?: number;
}

/**
 * Declare-blockers window (additive): the attacker's clock stops and a shared countdown runs
 * instead. Nobody is charged while it counts (overtime included); a response pauses it and runs
 * the responder's clock. `remainingMs` is exact as of `runningSince`, like the clocks.
 */
export interface BlockersWindow {
  /** The attacker (turn holder when the window opened). */
  seatId: SeatIdLike;
  durationMs: number;
  remainingMs: number;
  /** Epoch ms the window opened. */
  startedAt: number;
  /** "wait" rule: the time-up alert has been applied (the window stays open). */
  expired?: boolean;
}

/**
 * §9.8. remaining(seat) = clocks[seat].bankMs − (holder === seat && running ? now − runningSince : 0)
 * (see `./clock.ts` for the exact per-mode projection). `holder` is the priority holder while the
 * timer is running or paused (null when idle/ended); `runningSince` is non-null only while running.
 */
export interface TimerState {
  mode: TimerMode;
  config: TimerConfig;
  status: TimerStatus;
  clocks: Record<SeatIdLike, SeatClock>;
  /** Whose clock is running. */
  holder: SeatIdLike | null;
  /** Epoch ms when the holder's clock last (re)started. */
  runningSince: number | null;
  /** Bottom = first responder; top = current holder when non-empty. */
  responseStack: SeatIdLike[];
  pausedReason?: PauseReason;
  match?: MatchTimerState;
  /** bankDelay: free time left in the current hold (as of `runningSince`). */
  holdFreeMs?: number;
  /** The turn number the clocks were last reset for (per-turn modes, turn time, extra turns). */
  turnNumber?: number;
  /** Open declare-blockers window, if any. */
  blockers?: BlockersWindow;
}

const MIN = 60_000;

/** TMR-031: the effective warning list (descending, unique, positive thresholds). */
export function timerWarnings(
  config: Pick<TimerConfig, "warningsMs" | "warnings">,
): TimerWarning[] {
  const list =
    config.warnings ??
    config.warningsMs.map((ms) => ({ ms, sound: true, vibrate: true, flash: true }));
  const byMs = new Map<number, TimerWarning>();
  for (const w of list) if (w.ms > 0 && !byMs.has(w.ms)) byMs.set(w.ms, { ...w });
  return [...byMs.values()].sort((a, b) => b.ms - a.ms);
}

/** The alert flags for a threshold (all on when it isn't in the list). */
export function warningFor(
  config: Pick<TimerConfig, "warningsMs" | "warnings">,
  ms: number | undefined,
): TimerWarning {
  return (
    timerWarnings(config).find((w) => w.ms === ms) ?? {
      ms: ms ?? 0,
      sound: true,
      vibrate: true,
      flash: true,
    }
  );
}

/** A config patch setting the warnings (normalized) with `warningsMs` kept in sync. */
export function warningsPatch(
  list: readonly TimerWarning[],
): Pick<TimerConfig, "warnings" | "warningsMs"> {
  const warnings = timerWarnings({ warningsMs: [], warnings: [...list] });
  return { warnings, warningsMs: warnings.map((w) => w.ms) };
}

/** Defaults per §13.1-C (casual: grace period; warnings 5:00/1:00/0:10). */
export function defaultTimerConfig(overrides: Partial<TimerConfig> = {}): TimerConfig {
  return {
    mode: "off",
    bankMs: 20 * MIN,
    incrementMs: 0,
    delayMs: 0,
    perTurnMs: 3 * MIN,
    reserveMs: 10 * MIN,
    graceMs: 60_000,
    timeoutAction: "grace",
    addOnceMs: 5 * MIN,
    warningsMs: [5 * MIN, MIN, 10_000],
    responses: "charge",
    passMode: "tap",
    autoPauseBackground: true,
    autoPauseMenus: true,
    showTenths: true,
    showTurnTime: false,
    ...overrides,
  };
}

const perTurnMode = (mode: TimerMode) => mode === "perTurn" || mode === "perTurnReserve";

/** TMR-060: the base allotment a seat's extra time is added to (bank, or per-turn time). */
export function baseAllotmentMs(config: TimerConfig): number {
  return perTurnMode(config.mode) ? config.perTurnMs : config.bankMs;
}

/** TMR-060: a seat's starting allotment (base + its extra time, never below 0). */
export function seatAllotmentMs(config: TimerConfig, seatId?: SeatIdLike): number {
  const extra = seatId === undefined ? 0 : (config.seatExtraMs?.[seatId] ?? 0);
  return Math.max(0, baseAllotmentMs(config) + (Number.isFinite(extra) ? extra : 0));
}

/** Starting bank for a seat under a config (count-up starts at 0; `seatId` adds TMR-060 extra). */
export function initialBankMs(config: TimerConfig, seatId?: SeatIdLike): number {
  switch (config.mode) {
    case "off":
    case "countup":
      return 0;
    case "perTurnReserve":
      return config.reserveMs;
    default:
      return seatAllotmentMs(config, seatId);
  }
}

/** TMR-060: keep only the extra-time entries of the given seats. */
export function pruneSeatExtra(config: TimerConfig, seatIds: readonly SeatIdLike[]): TimerConfig {
  const extra = config.seatExtraMs;
  if (!extra) return config;
  const keep = Object.keys(extra).filter((id) => seatIds.includes(id));
  if (keep.length === Object.keys(extra).length) return config;
  return { ...config, seatExtraMs: Object.fromEntries(keep.map((id) => [id, extra[id]!])) };
}

/** Fresh idle timer state for a set of seats (used by createGame / RESET_GAME / SEAT_ADD). */
export function initialTimerState(
  config0: TimerConfig,
  seatIds: readonly SeatIdLike[],
): TimerState {
  const config = pruneSeatExtra(config0, seatIds);
  const clocks: Record<SeatIdLike, SeatClock> = {};
  for (const id of seatIds) clocks[id] = initialClock(config, id);
  return {
    mode: config.mode,
    config,
    status: "idle",
    clocks,
    holder: null,
    runningSince: null,
    responseStack: [],
    ...(config.match
      ? {
          match: {
            totalMs: config.match.totalMs,
            remainingMs: config.match.totalMs,
            extraTurnsRemaining: config.match.extraTurns,
          },
        }
      : {}),
  };
}

export function initialClock(config: TimerConfig, seatId?: SeatIdLike): SeatClock {
  const clock: SeatClock = {
    bankMs: initialBankMs(config, seatId),
    usedMs: 0,
    turnUsedMs: 0,
    state: "normal",
  };
  if (perTurnMode(config.mode)) {
    const turnMs = seatAllotmentMs(config, seatId);
    if (turnMs !== config.perTurnMs) clock.turnMs = turnMs;
  }
  return clock;
}

/** TMR-060: a clock's per-turn allowance. */
export function clockTurnMs(c: Pick<SeatClock, "turnMs">, config: TimerConfig): number {
  return c.turnMs ?? config.perTurnMs;
}
