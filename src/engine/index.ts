/**
 * TCG Life & Timers — game engine public API (FROZEN after W1; changes need a DECISIONS entry).
 *
 * Pure TypeScript (ARCH-002): no React/Next/DOM/storage; time comes from `action.now`
 * (ARCH-005) and randomness from an injected `Rng`. Import everything from `@/engine`.
 *
 * Data model (types.ts, mirrored by Zod schemas in schemas.ts)
 *   Preset → CounterDefinition[] (+ ThresholdRule) · Game → Seat[] · values keyed by CounterKey
 *   (`counterKey(counterId, seatId?, sourceSeatId?, sourceIndex?)`) · tokens · turn · timer ·
 *   log: GameEvent[] · result. Booleans are stored as 0/1, enums as the index into enumValues.
 *   Values for keys not yet stored fall back to the start value — always read via selectors.
 *
 * Creating and reducing
 *   createGame(config: NewGameConfig, rng, now) → Game (status 'ready', first player picked)
 *   reduce(game, action, { rng }) → Game                 pure, immutable; invalid actions = no-op
 *   reduceWithMeta(...) → { game, merged }               merged = INP-006 batch extension
 *   createSession(game) / reduceSession(session, action, { rng }) → GameSession
 *     GameSession = { game, past, future } handles UNDO / REDO / UNDO_TO (cap UNDO_LIMIT = 100).
 *     Persist only `session.game`.
 *   Pipeline per action: core → reduceTimer (timer/reducer.ts seam) → thresholds/game end.
 *
 * Actions (GameAction): COUNTER_ADD/SET, BOOL_TOGGLE (exclusiveGroup), ENUM_NEXT/SET,
 *   TOKEN_GIVE/CLEAR, CMD_DAMAGE_ADD (life link: one undo step, two events grouped by linkedTo),
 *   CMD_TAX_CAST, COUNTER_ENABLE, ELIMINATE, REVIVE, CONCEDE, RESOLVE_PROMPT, END_GAME,
 *   RESET_GAME, SET_FIRST_PLAYER, START_GAME, PASS_TURN, LOG_NOTE, SEAT_* (rename, art, color,
 *   commanders, profile, rotation, contrast, reorder, add, remove), SET_LAYOUT, SET_OPTION, UNDO,
 *   REDO, UNDO_TO, TIMER_* (timer/reducer.ts).
 *   Additive W6 changes (DECISIONS): SET_LAYOUT {layoutId} (LAY-003; sticky like the seat
 *   cosmetics: not an undo step, not logged) and TIMER_RESET_CLOCKS {config?} (§13.1-C: back to
 *   an idle timer with the current config + optional patch; one undo step; logs timer "restart").
 *   TimerConfig.warnings (TMR-031 per-threshold sound/vibrate/flash; warningsMs kept). Timer helpers (timer/clock.ts): remaining, timeUsed,
 *   turnTimeUsed, displayMs, holder, matchRemaining, nextSignificantEvent, formatClock, turnStats.
 *
 * Selectors (selectors.ts): value, counterValue, counterDef, enabledCounters, primaryCounter,
 *   seatById, aliveSeats, nextSeat, seatCounters, visibleBadges, commanderDamageFrom,
 *   commanderDamageGrid, commanderSources, taxDisplay, standings, describeCause,
 *   activeDuration, hasMeaningfulActivity, globalValue, tokenHolder, enumLabel, startValue,
 *   thresholdFor.
 *
 * Randomness: Rng { int(maxExclusive) }, cryptoRng(), seededRng(seed), randomId, pick.
 */
export * from "./types";
export * from "./timer/types";
export {
  TimerConfigSchema,
  SeatClockSchema,
  TimerStateSchema,
  ThresholdRuleSchema,
  CounterDefinitionSchema,
  GameOptionsSchema,
  PresetSchema,
  ArtRefSchema,
  EliminationCauseSchema,
  SeatSchema,
  SeatInputSchema,
  GameEventSchema,
  GameSchema,
  NewGameConfigSchema,
  GameActionSchema,
  parsePreset,
  parseGame,
} from "./schemas";
export {
  GAME_SCHEMA_VERSION,
  MAX_SEATS,
  MIN_SEATS,
  SEAT_COLORS,
  UNDO_LIMIT,
  defaultGameOptions,
} from "./options";
export { counterKey, parseCounterKey, keyInvolvesSeat, type ParsedCounterKey } from "./keys";
export { cryptoRng, seededRng, randomId, pick, type Rng } from "./rng";
export { createGame, resetGame, previousResultOf } from "./game";
export { reduce, reduceWithMeta, type ReduceContext, type ReduceResult } from "./reducer";
export {
  createSession,
  reduceSession,
  canUndo,
  canRedo,
  STICKY_ACTIONS,
  PAUSE_ACTIONS,
  type GameSession,
} from "./undo";
export { pickFirstSeat, turnOrderFor } from "./turn";
export {
  eliminateSeat,
  reviveSeat,
  endGame,
  evaluate,
  activeTriggers,
  type Trigger,
} from "./thresholds";
export { clamp, sourceCount, commanderCount } from "./counters";
export {
  reduceTimer,
  syncTimer,
  isTimerAction,
  TIMER_ACTION_TYPES,
  TIMER_HOOK_ACTIONS,
} from "./timer/reducer";
export {
  remaining,
  timeUsed,
  turnTimeUsed,
  displayMs,
  clockDisplayMs,
  clockRemaining,
  clockAt,
  clockState,
  holder,
  isCharging,
  isLimited,
  matchRemaining,
  nextSignificantEvent,
  formatClock,
  turnStats,
  type SignificantEvent,
  type SignificantEventKind,
} from "./timer/clock";
export * from "./selectors";
