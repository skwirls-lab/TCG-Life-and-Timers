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
  responses: ResponseMode;
  passMode: PassMode;
  autoPauseBackground: boolean;
  autoPauseMenus: boolean;
  showTenths: boolean;
  showTurnTime: boolean;
  /** Optional global round timer, combinable with any per-seat mode. */
  match?: MatchTimerConfig;
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
}

const MIN = 60_000;

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

/** Starting bank for a seat under a config (count-up starts at 0). */
export function initialBankMs(config: TimerConfig): number {
  switch (config.mode) {
    case "off":
    case "countup":
      return 0;
    case "perTurn":
      return config.perTurnMs;
    case "perTurnReserve":
      return config.reserveMs;
    default:
      return config.bankMs;
  }
}

/** Fresh idle timer state for a set of seats (used by createGame / RESET_GAME / SEAT_ADD). */
export function initialTimerState(config: TimerConfig, seatIds: readonly SeatIdLike[]): TimerState {
  const clocks: Record<SeatIdLike, SeatClock> = {};
  for (const id of seatIds) clocks[id] = initialClock(config);
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

export function initialClock(config: TimerConfig): SeatClock {
  return { bankMs: initialBankMs(config), usedMs: 0, turnUsedMs: 0, state: "normal" };
}
