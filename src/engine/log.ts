/** Event log helpers (ARCH-004, HIST-011/012). */
import type { EventId, Game, GameActivity, GameEvent } from "./types";

export type NewEvent = Omit<GameEvent, "id" | "at"> & { at?: number };

/** Activity bookkeeping (HIST-030 active time, HIST-031 meaningful changes). */
export function touchActivity(
  activity: GameActivity,
  now: number,
  idleGapMs: number,
  countsAsChange: boolean,
): GameActivity {
  let activeMs = activity.activeMs;
  if (activity.lastAt !== null) {
    const gap = now - activity.lastAt;
    if (gap > 0 && gap <= idleGapMs) activeMs += gap;
  }
  return {
    changes: activity.changes + (countsAsChange ? 1 : 0),
    lastAt: activity.lastAt === null ? now : Math.max(activity.lastAt, now),
    activeMs,
  };
}

/** Append an event; returns the new game and the event id. */
export function appendEvent(game: Game, ev: NewEvent, now: number): [Game, EventId] {
  const id = `e${game.seq}`;
  const event: GameEvent = { ...ev, id, at: ev.at ?? now };
  const countsAsChange = (ev.kind === "counter" || ev.kind === "token") && !ev.linkedTo;
  return [
    {
      ...game,
      seq: game.seq + 1,
      log: [...game.log, event],
      activity: touchActivity(game.activity, now, game.options.idleGapMs, countsAsChange),
    },
    id,
  ];
}

/** Replace events by id (used by INP-006 batching). */
export function replaceEvents(game: Game, updated: readonly GameEvent[]): GameEvent[] {
  const byId = new Map(updated.map((e) => [e.id, e]));
  return game.log.map((e) => byId.get(e.id) ?? e);
}
