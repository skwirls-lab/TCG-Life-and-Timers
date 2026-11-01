/**
 * Active play time (HIST-030) and the trivial-game rule (HIST-032). Pure; kept apart from the
 * record builder so the reset flow's decision table doesn't pull in record building (PERF-003).
 */
import type { Game, GameEvent } from "@/engine";
import { DEFAULT_IDLE_GAP_MS } from "./types";

type Interval = [number, number];

/** Timer pauses (user / background) as [from, to] intervals; open pauses run to `end`. */
export function pauseIntervals(log: readonly GameEvent[], end: number): Interval[] {
  const out: Interval[] = [];
  let open: number | null = null;
  for (const e of log) {
    if (e.kind !== "timer") continue;
    const action = e.meta?.action;
    const reason = e.meta?.reason;
    if (action === "pause" && (reason === "user" || reason === "background")) {
      open ??= e.at;
    } else if (action === "resume" && open !== null) {
      out.push([open, e.at]);
      open = null;
    }
  }
  if (open !== null && end > open) out.push([open, end]);
  return out;
}

function overlap(a: number, b: number, intervals: readonly Interval[]): number {
  let sum = 0;
  for (const [s, e] of intervals) {
    const lo = Math.max(a, s);
    const hi = Math.min(b, e);
    if (hi > lo) sum += hi - lo;
  }
  return sum;
}

/**
 * Active play time: the sum of gaps between consecutive inputs (event times, including batched
 * updates) up to `end`, skipping gaps longer than `idleGapMs` and time spent in clock pauses.
 */
export function activeTime(game: Game, end: number, idleGapMs?: number): number {
  const idle = idleGapMs ?? game.options.idleGapMs ?? DEFAULT_IDLE_GAP_MS;
  const times: number[] = [];
  for (const e of game.log) {
    times.push(e.at);
    if (e.updatedAt !== undefined && e.updatedAt > e.at) times.push(e.updatedAt);
  }
  if (times.length === 0) return 0;
  times.sort((a, b) => a - b);
  const last = times[times.length - 1]!;
  if (end > last) times.push(end);
  const pauses = pauseIntervals(game.log, end);
  let total = 0;
  for (let i = 1; i < times.length; i++) {
    const a = times[i - 1]!;
    const b = Math.min(times[i]!, Math.max(end, a));
    const gap = b - a;
    if (gap <= 0 || gap > idle) continue;
    total += gap - overlap(a, b, pauses);
  }
  return Math.max(0, total);
}

/** HIST-032: trivial games (under a minute, no changes, nobody out) are never saved. */
export function shouldDiscard(game: Game, now: number, idleGapMs?: number): boolean {
  const end = game.endedAt ?? now;
  return (
    game.activity.changes === 0 &&
    game.eliminations.length === 0 &&
    activeTime(game, end, idleGapMs) < 60_000
  );
}
