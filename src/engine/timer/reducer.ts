/**
 * Timer reducer seam (TMR-050). W1 stub: returns `game` unchanged for every action.
 * The TIMER-CORE lane implements the transitions here.
 *
 * Called by the main reducer (after the core counter/turn reduction, before threshold
 * evaluation) for every TimerAction and for the hook actions in TIMER_HOOK_ACTIONS
 * (START_GAME, PASS_TURN, ELIMINATE, CONCEDE, REVIVE, RESET_GAME, SEAT_ADD, SEAT_REMOVE,
 * RESOLVE_PROMPT, END_GAME). `prev` is the game before the action (e.g. who held the turn before
 * PASS_TURN).
 */
import type { Game, GameAction, TimerAction } from "../types";

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

export function reduceTimer(game: Game, _action: GameAction, _now: number, _prev?: Game): Game {
  return game;
}
