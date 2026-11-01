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
 */
import { UNDO_LIMIT } from "./options";
import { reduce, reduceWithMeta, type ReduceContext } from "./reducer";
import type { Game, GameAction } from "./types";

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

/** Session reducer: handles UNDO / REDO / UNDO_TO and records undo steps for everything else. */
export function reduceSession(s: GameSession, action: GameAction, ctx: ReduceContext): GameSession {
  switch (action.type) {
    case "UNDO": {
      const prev = s.past[s.past.length - 1];
      if (!prev) return s;
      return {
        game: prev,
        past: s.past.slice(0, -1),
        future: [s.game, ...s.future],
        batchOpen: false,
      };
    }
    case "REDO": {
      const [next, ...rest] = s.future;
      if (!next) return s;
      return {
        game: next,
        past: [...s.past, s.game].slice(-UNDO_LIMIT),
        future: rest,
        batchOpen: false,
      };
    }
    case "UNDO_TO": {
      if (!hasEvent(s.game, action.eventId)) return s;
      for (let i = s.past.length - 1; i >= 0; i--) {
        const snap = s.past[i]!;
        if (hasEvent(snap, action.eventId)) continue;
        return {
          game: snap,
          past: s.past.slice(0, i),
          future: [...s.past.slice(i + 1), s.game, ...s.future],
          batchOpen: false,
        };
      }
      return s;
    }
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
