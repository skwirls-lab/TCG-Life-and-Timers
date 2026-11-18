/**
 * Zod 4 schemas mirroring `./types.ts` and `./timer/types.ts` (PRE-001, ARCH-006 load validation).
 * Compile-time checks at the bottom keep the schemas and the hand-written types in sync.
 */
import { z } from "zod";
import {
  ART_KINDS,
  ART_ORIGINS,
  AUTO_KO_MODES,
  COUNTER_CATEGORIES,
  COUNTER_DISPLAYS,
  COUNTER_KINDS,
  COUNTER_SCOPES,
  COUNTER_VISIBILITIES,
  EVENT_KINDS,
  FIRST_PLAYER_RULES,
  GAME_STATUSES,
  ICON_IDS,
  PRESET_CAPABILITIES,
  TURN_ORDERS,
  type ArtRef,
  type CounterDefinition,
  type EliminationCause,
  type Game,
  type GameAction,
  type GameEvent,
  type GameOptions,
  type NewGameConfig,
  type Preset,
  type Seat,
  type SeatInput,
  type ThresholdRule,
} from "./types";
import {
  BLOCKERS_END_REASONS,
  BLOCKERS_TIMEOUTS,
  CLOCK_STATES,
  FINAL_ACTIONS,
  PASS_MODES,
  PAUSE_REASONS,
  RESPONSE_MODES,
  TIMEOUT_ACTIONS,
  TIMER_MODES,
  TIMER_STATUSES,
  type TimerConfig,
  type TimerState,
} from "./timer/types";

export { GAME_SCHEMA_VERSION } from "./options";

const int = () => z.number().int();
const nonNegInt = () => z.number().int().nonnegative();
const ms = () => z.number().int().nonnegative();
const id = () => z.string().min(1);
const counterIdSchema = z
  .string()
  .min(1)
  .regex(/^[^|]+$/, "counter ids may not contain '|'");

// ---------------------------------------------------------------------------------------------
// Timer
// ---------------------------------------------------------------------------------------------

export const TimerConfigSchema = z.object({
  mode: z.enum(TIMER_MODES),
  bankMs: ms(),
  incrementMs: ms(),
  delayMs: ms(),
  perTurnMs: ms(),
  reserveMs: ms(),
  graceMs: ms(),
  timeoutAction: z.enum(TIMEOUT_ACTIONS),
  addOnceMs: ms(),
  finalAction: z.enum(FINAL_ACTIONS).optional(),
  warningsMs: z.array(ms()),
  warnings: z
    .array(z.object({ ms: ms(), sound: z.boolean(), vibrate: z.boolean(), flash: z.boolean() }))
    .optional(),
  responses: z.enum(RESPONSE_MODES),
  passMode: z.enum(PASS_MODES),
  autoPauseBackground: z.boolean(),
  autoPauseMenus: z.boolean(),
  showTenths: z.boolean(),
  showTurnTime: z.boolean(),
  match: z.object({ totalMs: ms(), extraTurns: nonNegInt() }).optional(),
  seatExtraMs: z.record(z.string(), z.number().int()).optional(),
  blockersWindow: z.boolean().optional(),
  blockersMs: ms().optional(),
  blockersTimeout: z.enum(BLOCKERS_TIMEOUTS).optional(),
});

export const SeatClockSchema = z.object({
  bankMs: z.number(),
  graceMs: z.number().optional(),
  usedMs: z.number().nonnegative(),
  turnUsedMs: z.number().nonnegative(),
  state: z.enum(CLOCK_STATES),
  addOnceUsed: z.boolean().optional(),
  turnMs: z.number().nonnegative().optional(),
});

export const TimerStateSchema = z.object({
  mode: z.enum(TIMER_MODES),
  config: TimerConfigSchema,
  status: z.enum(TIMER_STATUSES),
  clocks: z.record(z.string(), SeatClockSchema),
  holder: z.string().nullable(),
  runningSince: z.number().nullable(),
  responseStack: z.array(z.string()),
  pausedReason: z.enum(PAUSE_REASONS).optional(),
  match: z
    .object({
      totalMs: z.number(),
      remainingMs: z.number(),
      extraTurnsRemaining: nonNegInt().optional(),
    })
    .optional(),
  holdFreeMs: z.number().nonnegative().optional(),
  turnNumber: z.number().int().positive().optional(),
  blockers: z
    .object({
      seatId: z.string(),
      durationMs: z.number().nonnegative(),
      remainingMs: z.number(),
      startedAt: z.number(),
      expired: z.boolean().optional(),
    })
    .optional(),
});

// ---------------------------------------------------------------------------------------------
// Counters & presets
// ---------------------------------------------------------------------------------------------

export const ThresholdRuleSchema = z.object({
  comparator: z.enum(["<=", ">="]),
  value: z.number(),
  outcome: z.enum(["lose", "win"]),
  perSource: z.boolean().optional(),
  autoApply: z.enum(AUTO_KO_MODES).optional(),
  perSeatOverride: z.boolean().optional(),
  label: z.string().min(1).max(24).optional(),
});

export const CounterDefinitionSchema = z.object({
  id: counterIdSchema,
  name: z.string().min(1),
  shortName: z.string().min(1).optional(),
  icon: z.enum(ICON_IDS),
  kind: z.enum(COUNTER_KINDS),
  scope: z.enum(COUNTER_SCOPES),
  category: z.enum(COUNTER_CATEGORIES),
  isPrimary: z.boolean().optional(),
  start: z.number(),
  min: z.number().nullable().optional(),
  max: z.number().nullable().optional(),
  step: z.number().positive(),
  holdStep: z.number().positive().optional(),
  direction: z.enum(["up", "down"]),
  enumValues: z.array(z.string().min(1)).min(1).optional(),
  enumCycleFrom: nonNegInt().optional(),
  sourcesPerOpponent: z.number().int().min(1).max(2).optional(),
  perCommander: z.boolean().optional(),
  linkedTo: z
    .object({ counterId: counterIdSchema, factor: z.number(), optional: z.boolean() })
    .optional(),
  threshold: ThresholdRuleSchema.optional(),
  visibility: z.enum(COUNTER_VISIBILITIES),
  showWhenDefault: z.boolean().optional(),
  enabledByDefault: z.boolean(),
  description: z.string().optional(),
  display: z.enum(COUNTER_DISPLAYS).optional(),
  resetOnTurnPass: z.boolean().optional(),
  exclusiveGroup: z.string().min(1).optional(),
  verify: z.boolean().optional(),
  taxMultiplier: z.number().positive().optional(),
});

export const GameOptionsSchema = z.object({
  autoKO: z.enum(AUTO_KO_MODES),
  autoRevive: z.boolean(),
  commanderDamageLifeLoss: z.boolean(),
  partnersAllowed: z.boolean(),
  turnTracking: z.boolean(),
  historyEnabled: z.boolean(),
  turnOrder: z.enum(TURN_ORDERS),
  firstPlayerRule: z.enum(FIRST_PLAYER_RULES),
  resetPerTurnFlags: z.boolean(),
  tapForCalculator: z.boolean(),
  firstTurnReminder: z.boolean(),
  batchWindowMs: ms(),
  idleGapMs: ms(),
  commanderArt: z.boolean().optional(),
});

export const PresetSchema = z.object({
  id: id(),
  version: z.number().int().positive(),
  name: z.string().min(1),
  game: z.string().min(1),
  format: z.string().min(1).optional(),
  description: z.string(),
  rulesSummary: z.string().min(1),
  rulesUrl: z.url().optional(),
  minPlayers: z.number().int().min(1).max(8),
  maxPlayers: z.number().int().min(1).max(8),
  defaultPlayers: z.number().int().min(1).max(8),
  counters: z.array(CounterDefinitionSchema).min(1),
  quickStartValues: z.array(z.number()).optional(),
  capabilities: z.array(z.enum(PRESET_CAPABILITIES)),
  defaults: z.object({
    layoutByPlayers: z.record(z.string(), z.string()).optional(),
    timer: TimerConfigSchema,
    firstPlayerRule: z.enum(FIRST_PLAYER_RULES),
    options: GameOptionsSchema.partial().optional(),
  }),
  builtIn: z.boolean(),
  premium: z.boolean().optional(),
  hidden: z.boolean().optional(),
  deferred: z.literal("P2").optional(),
});

// ---------------------------------------------------------------------------------------------
// Seats & game
// ---------------------------------------------------------------------------------------------

const rotation = z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]);

export const ArtRefSchema = z.object({
  kind: z.enum(ART_KINDS),
  value: z.string(),
  focal: z.object({ x: z.number(), y: z.number(), zoom: z.number().positive() }).optional(),
  artist: z.string().optional(),
  cardName: z.string().optional(),
  origin: z.enum(ART_ORIGINS).optional(),
});

export const EliminationCauseSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("threshold"),
    counterId: counterIdSchema,
    sourceSeatId: z.string().optional(),
    sourceIndex: nonNegInt().optional(),
  }),
  z.object({ kind: z.literal("concede") }),
  z.object({ kind: z.literal("time") }),
  z.object({ kind: z.literal("manual") }),
]);

export const SeatSchema = z.object({
  id: id(),
  name: z.string(),
  profileId: z.string().optional(),
  deckId: z.string().optional(),
  deckName: z.string().optional(),
  commanders: z.array(z.string()).max(2),
  art: ArtRefSchema.optional(),
  color: z.string().min(1),
  teamId: z.string().optional(),
  eliminated: z.boolean(),
  eliminatedCause: EliminationCauseSchema.optional(),
  rotationOverride: rotation.optional(),
  contrast: z.boolean(),
});

export const SeatInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  profileId: z.string().optional(),
  deckId: z.string().optional(),
  deckName: z.string().optional(),
  commanders: z.array(z.string()).max(2).optional(),
  art: ArtRefSchema.optional(),
  color: z.string().optional(),
  teamId: z.string().optional(),
  rotationOverride: rotation.optional(),
  contrast: z.boolean().optional(),
});

const metaValue = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const GameEventSchema = z.object({
  id: id(),
  at: z.number(),
  updatedAt: z.number().optional(),
  kind: z.enum(EVENT_KINDS),
  seatId: z.string().optional(),
  sourceSeatId: z.string().optional(),
  sourceIndex: nonNegInt().optional(),
  counterId: z.string().optional(),
  delta: z.number().optional(),
  from: z.number().optional(),
  to: z.number().optional(),
  linkedTo: z.string().optional(),
  meta: z.record(z.string(), metaValue).optional(),
});

const EliminationRecordSchema = z.object({
  seatId: id(),
  name: z.string(),
  cause: EliminationCauseSchema,
  turn: int(),
  round: int(),
  at: z.number(),
  removed: z.boolean().optional(),
});

const PreviousResultSchema = z.object({
  winners: z.array(z.string()),
  firstEliminated: z.string().optional(),
});

export const GameSchema = z.object({
  schemaVersion: z.number().int().positive(),
  id: id(),
  createdAt: z.number(),
  startedAt: z.number().optional(),
  endedAt: z.number().optional(),
  preset: PresetSchema,
  seats: z.array(SeatSchema).min(1).max(8),
  layoutId: z.string(),
  options: GameOptionsSchema,
  startOverrides: z.record(z.string(), z.number()),
  thresholdOverrides: z.record(z.string(), z.number().nullable()),
  perSeatStart: z.record(z.string(), z.record(z.string(), z.number())),
  perSeatThreshold: z.record(z.string(), z.record(z.string(), z.number().nullable())),
  enabledCounters: z.array(z.string()),
  values: z.record(z.string(), z.number()),
  tokens: z.record(z.string(), z.string().nullable()),
  turn: z.object({
    order: z.array(z.string()),
    firstSeat: z.string(),
    activeSeat: z.string(),
    turnNumber: z.number().int().min(1),
    round: z.number().int().min(1),
    turnStartedAt: z.number().nullable(),
    turnsTaken: z.record(z.string(), nonNegInt()),
    awaitingFirstPlayer: z.boolean(),
    rolloff: z.record(z.string(), z.array(z.number().int().min(1).max(20))).optional(),
  }),
  timer: TimerStateSchema,
  status: z.enum(GAME_STATUSES),
  result: z
    .object({
      winners: z.array(z.string()),
      eliminated: z.array(EliminationRecordSchema),
      endedAt: z.number(),
      reason: z.enum(["lastStanding", "winThreshold", "manual"]),
    })
    .optional(),
  eliminations: z.array(EliminationRecordSchema),
  pendingPrompts: z.array(
    z.object({
      id: id(),
      kind: z.enum(["eliminate", "win"]),
      seatId: z.string(),
      trigger: z.string(),
      cause: EliminationCauseSchema,
      at: z.number(),
    }),
  ),
  suppressedTriggers: z.array(z.string()),
  log: z.array(GameEventSchema),
  seq: nonNegInt(),
  activity: z.object({
    changes: nonNegInt(),
    lastAt: z.number().nullable(),
    activeMs: z.number().nonnegative(),
  }),
  previous: PreviousResultSchema.optional(),
});

export const NewGameConfigSchema = z.object({
  id: z.string().optional(),
  preset: PresetSchema,
  players: z.number().int().min(1).max(8).optional(),
  seats: z.array(SeatInputSchema).optional(),
  layoutId: z.string().optional(),
  options: GameOptionsSchema.partial().optional(),
  timer: TimerConfigSchema.partial().optional(),
  startOverrides: z.record(z.string(), z.number()).optional(),
  thresholdOverrides: z.record(z.string(), z.number().nullable()).optional(),
  perSeatStart: z.record(z.string(), z.record(z.string(), z.number())).optional(),
  perSeatThreshold: z.record(z.string(), z.record(z.string(), z.number().nullable())).optional(),
  enabledCounters: z.array(z.string()).optional(),
  previousResult: PreviousResultSchema.optional(),
  firstSeatId: z.string().optional(),
});

// ---------------------------------------------------------------------------------------------
// Actions (for test hooks / imports). Validated structurally; semantic checks live in the reducer.
// ---------------------------------------------------------------------------------------------

const now = z.number();
const maybeNow = z.number().optional();
const seatId = id();
const optSeat = z.string().optional();

const optionActions = (Object.keys(GameOptionsSchema.shape) as (keyof GameOptions)[]).map((key) =>
  z.object({
    type: z.literal("SET_OPTION"),
    key: z.literal(key),
    value: GameOptionsSchema.shape[key],
    now: maybeNow,
  }),
);

const actionSchemas = [
  z.object({
    type: z.literal("COUNTER_ADD"),
    counterId: counterIdSchema,
    seatId: optSeat,
    sourceSeatId: optSeat,
    sourceIndex: nonNegInt().optional(),
    delta: z.number(),
    now,
  }),
  z.object({
    type: z.literal("COUNTER_SET"),
    counterId: counterIdSchema,
    seatId: optSeat,
    sourceSeatId: optSeat,
    sourceIndex: nonNegInt().optional(),
    value: z.number(),
    now,
  }),
  z.object({
    type: z.literal("BOOL_TOGGLE"),
    counterId: counterIdSchema,
    seatId: optSeat,
    value: z.boolean().optional(),
    now,
  }),
  z.object({ type: z.literal("ENUM_NEXT"), counterId: counterIdSchema, seatId: optSeat, now }),
  z.object({
    type: z.literal("ENUM_SET"),
    counterId: counterIdSchema,
    seatId: optSeat,
    index: nonNegInt(),
    now,
  }),
  z.object({
    type: z.literal("TOKEN_GIVE"),
    counterId: counterIdSchema,
    seatId: z.string().nullable(),
    now,
  }),
  z.object({ type: z.literal("TOKEN_CLEAR"), counterId: counterIdSchema, now }),
  z.object({
    type: z.literal("CMD_DAMAGE_ADD"),
    counterId: counterIdSchema.optional(),
    targetSeatId: seatId,
    sourceSeatId: seatId,
    sourceIndex: nonNegInt(),
    delta: z.number(),
    now,
  }),
  z.object({
    type: z.literal("CMD_TAX_CAST"),
    counterId: counterIdSchema.optional(),
    seatId,
    commanderIndex: nonNegInt(),
    delta: z.number(),
    now,
  }),
  z.object({
    type: z.literal("COUNTER_ENABLE"),
    counterId: counterIdSchema,
    enabled: z.boolean(),
    now: maybeNow,
  }),
  z.object({
    type: z.literal("ELIMINATE"),
    seatId,
    cause: EliminationCauseSchema.optional(),
    now,
  }),
  z.object({ type: z.literal("REVIVE"), seatId, now }),
  z.object({ type: z.literal("CONCEDE"), seatId, now }),
  z.object({ type: z.literal("RESOLVE_PROMPT"), promptId: id(), accept: z.boolean(), now }),
  z.object({ type: z.literal("END_GAME"), winners: z.array(z.string()), now }),
  z.object({ type: z.literal("RESET_GAME"), now }),
  z.object({ type: z.literal("SET_FIRST_PLAYER"), seatId, now }),
  z.object({ type: z.literal("START_GAME"), now }),
  z.object({ type: z.literal("PASS_TURN"), now }),
  z.object({
    type: z.literal("LOG_NOTE"),
    kind: z.enum(["dice", "coin", "random", "note"]),
    text: z.string().optional(),
    seatId: optSeat,
    meta: z.record(z.string(), metaValue).optional(),
    now,
  }),
  z.object({ type: z.literal("SEAT_RENAME"), seatId, name: z.string(), now: maybeNow }),
  z.object({
    type: z.literal("SEAT_SET_ART"),
    seatId,
    art: ArtRefSchema.optional(),
    now: maybeNow,
  }),
  z.object({ type: z.literal("SEAT_SET_COLOR"), seatId, color: z.string(), now: maybeNow }),
  z.object({
    type: z.literal("SEAT_SET_COMMANDERS"),
    seatId,
    commanders: z.array(z.string()),
    now: maybeNow,
  }),
  z.object({
    type: z.literal("SEAT_SET_PROFILE"),
    seatId,
    profileId: z.string().optional(),
    deckId: z.string().optional(),
    deckName: z.string().optional(),
    name: z.string().optional(),
    now: maybeNow,
  }),
  z.object({
    type: z.literal("SEAT_SET_ROTATION"),
    seatId,
    rotation: rotation.optional(),
    now: maybeNow,
  }),
  z.object({ type: z.literal("SEAT_SET_CONTRAST"), seatId, contrast: z.boolean(), now: maybeNow }),
  z.object({ type: z.literal("SEAT_REORDER"), order: z.array(z.string()), now }),
  z.object({
    type: z.literal("SEAT_ADD"),
    seat: SeatInputSchema.optional(),
    index: nonNegInt().optional(),
    now,
  }),
  z.object({ type: z.literal("SEAT_REMOVE"), seatId, now }),
  z.object({ type: z.literal("SET_LAYOUT"), layoutId: id(), now: maybeNow }),
  ...optionActions,
  z.object({ type: z.literal("UNDO"), now: maybeNow }),
  z.object({ type: z.literal("REDO"), now: maybeNow }),
  z.object({ type: z.literal("UNDO_TO"), eventId: id(), now: maybeNow }),
  z.object({ type: z.literal("TIMER_RESPOND"), seatId, now }),
  z.object({ type: z.literal("TIMER_PASS_BACK"), seatId, now }),
  z.object({ type: z.literal("TIMER_RETURN_TO_ACTIVE"), now }),
  z.object({ type: z.literal("TIMER_PAUSE"), reason: z.enum(PAUSE_REASONS).optional(), now }),
  z.object({ type: z.literal("TIMER_RESUME"), now }),
  z.object({ type: z.literal("TIMER_ADJUST"), seatId, deltaMs: z.number(), now }),
  z.object({ type: z.literal("TIMER_SET"), seatId, bankMs: z.number(), now }),
  z.object({ type: z.literal("TIMER_TIMEOUT"), seatId, now }),
  z.object({ type: z.literal("TIMER_SET_CONFIG"), config: TimerConfigSchema.partial(), now }),
  z.object({
    type: z.literal("TIMER_RESET_CLOCKS"),
    config: TimerConfigSchema.partial().optional(),
    now,
  }),
  z.object({ type: z.literal("TIMER_BLOCKERS_START"), durationMs: ms().optional(), now }),
  z.object({
    type: z.literal("TIMER_BLOCKERS_END"),
    reason: z.enum(BLOCKERS_END_REASONS).optional(),
    now,
  }),
] as const;

/**
 * Any GameAction. The cast is needed because SET_OPTION's per-key value typing is generated
 * from GameOptionsSchema.shape at runtime; the per-key schemas still enforce it.
 */
export const GameActionSchema = z.union(actionSchemas) as unknown as z.ZodType<GameAction>;

// ---------------------------------------------------------------------------------------------
// Compile-time sync checks (fail typecheck when a type and its schema drift apart)
// ---------------------------------------------------------------------------------------------

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;

export type SchemaTypeChecks = [
  Assert<Same<z.infer<typeof TimerConfigSchema>, TimerConfig>>,
  Assert<Same<z.infer<typeof TimerStateSchema>, TimerState>>,
  Assert<Same<z.infer<typeof ThresholdRuleSchema>, ThresholdRule>>,
  Assert<Same<z.infer<typeof CounterDefinitionSchema>, CounterDefinition>>,
  Assert<Same<z.infer<typeof GameOptionsSchema>, GameOptions>>,
  Assert<Same<z.infer<typeof PresetSchema>, Preset>>,
  Assert<Same<z.infer<typeof ArtRefSchema>, ArtRef>>,
  Assert<Same<z.infer<typeof EliminationCauseSchema>, EliminationCause>>,
  Assert<Same<z.infer<typeof SeatSchema>, Seat>>,
  Assert<Same<z.infer<typeof SeatInputSchema>, SeatInput>>,
  Assert<Same<z.infer<typeof GameEventSchema>, GameEvent>>,
  Assert<Same<z.infer<typeof GameSchema>, Game>>,
  Assert<Same<z.infer<typeof NewGameConfigSchema>, NewGameConfig>>,
  Assert<Same<z.infer<(typeof actionSchemas)[number]>["type"], GameAction["type"]>>,
];

/** Parse helpers (throwing). */
export const parsePreset = (data: unknown): Preset => PresetSchema.parse(data);
export const parseGame = (data: unknown): Game => GameSchema.parse(data);
