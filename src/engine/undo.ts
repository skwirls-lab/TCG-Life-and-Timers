/**
 * Undo / redo (GAME-015, HIST-013, CTR-005).
 *
 * DESIGN (frozen): history is a snapshot stack that lives OUTSIDE the serializable Game, in a
 * `GameSession { game, past, future }`. Snapshots share structure with each other (the reducer is
 * immutable), so memory stays small; `past` is capped at UNDO_LIMIT (100 ≥ the required 50).
 * Persistence stores only `session.game` (the undo buffer is not persisted; it restarts empty
 * after a reload) so autosave stays cheap.
 *
 * - Every state-changing action pushes the previous game onto `past` and clears `future`,
 *   except INP-006 batched merges (same counter within options.batchWindowMs), which extend the
 *   current undo step.
 * - Linked effects (commander damage + life) are one action → one undo step.
 * - UNDO_TO(eventId) restores the snapshot taken just before that event (reverting it and
 *   everything after); the skipped states go to `future` so REDO re-applies them in order.
 * - "Sticky" seat cosmetics (rename, art, color, profile, rotation, contrast) and the layout
 *   variant (SET_LAYOUT, LAY-003) are not undo steps: they apply to the current game AND every
 *   snapshot, so undoing a life change never reverts a name, background or layout.
 * - Pause / resume (TIMER_PAUSE / TIMER_RESUME, TMR-020/021) are "sticky" in the timer sense
 *   (B-1): they are not undo steps; they pause / resume the current game AND settle-and-pause /
 *   resume every snapshot at the same instant (timer only, no log entry in the snapshots). A
 *   snapshot's clocks are therefore always exact as of the last wall-clock moment the timeline
 *   was actually running, so restoring it (UNDO / REDO / UNDO_TO) charges only running time —
 *   paused or backgrounded time is never charged. Undoing a pass while running still charges
 *   the time since the pass to the passer (TMR-004). Restores are additionally rebased: when the
 *   current timer is paused the restored game stays paused (with the current pause reason).
 */
import { UNDO_LIMIT } from "./options";
import { reduce, reduceWithMeta, type ReduceContext } from "./reducer";
import { projectTimer } from "./timer/clock";
import type { PauseReason } from "./timer/types";
import type { Game, GameAction, GameEvent } from "./types";

export interface GameSession {
  game: Game;
  /** Oldest first; the last entry is the state before the most recent undo step. */
  past: Game[];
  /** Next redo state first. */
  future: Game[];
  /** INP-006: the previous action may be extended by batching (false right after undo/redo). */
  batchOpen?: boolean;
}

export function createSession(game: Game): GameSession {
  return { game, past: [], future: [], batchOpen: false };
}

export const STICKY_ACTIONS = [
  "SEAT_RENAME",
  "SEAT_SET_ART",
  "SEAT_SET_COLOR",
  "SEAT_SET_PROFILE",
  "SEAT_SET_ROTATION",
  "SEAT_SET_CONTRAST",
  "SET_LAYOUT",
] as const satisfies readonly GameAction["type"][];

const STICKY: ReadonlySet<string> = new Set(STICKY_ACTIONS);

export function canUndo(s: GameSession): boolean {
  return s.past.length > 0;
}

export function canRedo(s: GameSession): boolean {
  return s.future.length > 0;
}

const hasEvent = (g: Game, id: string) => g.log.some((e) => e.id === id);

/** Timer actions that never become undo steps (B-1). */
export const PAUSE_ACTIONS = [
  "TIMER_PAUSE",
  "TIMER_RESUME",
] as const satisfies readonly GameAction["type"][];

/** A pause / resume log entry (not part of any undo step). */
const isPauseEvent = (e: GameEvent) =>
  e.kind === "timer" && (e.meta?.action === "pause" || e.meta?.action === "resume");

/** Settle a running snapshot to `now` and pause it (timer only; no log entry). */
function pauseSnapshot(g: Game, now: number, reason: PauseReason): Game {
  const t = g.timer;
  if (t.status !== "running") return g;
  return {
    ...g,
    timer: { ...projectTimer(t, now), status: "paused", runningSince: null, pausedReason: reason },
  };
}

/** Resume a paused snapshot from `now` (timer only; no log entry). */
function resumeSnapshot(g: Game, now: number): Game {
  const t = g.timer;
  if (t.status !== "paused") return g;
  const { pausedReason: _p, ...rest } = t;
  return { ...g, timer: { ...rest, status: "running", runningSince: now } };
}

/** The restored game keeps the current pause (B-1): never restart clocks while paused. */
function rebase(restored: Game, current: Game, now: number | undefined): Game {
  const cur = current.timer;
  if (cur.status !== "paused") return restored;
  const reason = cur.pausedReason ?? "user";
  if (restored.timer.status === "running") {
    // Defensive (sticky pauses normally pause every snapshot already): charge only up to the
    // moment the current timeline paused.
    // moment the current timeline paused (never more than `now`; nothing when unknown).
    const since = restored.timer.runningSince ?? 0;
    let pausedAt: number | undefined;
    for (const e of current.log)
      if (e.kind === "timer" && e.meta?.action === "pause") pausedAt = e.at;
    const at = Math.min(now ?? since, pausedAt ?? now ?? since);
    return pauseSnapshot(restored, Math.max(at, since), reason);
  }
  if (restored.timer.status === "paused" && restored.timer.pausedReason !== reason) {
    return { ...restored, timer: { ...restored.timer, pausedReason: reason } };
  }
  return restored;
}

const mapSame = (list: Game[], f: (g: Game) => Game): Game[] => {
  let changed = false;
  const out = list.map((g) => {
    const n = f(g);
    if (n !== g) changed = true;
    return n;
  });
  return changed ? out : list;
};

function reducePause(s: GameSession, action: GameAction, ctx: ReduceContext): GameSession {
  const now = action.now ?? 0;
  const game = reduce(s.game, action, ctx);
  const patch =
    action.type === "TIMER_PAUSE"
      ? (g: Game) => pauseSnapshot(g, now, action.reason ?? "user")
      : (g: Game) => resumeSnapshot(g, now);
  const past = mapSame(s.past, patch);
  const future = mapSame(s.future, patch);
  if (game === s.game && past === s.past && future === s.future) return s;
  return { game, past, future, batchOpen: false };
}

/** Session reducer: handles UNDO / REDO / UNDO_TO and records undo steps for everything else. */
export function reduceSession(s: GameSession, action: GameAction, ctx: ReduceContext): GameSession {
  switch (action.type) {
    case "UNDO": {
      const prev = s.past[s.past.length - 1];
      if (!prev) return s;
      return {
        game: rebase(prev, s.game, action.now),
        past: s.past.slice(0, -1),
        future: [s.game, ...s.future],
        batchOpen: false,
      };
    }
    case "REDO": {
      const [next, ...rest] = s.future;
      if (!next) return s;
      return {
        game: rebase(next, s.game, action.now),
        past: [...s.past, s.game].slice(-UNDO_LIMIT),
        future: rest,
        batchOpen: false,
      };
    }
    case "UNDO_TO": {
      const at = s.game.log.findIndex((e) => e.id === action.eventId);
      if (at < 0) return s;
      // Pause / resume entries are not undo steps: "undo to" one of them reverts the first
      // undoable event after it (nothing when there is none).
      const target = s.game.log.slice(at).find((e) => !isPauseEvent(e));
      if (!target) return s;
      for (let i = s.past.length - 1; i >= 0; i--) {
        const snap = s.past[i]!;
        if (hasEvent(snap, target.id)) continue;
        return {
          game: rebase(snap, s.game, action.now),
          past: s.past.slice(0, i),
          future: [...s.past.slice(i + 1), s.game, ...s.future],
          batchOpen: false,
        };
      }
      return s;
    }
    case "TIMER_PAUSE":
    case "TIMER_RESUME":
      return reducePause(s, action, ctx);
    default: {
      if (STICKY.has(action.type)) {
        const game = reduce(s.game, action, ctx);
        if (game === s.game) return s;
        const patch = (g: Game) => reduce(g, action, ctx);
        return { ...s, game, past: s.past.map(patch), future: s.future.map(patch) };
      }
      const r = reduceWithMeta(s.game, action, {
        ...ctx,
        allowMerge: (ctx.allowMerge ?? true) && s.batchOpen === true,
      });
      if (r.game === s.game) return s;
      if (r.merged) return { game: r.game, past: s.past, future: [], batchOpen: true };
      return {
        game: r.game,
        past: [...s.past, s.game].slice(-UNDO_LIMIT),
        future: [],
        batchOpen: true,
      };
    }
  }
}
