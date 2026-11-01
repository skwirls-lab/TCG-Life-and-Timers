/**
 * Threshold evaluation (CTR-003, CTR-004, CMD-005), elimination / revive and game-end detection
 * (GAME-014). Runs after every action.
 */
import { enabledDefs, getValue, seatKeys } from "./counters";
import { counterKey, parseCounterKey } from "./keys";
import { appendEvent } from "./log";
import { advanceTurn } from "./turn";
import type {
  AutoKOMode,
  CounterDefinition,
  EliminationCause,
  EventMetaValue,
  Game,
  GameEndReason,
  PendingPrompt,
  SeatId,
  ThresholdRule,
} from "./types";

/** Effective rule for a seat: per-seat override → per-game override → preset. null = disabled. */
export function thresholdFor(
  game: Pick<Game, "perSeatThreshold" | "thresholdOverrides">,
  def: CounterDefinition,
  seatId: SeatId,
): ThresholdRule | null {
  const rule = def.threshold;
  if (!rule) return null;
  const perSeat = game.perSeatThreshold[seatId];
  if (perSeat && def.id in perSeat) {
    const v = perSeat[def.id];
    return v === null || v === undefined ? null : { ...rule, value: v };
  }
  if (def.id in game.thresholdOverrides) {
    const v = game.thresholdOverrides[def.id];
    return v === null || v === undefined ? null : { ...rule, value: v };
  }
  return rule;
}

export function meets(rule: ThresholdRule, v: number): boolean {
  return rule.comparator === "<=" ? v <= rule.value : v >= rule.value;
}

export interface Trigger {
  /** Stable id: `${outcome}#${counterKey}`. */
  id: string;
  seatId: SeatId;
  outcome: "lose" | "win";
  mode: AutoKOMode;
  cause: EliminationCause;
}

/** All threshold rules currently met (for every seat, including eliminated ones). */
export function activeTriggers(game: Game): Trigger[] {
  const out: Trigger[] = [];
  const defs = enabledDefs(game).filter(
    (d) =>
      d.threshold &&
      d.kind === "number" &&
      (d.scope === "player" || d.scope === "playerVsOpponent"),
  );
  for (const seat of game.seats) {
    for (const def of defs) {
      const rule = thresholdFor(game, def, seat.id);
      if (!rule) continue;
      const mode = rule.autoApply ?? game.options.autoKO;
      const push = (key: string, cause: EliminationCause) =>
        out.push({
          id: `${rule.outcome}#${key}`,
          seatId: seat.id,
          outcome: rule.outcome,
          mode,
          cause,
        });
      const keys = seatKeys(game, def, seat);
      if (def.scope === "playerVsOpponent" && rule.perSource) {
        // CMD-005: each commander is evaluated independently.
        for (const key of keys) {
          if (!meets(rule, getValue(game, key))) continue;
          const p = parseCounterKey(key);
          push(key, {
            kind: "threshold",
            counterId: def.id,
            sourceSeatId: p.sourceSeatId!,
            sourceIndex: p.sourceIndex!,
          });
        }
      } else if (def.perCommander) {
        for (const key of keys) {
          if (meets(rule, getValue(game, key))) push(key, { kind: "threshold", counterId: def.id });
        }
      } else {
        const total = keys.reduce((sum, k) => sum + getValue(game, k), 0);
        if (meets(rule, total)) {
          push(counterKey(def.id, seat.id), { kind: "threshold", counterId: def.id });
        }
      }
    }
  }
  return out;
}

function causeMeta(cause: EliminationCause): Record<string, EventMetaValue> {
  const meta: Record<string, EventMetaValue> = { cause: cause.kind };
  if (cause.kind === "threshold") {
    meta.counterId = cause.counterId;
    if (cause.sourceSeatId !== undefined) meta.sourceSeatId = cause.sourceSeatId;
    if (cause.sourceIndex !== undefined) meta.sourceIndex = cause.sourceIndex;
  }
  return meta;
}

function aliveCount(game: Game): number {
  return game.seats.filter((s) => !s.eliminated).length;
}

/** Participants including seats removed mid-game (they count as concessions). */
function participants(game: Game): number {
  return game.seats.length + game.eliminations.filter((e) => e.removed).length;
}

/**
 * Mark a seat eliminated (no-op if already). If it held the turn while turn tracking runs, the
 * turn passes to the next living seat (TMR-023).
 */
export function eliminateSeat(
  game: Game,
  seatId: SeatId,
  cause: EliminationCause,
  now: number,
): Game {
  const seat = game.seats.find((s) => s.id === seatId);
  if (!seat || seat.eliminated) return game;
  let g: Game = {
    ...game,
    seats: game.seats.map((s) =>
      s.id === seatId ? { ...s, eliminated: true, eliminatedCause: cause } : s,
    ),
    eliminations: [
      ...game.eliminations,
      {
        seatId,
        name: seat.name,
        cause,
        turn: game.turn.turnNumber,
        round: game.turn.round,
        at: now,
      },
    ],
    pendingPrompts: game.pendingPrompts.filter((p) => p.seatId !== seatId),
  };
  [g] = appendEvent(
    g,
    { kind: cause.kind === "concede" ? "concede" : "eliminate", seatId, meta: causeMeta(cause) },
    now,
  );
  if (
    g.turn.activeSeat === seatId &&
    g.options.turnTracking &&
    g.status === "running" &&
    aliveCount(g) > 1
  ) {
    g = advanceTurn(g, now, true);
  }
  return g;
}

export function reviveSeat(game: Game, seatId: SeatId, now: number): Game {
  const seat = game.seats.find((s) => s.id === seatId);
  if (!seat || !seat.eliminated) return game;
  const g: Game = {
    ...game,
    seats: game.seats.map((s) => {
      if (s.id !== seatId) return s;
      const { eliminatedCause: _c, ...rest } = s;
      return { ...rest, eliminated: false };
    }),
    eliminations: game.eliminations.filter((e) => e.seatId !== seatId || e.removed),
  };
  return appendEvent(g, { kind: "revive", seatId }, now)[0];
}

/** End the game (GAME-014). */
export function endGame(game: Game, winners: SeatId[], reason: GameEndReason, now: number): Game {
  if (game.status === "ended") return game;
  const g: Game = {
    ...game,
    status: "ended",
    endedAt: now,
    result: { winners, eliminated: game.eliminations, endedAt: now, reason },
  };
  return appendEvent(g, { kind: "gameEnd", meta: { reason, winners: winners.join(",") } }, now)[0];
}

function reopen(game: Game): Game {
  const { result: _r, endedAt: _e, ...rest } = game;
  return { ...rest, status: game.startedAt !== undefined ? "running" : "ready" };
}

function lastStandingEnded(game: Game): boolean {
  const alive = aliveCount(game);
  return participants(game) >= 2 ? alive <= 1 : alive === 0;
}

/** Apply thresholds: auto-KO / prompts, auto-revive, win thresholds and game end. */
export function evaluate(game: Game, now: number): Game {
  let g = game;
  const triggers = activeTriggers(g).filter((t) => t.mode !== "off");
  const activeIds = new Set(triggers.map((t) => t.id));

  // Forget overrides/prompts whose condition no longer holds.
  const suppressed = g.suppressedTriggers.filter((id) => activeIds.has(id));
  const prompts = g.pendingPrompts.filter((p) => activeIds.has(p.trigger));
  if (
    suppressed.length !== g.suppressedTriggers.length ||
    prompts.length !== g.pendingPrompts.length
  ) {
    g = { ...g, suppressedTriggers: suppressed, pendingPrompts: prompts };
  }
  const live = triggers.filter((t) => !g.suppressedTriggers.includes(t.id));

  // Auto-revive (CTR-004): threshold-eliminated seats with no lose trigger left.
  if (g.options.autoRevive) {
    for (const seat of g.seats) {
      if (!seat.eliminated || seat.eliminatedCause?.kind !== "threshold") continue;
      if (triggers.some((t) => t.seatId === seat.id && t.outcome === "lose")) continue;
      g = reviveSeat(g, seat.id, now);
    }
  }

  // Loss thresholds.
  for (const t of live) {
    if (t.outcome !== "lose") continue;
    const seat = g.seats.find((s) => s.id === t.seatId)!;
    if (seat.eliminated) continue;
    if (t.mode === "auto") g = eliminateSeat(g, t.seatId, t.cause, now);
    else g = addPrompt(g, t, now);
  }

  // Win thresholds.
  if (g.status !== "ended") {
    for (const t of live) {
      if (t.outcome !== "win") continue;
      const seat = g.seats.find((s) => s.id === t.seatId)!;
      if (seat.eliminated) continue;
      if (t.mode === "auto") {
        g = endGame(g, [t.seatId], "winThreshold", now);
        break;
      }
      g = addPrompt(g, t, now);
    }
  }

  // Game end / reopen.
  if (g.status === "ended" && g.result) {
    const stillWon =
      g.result.reason !== "winThreshold" ||
      triggers.some((t) => t.outcome === "win" && g.result!.winners.includes(t.seatId));
    const stillOver = g.result.reason !== "lastStanding" || lastStandingEnded(g);
    if (!stillWon || !stillOver) g = reopen(g);
    else if (g.result.eliminated !== g.eliminations) {
      g = { ...g, result: { ...g.result, eliminated: g.eliminations } };
    }
  }
  if (g.status !== "ended" && lastStandingEnded(g)) {
    g = endGame(
      g,
      g.seats.filter((s) => !s.eliminated).map((s) => s.id),
      "lastStanding",
      now,
    );
  }
  return g;
}

function addPrompt(game: Game, t: Trigger, now: number): Game {
  const kind = t.outcome === "lose" ? "eliminate" : "win";
  if (game.pendingPrompts.some((p) => p.seatId === t.seatId && p.kind === kind)) return game;
  const prompt: PendingPrompt = {
    id: `p${game.seq}`,
    kind,
    seatId: t.seatId,
    trigger: t.id,
    cause: t.cause,
    at: now,
  };
  return { ...game, seq: game.seq + 1, pendingPrompts: [...game.pendingPrompts, prompt] };
}

/** Lose triggers currently met for a seat (used by manual REVIVE to suppress auto re-KO). */
export function seatLoseTriggerIds(game: Game, seatId: SeatId): string[] {
  return activeTriggers(game)
    .filter((t) => t.seatId === seatId && t.outcome === "lose")
    .map((t) => t.id);
}
