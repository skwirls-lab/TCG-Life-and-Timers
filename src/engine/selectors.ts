/** Read-only derived views over a Game (pure). UI lanes should read state through these. */
import { counterKey } from "./keys";
import {
  commanderCount,
  enabledDefs,
  findDef,
  getValue,
  seatKeys,
  sourceCount,
  startValue,
} from "./counters";
import { thresholdFor } from "./thresholds";
import { nextSeat as nextSeatImpl } from "./turn";
import type {
  CounterDefinition,
  CounterId,
  CounterKey,
  EliminationCause,
  Game,
  Preset,
  Seat,
  SeatId,
} from "./types";

export { startValue, thresholdFor };

/** Value for a key (start value when not stored yet). */
export function value(game: Game, key: CounterKey): number {
  return getValue(game, key);
}

/** Value by parts. */
export function counterValue(
  game: Game,
  counterId: CounterId,
  seatId?: SeatId,
  sourceSeatId?: SeatId,
  sourceIndex?: number,
): number {
  return getValue(game, counterKey(counterId, seatId, sourceSeatId, sourceIndex));
}

export function counterDef(
  game: Pick<Game, "preset">,
  counterId: CounterId,
): CounterDefinition | undefined {
  return findDef(game, counterId);
}

/** Enabled counter definitions, in preset order. */
export function enabledCounters(
  game: Pick<Game, "preset" | "enabledCounters">,
): CounterDefinition[] {
  return enabledDefs(game);
}

/** The preset's primary counter (exactly one in valid presets). */
export function primaryCounter(preset: Preset): CounterDefinition {
  const def = preset.counters.find((c) => c.isPrimary);
  if (!def) throw new Error(`Preset ${preset.id} has no primary counter`);
  return def;
}

export function seatById(game: Pick<Game, "seats">, seatId: SeatId): Seat | undefined {
  return game.seats.find((s) => s.id === seatId);
}

export function aliveSeats(game: Pick<Game, "seats">): Seat[] {
  return game.seats.filter((s) => !s.eliminated);
}

/** Next living seat in turn order after `from` (never an eliminated seat; null if none alive). */
export function nextSeat(game: Pick<Game, "seats" | "turn">, from: SeatId): SeatId | null {
  return nextSeatImpl(game, from);
}

export interface CounterView {
  def: CounterDefinition;
  key: CounterKey;
  value: number;
  start: number;
  isDefault: boolean;
  /** Commander index for perCommander counters. */
  sourceIndex?: number;
}

/**
 * One entry per (enabled) player-scope counter instance and token counter for the seat — the
 * counters panel (SEAT-001). Token entries have value 1 when the seat holds the token.
 * Matrix (playerVsOpponent) counters are excluded; use commanderDamageGrid.
 */
export function seatCounters(game: Game, seatId: SeatId): CounterView[] {
  const seat = seatById(game, seatId);
  if (!seat) return [];
  const out: CounterView[] = [];
  for (const def of enabledDefs(game)) {
    if (def.scope === "token") {
      const held = game.tokens[def.id] === seatId ? 1 : 0;
      out.push({
        def,
        key: counterKey(def.id, seatId),
        value: held,
        start: 0,
        isDefault: held === 0,
      });
      continue;
    }
    if (def.scope !== "player") continue;
    const start = startValue(game, def, seatId);
    seatKeys(game, def, seat).forEach((key, i) => {
      const v = getValue(game, key);
      out.push({
        def,
        key,
        value: v,
        start,
        isDefault: v === start,
        ...(def.perCommander ? { sourceIndex: i } : {}),
      });
    });
  }
  return out;
}

export type BadgeMode = "nonDefault" | "always" | "hidden";

/**
 * LIFE-002 badges for a seat: counters with visibility 'badge' that are non-default (or
 * showWhenDefault, or mode 'always'). Tokens appear only on the holder. Global counters are not
 * seat badges (they render in the toolbar).
 */
export function visibleBadges(
  game: Game,
  seatId: SeatId,
  mode: BadgeMode = "nonDefault",
): CounterView[] {
  if (mode === "hidden") return [];
  return seatCounters(game, seatId).filter((v) => {
    if (v.def.isPrimary || v.def.visibility !== "badge") return false;
    if (v.def.scope === "token") return v.value === 1;
    return mode === "always" || !v.isDefault || v.def.showWhenDefault === true;
  });
}

function matrixDef(game: Game, counterId?: CounterId): CounterDefinition | undefined {
  if (counterId !== undefined) return findDef(game, counterId);
  return enabledDefs(game).find((d) => d.scope === "playerVsOpponent");
}

/** Commander damage `target` received from `source`'s commander `index` (CMD-001). */
export function commanderDamageFrom(
  game: Game,
  targetSeatId: SeatId,
  sourceSeatId: SeatId,
  index = 0,
  counterId?: CounterId,
): number {
  const def = matrixDef(game, counterId);
  if (!def) return 0;
  return getValue(game, counterKey(def.id, targetSeatId, sourceSeatId, index));
}

export interface DamageCell {
  sourceSeatId: SeatId;
  sourceIndex: number;
  value: number;
  /** The target's own cell ("me", self-inflicted). */
  self: boolean;
}

/** CMD-002 mini grid: one cell per (source seat × commander) in seat order. */
export function commanderDamageGrid(
  game: Game,
  targetSeatId: SeatId,
  counterId?: CounterId,
): DamageCell[] {
  const def = matrixDef(game, counterId);
  if (!def || !seatById(game, targetSeatId)) return [];
  const out: DamageCell[] = [];
  for (const src of game.seats) {
    const n = sourceCount(game, def, src);
    for (let i = 0; i < n; i++) {
      out.push({
        sourceSeatId: src.id,
        sourceIndex: i,
        value: getValue(game, counterKey(def.id, targetSeatId, src.id, i)),
        self: src.id === targetSeatId,
      });
    }
  }
  return out;
}

/** Number of commander sources a seat has (2 with partners). */
export function commanderSources(game: Game, seatId: SeatId): number {
  const seat = seatById(game, seatId);
  return seat ? commanderCount(game, seat) : 0;
}

/** CMD-010: commander tax display: casts and tax (= casts × taxMultiplier, default 2). */
export function taxDisplay(
  game: Game,
  seatId: SeatId,
  commanderIndex = 0,
  counterId?: CounterId,
): { casts: number; tax: number } {
  const def =
    counterId !== undefined
      ? findDef(game, counterId)
      : enabledDefs(game).find((d) => d.category === "tax" && d.scope === "player");
  if (!def) return { casts: 0, tax: 0 };
  const casts = getValue(
    game,
    counterKey(def.id, seatId, undefined, def.perCommander ? commanderIndex : undefined),
  );
  return { casts, tax: casts * (def.taxMultiplier ?? 2) };
}

export interface Standing {
  seat: Seat;
  value: number;
  winner: boolean;
  eliminated: boolean;
}

/**
 * HIST-010 standings: winners first, then living seats by primary value ("better" first, derived
 * from the primary threshold: life ≤ 0 lose → higher is better; prizes ≤ 0 win → lower is better),
 * then eliminated seats, most recently eliminated first.
 */
export function standings(game: Game): Standing[] {
  const primary = game.preset.counters.find((c) => c.isPrimary);
  const winners = new Set(game.result?.winners ?? []);
  const rule = primary?.threshold;
  const higherBetter = rule
    ? (rule.comparator === "<=") === (rule.outcome === "lose")
    : primary?.direction !== "down";
  const elimIndex = new Map(game.eliminations.map((e, i) => [e.seatId, i]));
  const rows = game.seats.map((seat) => ({
    seat,
    value: primary ? getValue(game, counterKey(primary.id, seat.id)) : 0,
    winner: winners.has(seat.id),
    eliminated: seat.eliminated,
  }));
  return rows.sort((a, b) => {
    if (a.winner !== b.winner) return a.winner ? -1 : 1;
    if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
    if (a.eliminated) return (elimIndex.get(b.seat.id) ?? 0) - (elimIndex.get(a.seat.id) ?? 0);
    return higherBetter ? b.value - a.value : a.value - b.value;
  });
}

export interface CauseDescription {
  kind: EliminationCause["kind"];
  counterId?: CounterId;
  counterName?: string;
  /** Value that met the threshold (e.g. 21). */
  value?: number;
  sourceSeatId?: SeatId;
  sourceName?: string;
  /** Commander name for matrix causes (e.g. "A" in "21 commander damage from Conner (A)"). */
  commanderName?: string;
}

/** Structured data for an elimination cause; the UI formats it with i18n. */
export function describeCause(
  game: Game,
  seatId: SeatId,
  cause: EliminationCause,
): CauseDescription {
  if (cause.kind !== "threshold") return { kind: cause.kind };
  const def = findDef(game, cause.counterId);
  const out: CauseDescription = { kind: "threshold", counterId: cause.counterId };
  if (def) out.counterName = def.name;
  if (cause.sourceSeatId !== undefined) {
    const src = seatById(game, cause.sourceSeatId);
    out.sourceSeatId = cause.sourceSeatId;
    if (src) {
      out.sourceName = src.name;
      const cmd = src.commanders[cause.sourceIndex ?? 0];
      if (cmd !== undefined) out.commanderName = cmd;
    }
    out.value = getValue(
      game,
      counterKey(cause.counterId, seatId, cause.sourceSeatId, cause.sourceIndex ?? 0),
    );
  } else if (def) {
    out.value = getValue(game, counterKey(def.id, seatId));
  }
  return out;
}

/** HIST-030 active play time up to `now` (idle gaps > options.idleGapMs excluded). */
export function activeDuration(game: Game, now: number): number {
  const { lastAt, activeMs } = game.activity;
  if (lastAt === null) return 0;
  const tail = now - lastAt;
  return activeMs + (tail > 0 && tail <= game.options.idleGapMs ? tail : 0);
}

/** HIST-031: the game has meaningful activity (≥ 3 counter changes or ≥ 5 min active). */
export function hasMeaningfulActivity(game: Game, now: number): boolean {
  return game.activity.changes >= 3 || activeDuration(game, now) >= 5 * 60_000;
}

/** Global counter value (day/night, storm). */
export function globalValue(game: Game, counterId: CounterId): number {
  return getValue(game, counterKey(counterId));
}

/** Current token holder. */
export function tokenHolder(game: Game, counterId: CounterId): SeatId | null {
  return game.tokens[counterId] ?? null;
}

/** Enum label for an enum counter value. */
export function enumLabel(def: CounterDefinition, index: number): string | undefined {
  return def.enumValues?.[index];
}
