/**
 * Counter math: start values, clamping (CTR-002), value keys per seat, linked effects (CTR-005,
 * CMD-004) and INP-006 history batching.
 */
import { counterKey, parseCounterKey } from "./keys";
import { appendEvent, replaceEvents, touchActivity } from "./log";
import type {
  CounterDefinition,
  CounterId,
  CounterKey,
  Game,
  GameEvent,
  Seat,
  SeatId,
} from "./types";

/** Address of one counter value. */
export interface CounterAddress {
  counterId: CounterId;
  seatId?: SeatId;
  sourceSeatId?: SeatId;
  sourceIndex?: number;
}

export function findDef(game: Pick<Game, "preset">, id: CounterId): CounterDefinition | undefined {
  return game.preset.counters.find((c) => c.id === id);
}

export function isEnabled(game: Pick<Game, "enabledCounters">, id: CounterId): boolean {
  return game.enabledCounters.includes(id);
}

/** Enabled definition or undefined. */
export function enabledDef(game: Game, id: CounterId): CounterDefinition | undefined {
  return isEnabled(game, id) ? findDef(game, id) : undefined;
}

export function enabledDefs(game: Pick<Game, "preset" | "enabledCounters">): CounterDefinition[] {
  return game.preset.counters.filter((c) => game.enabledCounters.includes(c.id));
}

type StartSource = Pick<Game, "startOverrides" | "perSeatStart">;

/** Start value with per-seat (PRE-013) and per-game (GAME-013) overrides. */
export function startValue(game: StartSource, def: CounterDefinition, seatId?: SeatId): number {
  if (seatId !== undefined) {
    const perSeat = game.perSeatStart[seatId]?.[def.id];
    if (perSeat !== undefined) return perSeat;
  }
  return game.startOverrides[def.id] ?? def.start;
}

/** CTR-002 clamp to [min, max] when set. */
export function clamp(def: CounterDefinition, v: number): number {
  let out = v;
  if (def.min !== undefined && def.min !== null && out < def.min) out = def.min;
  if (def.max !== undefined && def.max !== null && out > def.max) out = def.max;
  return out;
}

/** Commander sources a seat deals damage from (CMD-003): 2 with partners, else sourcesPerOpponent. */
export function sourceCount(
  game: Pick<Game, "options">,
  def: CounterDefinition,
  source: Seat,
): number {
  const base = Math.max(1, def.sourcesPerOpponent ?? 1);
  const partners = game.options.partnersAllowed && source.commanders.length >= 2 ? 2 : 1;
  return Math.max(base, partners);
}

/** Instances of a perCommander counter for a seat (commander tax ×2 for partners). */
export function commanderCount(game: Pick<Game, "options">, seat: Seat): number {
  return game.options.partnersAllowed && seat.commanders.length >= 2 ? 2 : 1;
}

/** All value keys of `def` where `seat` is the target/owner. */
export function seatKeys(
  game: Pick<Game, "options" | "seats">,
  def: CounterDefinition,
  seat: Seat,
): CounterKey[] {
  switch (def.scope) {
    case "player": {
      if (!def.perCommander) return [counterKey(def.id, seat.id)];
      const n = commanderCount(game, seat);
      return Array.from({ length: n }, (_, i) => counterKey(def.id, seat.id, undefined, i));
    }
    case "playerVsOpponent": {
      const out: CounterKey[] = [];
      for (const src of game.seats) {
        const n = sourceCount(game, def, src);
        for (let i = 0; i < n; i++) out.push(counterKey(def.id, seat.id, src.id, i));
      }
      return out;
    }
    default:
      return [];
  }
}

/** Initial values for every enabled, non-token counter. */
export function initialValues(
  game: Pick<
    Game,
    "preset" | "enabledCounters" | "seats" | "options" | "startOverrides" | "perSeatStart"
  >,
): Record<CounterKey, number> {
  const values: Record<CounterKey, number> = {};
  for (const def of enabledDefs(game)) {
    if (def.kind === "token" || def.scope === "token") continue;
    if (def.scope === "global") {
      values[counterKey(def.id)] = startValue(game, def);
      continue;
    }
    for (const seat of game.seats) {
      for (const k of seatKeys(game, def, seat)) values[k] = startValue(game, def, seat.id);
    }
  }
  return values;
}

/** Current value of a key, falling back to the start value for keys not yet stored. */
export function getValue(game: Game, key: CounterKey): number {
  const v = game.values[key];
  if (v !== undefined) return v;
  const p = parseCounterKey(key);
  const def = findDef(game, p.counterId);
  if (!def) return 0;
  return startValue(game, def, def.scope === "global" ? undefined : p.seatId);
}

export function addressKey(a: CounterAddress): CounterKey {
  return counterKey(a.counterId, a.seatId, a.sourceSeatId, a.sourceIndex);
}

/**
 * Validate and normalize an address for `def`. Returns undefined when invalid
 * (unknown seat, out-of-range source index, wrong scope).
 */
export function normalizeAddress(
  game: Game,
  def: CounterDefinition,
  a: Omit<CounterAddress, "counterId">,
): CounterAddress | undefined {
  const seatById = (id: SeatId | undefined) =>
    id === undefined ? undefined : game.seats.find((s) => s.id === id);
  switch (def.scope) {
    case "global":
      return { counterId: def.id };
    case "player": {
      const seat = seatById(a.seatId);
      if (!seat) return undefined;
      if (!def.perCommander) return { counterId: def.id, seatId: seat.id };
      const idx = a.sourceIndex ?? 0;
      if (!Number.isInteger(idx) || idx < 0 || idx >= commanderCount(game, seat)) return undefined;
      return { counterId: def.id, seatId: seat.id, sourceIndex: idx };
    }
    case "playerVsOpponent": {
      const seat = seatById(a.seatId);
      const src = seatById(a.sourceSeatId);
      if (!seat || !src) return undefined;
      const idx = a.sourceIndex ?? 0;
      if (!Number.isInteger(idx) || idx < 0 || idx >= sourceCount(game, def, src)) return undefined;
      return { counterId: def.id, seatId: seat.id, sourceSeatId: src.id, sourceIndex: idx };
    }
    default:
      return undefined;
  }
}

function eventMatches(e: GameEvent | undefined, a: CounterAddress): e is GameEvent {
  return (
    e !== undefined &&
    e.kind === "counter" &&
    e.counterId === a.counterId &&
    e.seatId === a.seatId &&
    e.sourceSeatId === a.sourceSeatId &&
    e.sourceIndex === a.sourceIndex
  );
}

interface Change {
  addr: CounterAddress;
  from: number;
  to: number;
}

function eventFor(c: Change) {
  return {
    kind: "counter" as const,
    counterId: c.addr.counterId,
    ...(c.addr.seatId !== undefined ? { seatId: c.addr.seatId } : {}),
    ...(c.addr.sourceSeatId !== undefined ? { sourceSeatId: c.addr.sourceSeatId } : {}),
    ...(c.addr.sourceIndex !== undefined ? { sourceIndex: c.addr.sourceIndex } : {}),
    delta: c.to - c.from,
    from: c.from,
    to: c.to,
  };
}

/** INP-006: merge into the trailing log event(s) of the same counter within the batch window. */
function tryMerge(game: Game, primary: Change, linked: Change | undefined, now: number) {
  const log = game.log;
  const last = log[log.length - 1];
  let p: GameEvent | undefined;
  let l: GameEvent | undefined;
  if (eventMatches(last, primary.addr) && last.linkedTo === undefined) {
    p = last;
  } else if (last?.linkedTo !== undefined) {
    const prev = log[log.length - 2];
    if (eventMatches(prev, primary.addr) && last.linkedTo === prev.id) {
      p = prev;
      l = last;
    }
  }
  if (!p) return undefined;
  if (linked && (!l || !eventMatches(l, linked.addr))) return undefined;
  const lastAt = p.updatedAt ?? p.at;
  const gap = now - lastAt;
  if (gap < 0 || gap > game.options.batchWindowMs) return undefined;
  const updated: GameEvent[] = [
    { ...p, to: primary.to, delta: primary.to - (p.from ?? primary.from), updatedAt: now },
  ];
  if (linked && l) {
    updated.push({
      ...l,
      to: linked.to,
      delta: linked.to - (l.from ?? linked.from),
      updatedAt: now,
    });
  }
  return {
    ...game,
    log: replaceEvents(game, updated),
    activity: touchActivity(game.activity, now, game.options.idleGapMs, false),
  };
}

export interface ChangeResult {
  game: Game;
  merged: boolean;
}

/**
 * Set a numeric counter to `target` (clamped), applying its linkedTo side effect atomically
 * (CTR-005) and logging one event (plus a linked event grouped by `linkedTo`).
 */
export function applyNumberChange(
  game: Game,
  def: CounterDefinition,
  addr: CounterAddress,
  target: number,
  now: number,
  allowMerge: boolean,
): ChangeResult {
  const key = addressKey(addr);
  const from = getValue(game, key);
  const to = clamp(def, target);
  if (to === from) return { game, merged: false };
  const values = { ...game.values, [key]: to };
  let linked: Change | undefined;
  const link = def.linkedTo;
  if (
    link &&
    addr.seatId !== undefined &&
    (!link.optional || game.options.commanderDamageLifeLoss)
  ) {
    const ldef = enabledDef(game, link.counterId);
    if (ldef && ldef.kind === "number" && ldef.scope === "player" && !ldef.perCommander) {
      const laddr: CounterAddress = { counterId: ldef.id, seatId: addr.seatId };
      const lkey = addressKey(laddr);
      const lfrom = getValue(game, lkey);
      const lto = clamp(ldef, lfrom + (to - from) * link.factor);
      if (lto !== lfrom) {
        values[lkey] = lto;
        linked = { addr: laddr, from: lfrom, to: lto };
      }
    }
  }
  const withValues: Game = { ...game, values };
  const primary: Change = { addr, from, to };
  if (allowMerge) {
    const merged = tryMerge(withValues, primary, linked, now);
    if (merged) return { game: merged, merged: true };
  }
  const [g, id] = appendEvent(withValues, eventFor(primary), now);
  if (!linked) return { game: g, merged: false };
  return { game: appendEvent(g, { ...eventFor(linked), linkedTo: id }, now)[0], merged: false };
}
