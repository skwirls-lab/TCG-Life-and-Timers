/**
 * Engine domain types — PRD §6 (domain model), §8 (life/counter features), §10.1 (presets).
 * Pure data: everything here is JSON-serializable. Mirrored by Zod schemas in `./schemas.ts`.
 */
import type { TimerConfig, TimerState } from "./timer/types";

export type SeatId = string;
export type CounterId = string;
export type EventId = string;
/** `${counterId}|${seatId}|${sourceSeatId}|${sourceIndex}` (empty segments when absent). See keys.ts. */
export type CounterKey = string;
/** Same values as `@/lib/ui/rotation` Rotation (the engine may not import from lib). */
export type Rotation = 0 | 90 | 180 | 270;

// ---------------------------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------------------------

/** Game icon ids. A UI lane maps ids to SVGs in src/assets/icons/game/. Custom presets pick from this list. */
export const ICON_IDS = [
  "heart",
  "poison",
  "commander",
  "tax",
  "crown",
  "initiative",
  "sun",
  "moon",
  "daynight",
  "energy",
  "exp",
  "treasure",
  "rad",
  "ascend",
  "speed",
  "ring",
  "storm",
  "ko",
  "skull",
  "prize",
  "lore",
  "damage",
  "don",
  "memory",
  "shield",
  "star",
  "coin",
  "flame",
  "droplet",
  "sword",
  "potion",
  "clock",
  "flag",
  "gem",
  "bolt",
  "leaf",
  "book",
  "dice",
  "plus",
  "minus",
] as const;
export type IconId = (typeof ICON_IDS)[number];

// ---------------------------------------------------------------------------------------------
// Counters (§6.2)
// ---------------------------------------------------------------------------------------------

export const COUNTER_SCOPES = ["player", "playerVsOpponent", "global", "token"] as const;
/**
 * - player: one value per seat (life, poison, energy)
 * - playerVsOpponent: matrix per (target seat × source seat × source index) — commander damage
 * - global: one value for the game (day/night, storm)
 * - token: exclusive marker held by at most one seat (monarch, initiative)
 */
export type CounterScope = (typeof COUNTER_SCOPES)[number];

export const COUNTER_KINDS = ["number", "boolean", "enum", "token"] as const;
/** boolean values are stored as 0/1; enum values are stored as the index into `enumValues`. */
export type CounterKind = (typeof COUNTER_KINDS)[number];

/** Drives history delta-chip colors (HIST-011) and settings grouping. */
export const COUNTER_CATEGORIES = [
  "life",
  "poison",
  "commander",
  "tax",
  "resource",
  "status",
  "score",
  "damage",
  "other",
] as const;
export type CounterCategory = (typeof COUNTER_CATEGORIES)[number];

export const COUNTER_VISIBILITIES = ["board", "badge", "panel"] as const;
/** board = big on the seat; badge = small badge when non-default; panel = counters panel only. */
export type CounterVisibility = (typeof COUNTER_VISIBILITIES)[number];

export const COUNTER_DISPLAYS = ["number", "pips", "track"] as const;
export type CounterDisplay = (typeof COUNTER_DISPLAYS)[number];

export const AUTO_KO_MODES = ["auto", "prompt", "off"] as const;
export type AutoKOMode = (typeof AUTO_KO_MODES)[number];

export interface ThresholdRule {
  comparator: "<=" | ">=";
  /** e.g. life <= 0, poison >= 10, commander damage >= 21 (from a single source). */
  value: number;
  outcome: "lose" | "win";
  /** playerVsOpponent: evaluate each (source seat, source index) cell independently. */
  perSource?: boolean;
  /** Per-rule override of the game-level `options.autoKO`. */
  autoApply?: AutoKOMode;
  /** Setup may offer per-seat threshold overrides for this rule (PRE-013, e.g. SWU base HP). */
  perSeatOverride?: boolean;
}

export interface CounterLink {
  /** Counter changed alongside this one (same target seat), e.g. commander damage → life. */
  counterId: CounterId;
  /** −1 → +1 commander damage applies −1 life. */
  factor: number;
  /** When true the link is gated by `options.commanderDamageLifeLoss` (CMD-004). */
  optional: boolean;
}

export interface CounterDefinition {
  /** Stable, human-readable, e.g. 'mtg.poison'. Must not contain '|'. */
  id: CounterId;
  name: string;
  /** e.g. 'C.Tax' for small badges. */
  shortName?: string;
  icon: IconId;
  kind: CounterKind;
  scope: CounterScope;
  category: CounterCategory;
  /** The big number on the seat. Exactly one per preset (scope player, kind number). */
  isPrimary?: boolean;
  /** Starting value (overridable per game). enum: index; boolean: 0/1; token: ignored. */
  start: number;
  /** null/undefined = unbounded. */
  min?: number | null;
  max?: number | null;
  /** Tap step (Yu-Gi-Oh LP 100). */
  step: number;
  /** Press-and-hold step (default 10 for life). */
  holdStep?: number;
  /** Which way progress toward the threshold goes; drives UI emphasis. */
  direction: "up" | "down";
  /** kind 'enum': state labels. */
  enumValues?: string[];
  /** kind 'enum': ENUM_NEXT wraps to this index (day/night: 1, so it never returns to Neither). Default 0. */
  enumCycleFrom?: number;
  /** playerVsOpponent: sources per opponent (1 normally; partners raise it to 2 per seat). */
  sourcesPerOpponent?: number;
  /** scope player: one value per commander of the seat (commander tax ×2 for partners). Uses sourceIndex. */
  perCommander?: boolean;
  linkedTo?: CounterLink;
  threshold?: ThresholdRule;
  visibility: CounterVisibility;
  /** Badges are hidden while at the start value unless true. */
  showWhenDefault?: boolean;
  /** Optional counters can be toggled on per game. */
  enabledByDefault: boolean;
  description?: string;
  display?: CounterDisplay;
  /** Reset to start on PASS_TURN (per-player: for the seat whose turn ended; global: always). */
  resetOnTurnPass?: boolean;
  /** Booleans in the same group for the same seat are mutually exclusive (Asleep/Confused/Paralyzed). */
  exclusiveGroup?: string;
  /** The rule value needs owner verification (⚠ VERIFY in the PRD). */
  verify?: boolean;
  /** Display multiplier: commander tax shows casts × 2. */
  taxMultiplier?: number;
}

// ---------------------------------------------------------------------------------------------
// Presets (§10.1)
// ---------------------------------------------------------------------------------------------

export const PRESET_CAPABILITIES = [
  "commanderDamage",
  "partners",
  "commanderTax",
  "dayNight",
  "monarch",
  "initiative",
  "perTurnFlags",
  "calculator",
  "coinFlipProminent",
  "perSeatStart",
  "manaPool",
  "firstTurnReminder",
] as const;
export type PresetCapability = (typeof PRESET_CAPABILITIES)[number];

export const FIRST_PLAYER_RULES = ["random", "choose", "loser", "winner", "rolloff"] as const;
export type FirstPlayerRule = (typeof FIRST_PLAYER_RULES)[number];

export const TURN_ORDERS = ["clockwise", "counterclockwise"] as const;
export type TurnOrder = (typeof TURN_ORDERS)[number];

/** Game-scope options (§13.1-A/B). Defaults in `defaultGameOptions()`. */
export interface GameOptions {
  autoKO: AutoKOMode;
  autoRevive: boolean;
  commanderDamageLifeLoss: boolean;
  partnersAllowed: boolean;
  turnTracking: boolean;
  historyEnabled: boolean;
  turnOrder: TurnOrder;
  firstPlayerRule: FirstPlayerRule;
  /** CUS-008: counters with resetOnTurnPass reset on PASS_TURN. */
  resetPerTurnFlags: boolean;
  /** INP-007: tap the number to open the calculator. */
  tapForCalculator: boolean;
  /** Pokémon first-turn hint. */
  firstTurnReminder: boolean;
  /** INP-006: consecutive changes to the same counter within this window merge into one log entry. */
  batchWindowMs: number;
  /** HIST-030: gaps longer than this are excluded from active play time. */
  idleGapMs: number;
}

export interface PresetDefaults {
  /** Player count → layout id. */
  layoutByPlayers?: Record<string, string>;
  timer: TimerConfig;
  firstPlayerRule: FirstPlayerRule;
  options?: Partial<GameOptions>;
}

export interface Preset {
  id: string;
  version: number;
  name: string;
  /** 'Magic: The Gathering' */
  game: string;
  /** 'Commander' */
  format?: string;
  description: string;
  /** PRE-012 rules quick ref (win/loss conditions). */
  rulesSummary: string;
  rulesUrl?: string;
  minPlayers: number;
  maxPlayers: number;
  defaultPlayers: number;
  counters: CounterDefinition[];
  /** Chip row values for the primary start ("Starting life"). */
  quickStartValues?: number[];
  capabilities: PresetCapability[];
  defaults: PresetDefaults;
  builtIn: boolean;
  premium?: boolean;
  /** Not shown in pickers (P2 stubs). */
  hidden?: boolean;
  deferred?: "P2";
}

// ---------------------------------------------------------------------------------------------
// Seats
// ---------------------------------------------------------------------------------------------

export const ART_KINDS = ["gradient", "solid", "scryfall", "upload", "default"] as const;
export type ArtKind = (typeof ART_KINDS)[number];

export interface ArtFocal {
  x: number;
  y: number;
  zoom: number;
}

export interface ArtRef {
  kind: ArtKind;
  /** gradient/solid: CSS value or palette id; scryfall: image URL or card id; upload: art table id. */
  value: string;
  focal?: ArtFocal;
  artist?: string;
  cardName?: string;
}

export type EliminationCause =
  | { kind: "threshold"; counterId: CounterId; sourceSeatId?: SeatId; sourceIndex?: number }
  | { kind: "concede" }
  | { kind: "time" }
  | { kind: "manual" };

export interface Seat {
  id: SeatId;
  name: string;
  profileId?: string;
  deckId?: string;
  deckName?: string;
  /** Commander names; length 2 = partners (CMD-003). */
  commanders: string[];
  art?: ArtRef;
  color: string;
  /** P2 teams. */
  teamId?: string;
  eliminated: boolean;
  eliminatedCause?: EliminationCause;
  /** Manual rotation override (LAY-004); layout-derived otherwise. */
  rotationOverride?: Rotation;
  /** SET-003 stronger scrim. */
  contrast: boolean;
}

/** Input for createGame / SEAT_ADD. Anything omitted gets a default. */
export interface SeatInput {
  id?: SeatId;
  name?: string;
  profileId?: string;
  deckId?: string;
  deckName?: string;
  commanders?: string[];
  art?: ArtRef;
  color?: string;
  teamId?: string;
  rotationOverride?: Rotation;
  contrast?: boolean;
}

// ---------------------------------------------------------------------------------------------
// Game (§6.3)
// ---------------------------------------------------------------------------------------------

export const GAME_STATUSES = ["setup", "ready", "running", "paused", "ended"] as const;
export type GameStatus = (typeof GAME_STATUSES)[number];

export interface TurnState {
  /** Actual traversal order (seat order, reversed when counterclockwise). Includes eliminated seats. */
  order: SeatId[];
  firstSeat: SeatId;
  activeSeat: SeatId;
  /** Starts at 1. */
  turnNumber: number;
  /** Starts at 1; increments when the turn wraps past the first seat. */
  round: number;
  /** When the active seat's turn began (null before START_GAME). */
  turnStartedAt: number | null;
  /** Turns taken per seat (TURN-002). */
  turnsTaken: Record<SeatId, number>;
  /** firstPlayerRule 'choose': the UI should ask (cleared by SET_FIRST_PLAYER). */
  awaitingFirstPlayer: boolean;
  /** firstPlayerRule 'rolloff': d20 rolls per seat, one entry per roll-off round (ties reroll). */
  rolloff?: Record<SeatId, number[]>;
}

export interface EliminationRecord {
  seatId: SeatId;
  /** Kept so removed seats (SEAT_REMOVE) stay readable in history. */
  name: string;
  cause: EliminationCause;
  turn: number;
  round: number;
  at: number;
  /** The seat was removed from the table (LAY-009). */
  removed?: boolean;
}

export type GameEndReason = "lastStanding" | "winThreshold" | "manual";

export interface GameResult {
  /** Empty = draw / no winner. */
  winners: SeatId[];
  /** Elimination order with causes. */
  eliminated: EliminationRecord[];
  endedAt: number;
  reason: GameEndReason;
}

/** Summary of the previous game, used by firstPlayerRule 'loser' / 'winner'. */
export interface PreviousResult {
  winners: SeatId[];
  /** First seat eliminated ("loser"). */
  firstEliminated?: SeatId;
}

export type PromptKind = "eliminate" | "win";

/** autoKO 'prompt' (and per-rule autoApply 'prompt'): ask before applying a threshold. */
export interface PendingPrompt {
  id: string;
  kind: PromptKind;
  seatId: SeatId;
  /** The trigger (threshold) that raised it. */
  trigger: string;
  cause: EliminationCause;
  at: number;
}

export interface GameActivity {
  /** Number of logged counter changes (HIST-031 "meaningful activity"). */
  changes: number;
  /** Time of the last logged event. */
  lastAt: number | null;
  /** Sum of gaps between events, excluding gaps > options.idleGapMs (HIST-030). */
  activeMs: number;
}

export const EVENT_KINDS = [
  "counter",
  "token",
  "eliminate",
  "revive",
  "concede",
  "gameEnd",
  "start",
  "turn",
  "reset",
  "firstPlayer",
  "seatAdd",
  "seatRemove",
  "seatReorder",
  "note",
  "dice",
  "coin",
  "random",
  "timer",
] as const;
export type GameEventKind = (typeof EVENT_KINDS)[number];

export type EventMetaValue = string | number | boolean | null;

export interface GameEvent {
  id: EventId;
  /** First occurrence (epoch ms). */
  at: number;
  /** Last merge time for batched events (INP-006). */
  updatedAt?: number;
  kind: GameEventKind;
  seatId?: SeatId;
  sourceSeatId?: SeatId;
  sourceIndex?: number;
  counterId?: CounterId;
  delta?: number;
  from?: number;
  to?: number;
  /** Groups linked effects (life change linked to commander damage → the damage event). */
  linkedTo?: EventId;
  meta?: Record<string, EventMetaValue>;
}

export interface Game {
  schemaVersion: number;
  id: string;
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
  /** Frozen preset snapshot (preset updates never break saved games). */
  preset: Preset;
  seats: Seat[];
  layoutId: string;
  options: GameOptions;
  /** Per-game start override (GAME-013), e.g. life 30. */
  startOverrides: Record<CounterId, number>;
  /** Per-game threshold value override; null disables the threshold. */
  thresholdOverrides: Record<CounterId, number | null>;
  /** PRE-013 per-seat start values. */
  perSeatStart: Record<SeatId, Record<CounterId, number>>;
  /** PRE-013 per-seat threshold values (null disables for that seat). */
  perSeatThreshold: Record<SeatId, Record<CounterId, number | null>>;
  /** Counter ids enabled for this game. */
  enabledCounters: CounterId[];
  values: Record<CounterKey, number>;
  /** Token holder per token counter id. */
  tokens: Record<CounterId, SeatId | null>;
  turn: TurnState;
  timer: TimerState;
  status: GameStatus;
  result?: GameResult;
  /** Current elimination order (mirrors seats[].eliminated). */
  eliminations: EliminationRecord[];
  pendingPrompts: PendingPrompt[];
  /** Threshold triggers the user overrode (manual revive / declined prompt); cleared when they stop holding. */
  suppressedTriggers: string[];
  log: GameEvent[];
  /** Monotonic event id counter. */
  seq: number;
  activity: GameActivity;
  /** Result summary of the game before the last RESET_GAME. */
  previous?: PreviousResult;
}

// ---------------------------------------------------------------------------------------------
// Game creation
// ---------------------------------------------------------------------------------------------

export interface NewGameConfig {
  id?: string;
  preset: Preset;
  /** Defaults to preset.defaultPlayers (or seats.length). 1–8. */
  players?: number;
  seats?: SeatInput[];
  layoutId?: string;
  options?: Partial<GameOptions>;
  timer?: Partial<TimerConfig>;
  startOverrides?: Record<CounterId, number>;
  thresholdOverrides?: Record<CounterId, number | null>;
  perSeatStart?: Record<SeatId, Record<CounterId, number>>;
  perSeatThreshold?: Record<SeatId, Record<CounterId, number | null>>;
  /** Defaults to the counters with enabledByDefault. */
  enabledCounters?: CounterId[];
  /** For firstPlayerRule 'loser' / 'winner' (seat ids must match this game's seats). */
  previousResult?: PreviousResult;
  /** Explicit first seat (overrides the rule). */
  firstSeatId?: SeatId;
}

// ---------------------------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------------------------

export type NoteKind = "dice" | "coin" | "random" | "note";

type Timed = { now: number };
/** Actions that don't need time may still carry it (the store injects `now` into every action). */
type MaybeTimed = { now?: number };

export type CounterAction =
  | ({
      type: "COUNTER_ADD";
      counterId: CounterId;
      seatId?: SeatId;
      sourceSeatId?: SeatId;
      sourceIndex?: number;
      delta: number;
    } & Timed)
  | ({
      type: "COUNTER_SET";
      counterId: CounterId;
      seatId?: SeatId;
      sourceSeatId?: SeatId;
      sourceIndex?: number;
      value: number;
    } & Timed)
  | ({ type: "BOOL_TOGGLE"; counterId: CounterId; seatId?: SeatId; value?: boolean } & Timed)
  | ({ type: "ENUM_NEXT"; counterId: CounterId; seatId?: SeatId } & Timed)
  | ({ type: "ENUM_SET"; counterId: CounterId; seatId?: SeatId; index: number } & Timed)
  | ({ type: "TOKEN_GIVE"; counterId: CounterId; seatId: SeatId | null } & Timed)
  | ({ type: "TOKEN_CLEAR"; counterId: CounterId } & Timed)
  | ({
      type: "CMD_DAMAGE_ADD";
      /** Defaults to the first enabled playerVsOpponent counter. */
      counterId?: CounterId;
      targetSeatId: SeatId;
      sourceSeatId: SeatId;
      sourceIndex: number;
      delta: number;
    } & Timed)
  | ({
      type: "CMD_TAX_CAST";
      /** Defaults to the first enabled perCommander 'tax' counter. */
      counterId?: CounterId;
      seatId: SeatId;
      commanderIndex: number;
      /** +1 cast / −1 cast. */
      delta: number;
    } & Timed)
  | ({ type: "COUNTER_ENABLE"; counterId: CounterId; enabled: boolean } & MaybeTimed);

export type LifecycleAction =
  | ({ type: "ELIMINATE"; seatId: SeatId; cause?: EliminationCause } & Timed)
  | ({ type: "REVIVE"; seatId: SeatId } & Timed)
  | ({ type: "CONCEDE"; seatId: SeatId } & Timed)
  | ({ type: "RESOLVE_PROMPT"; promptId: string; accept: boolean } & Timed)
  | ({ type: "END_GAME"; winners: SeatId[] } & Timed)
  | ({ type: "RESET_GAME" } & Timed)
  | ({ type: "SET_FIRST_PLAYER"; seatId: SeatId } & Timed)
  | ({ type: "START_GAME" } & Timed)
  | ({ type: "PASS_TURN" } & Timed)
  | ({
      type: "LOG_NOTE";
      kind: NoteKind;
      text?: string;
      seatId?: SeatId;
      meta?: Record<string, EventMetaValue>;
    } & Timed);

export type SeatAction =
  | ({ type: "SEAT_RENAME"; seatId: SeatId; name: string } & MaybeTimed)
  | ({ type: "SEAT_SET_ART"; seatId: SeatId; art?: ArtRef } & MaybeTimed)
  | ({ type: "SEAT_SET_COLOR"; seatId: SeatId; color: string } & MaybeTimed)
  | ({ type: "SEAT_SET_COMMANDERS"; seatId: SeatId; commanders: string[] } & MaybeTimed)
  | ({
      type: "SEAT_SET_PROFILE";
      seatId: SeatId;
      profileId?: string;
      deckId?: string;
      deckName?: string;
      name?: string;
    } & MaybeTimed)
  | ({ type: "SEAT_SET_ROTATION"; seatId: SeatId; rotation?: Rotation } & MaybeTimed)
  | ({ type: "SEAT_SET_CONTRAST"; seatId: SeatId; contrast: boolean } & MaybeTimed)
  | ({ type: "SEAT_REORDER"; order: SeatId[] } & Timed)
  | ({ type: "SEAT_ADD"; seat?: SeatInput; index?: number } & Timed)
  | ({ type: "SEAT_REMOVE"; seatId: SeatId } & Timed);

export type SetOptionAction = {
  [K in keyof GameOptions]: { type: "SET_OPTION"; key: K; value: GameOptions[K]; now?: number };
}[keyof GameOptions];

export type HistoryAction =
  | ({ type: "UNDO" } & MaybeTimed)
  | ({ type: "REDO" } & MaybeTimed)
  | ({ type: "UNDO_TO"; eventId: EventId } & MaybeTimed);

/** Timer transitions (TMR-050). Implemented by the TIMER-CORE lane in timer/reducer.ts. */
export type TimerAction =
  | ({ type: "TIMER_RESPOND"; seatId: SeatId } & Timed)
  | ({ type: "TIMER_PASS_BACK"; seatId: SeatId } & Timed)
  | ({ type: "TIMER_RETURN_TO_ACTIVE" } & Timed)
  | ({ type: "TIMER_PAUSE"; reason?: "user" | "background" | "setup" | "menu" } & Timed)
  | ({ type: "TIMER_RESUME" } & Timed)
  | ({ type: "TIMER_ADJUST"; seatId: SeatId; deltaMs: number } & Timed)
  | ({ type: "TIMER_SET"; seatId: SeatId; bankMs: number } & Timed)
  | ({ type: "TIMER_TIMEOUT"; seatId: SeatId } & Timed)
  | ({ type: "TIMER_SET_CONFIG"; config: Partial<TimerConfig> } & Timed);

export type GameAction =
  CounterAction | LifecycleAction | SeatAction | SetOptionAction | HistoryAction | TimerAction;

export type GameActionType = GameAction["type"];
