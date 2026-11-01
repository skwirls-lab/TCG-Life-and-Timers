// @vitest-environment node
// @req TMR-020 @req TMR-021 @req GAME-015 @req TMR-004
/** B-1: undo / redo / undo-to never charge time during which the timeline was paused. */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  canUndo,
  createSession,
  reduceSession,
  remaining,
  seededRng,
  timeUsed,
  type GameAction,
  type GameSession,
} from "@/engine";
import { newGame, T0 } from "../../../tests/unit/helpers/engine";

const rng = seededRng(3);
const MIN = 60_000;
const SEC = 1000;
const SEATS = ["s1", "s2", "s3", "s4"];
const step = (s: GameSession, a: GameAction) => reduceSession(s, a, { rng });
const bank = (bankMs: number) =>
  newGame({ timer: { mode: "bank", bankMs, timeoutAction: "lose", warningsMs: [] } });
const life = (seatId: string, now: number): GameAction => ({
  type: "COUNTER_ADD",
  counterId: "life",
  seatId,
  delta: -1,
  now,
});

describe("B-1 undo across a pause", () => {
  it("pause / resume are not undo steps", () => {
    let s = createSession(bank(20 * MIN));
    s = step(s, { type: "START_GAME", now: T0 });
    const depth = s.past.length;
    s = step(s, { type: "TIMER_PAUSE", reason: "user", now: T0 + MIN });
    s = step(s, { type: "TIMER_RESUME", now: T0 + 2 * MIN });
    expect(s.past).toHaveLength(depth);
    expect(s.game.log.filter((e) => e.kind === "timer").map((e) => e.meta?.action)).toEqual([
      "pause",
      "resume",
    ]);
  });

  it("UNDO after a background auto-pause does not charge the background period", () => {
    let s = createSession(bank(20 * MIN));
    s = step(s, { type: "START_GAME", now: T0 });
    s = step(s, { type: "COUNTER_ADD", counterId: "life", seatId: "s2", delta: -3, now: T0 + MIN });
    s = step(s, { type: "TIMER_PAUSE", reason: "background", now: T0 + 2 * MIN });
    s = step(s, { type: "TIMER_RESUME", now: T0 + 32 * MIN });
    const before = remaining(s.game, "s1", T0 + 33 * MIN);
    expect(before).toBe(17 * MIN);
    // One undo reverts the life misclick (pause / resume are not steps).
    s = step(s, { type: "UNDO", now: T0 + 33 * MIN });
    expect(s.game.timer.status).toBe("running");
    expect(s.game.log.some((e) => e.kind === "counter")).toBe(false);
    expect(remaining(s.game, "s1", T0 + 33 * MIN)).toBe(before);
    s = step(s, { type: "REDO", now: T0 + 34 * MIN });
    expect(remaining(s.game, "s1", T0 + 34 * MIN)).toBe(16 * MIN);
  });

  it("History 'Undo to here' while the menu auto-paused the clocks stays paused, charges nothing", () => {
    let s = createSession(bank(5 * MIN));
    s = step(s, { type: "START_GAME", now: T0 });
    s = step(s, { type: "COUNTER_ADD", counterId: "life", seatId: "s2", delta: -3, now: T0 + MIN });
    const misclick = s.game.log.at(-1)!.id;
    s = step(s, { type: "TIMER_PAUSE", reason: "menu", now: T0 + 2 * MIN });
    const before = remaining(s.game, "s1", T0 + 7 * MIN);
    s = step(s, { type: "UNDO_TO", eventId: misclick, now: T0 + 7 * MIN });
    expect(s.game.timer.status).toBe("paused");
    expect(s.game.timer.pausedReason).toBe("menu");
    expect(remaining(s.game, "s1", T0 + 7 * MIN)).toBe(before);
    s = step(s, { type: "TIMER_RESUME", now: T0 + 8 * MIN });
    expect(remaining(s.game, "s1", T0 + 9 * MIN)).toBe(2 * MIN);
  });

  it("undoing a pass still charges the time since the pass to the passer (TMR-004), minus pauses", () => {
    let s = createSession(bank(10 * MIN));
    s = step(s, { type: "START_GAME", now: T0 });
    s = step(s, { type: "PASS_TURN", now: T0 + 30 * SEC });
    s = step(s, { type: "TIMER_PAUSE", reason: "user", now: T0 + 40 * SEC });
    s = step(s, { type: "TIMER_RESUME", now: T0 + 5 * MIN });
    s = step(s, { type: "UNDO", now: T0 + 5 * MIN + 2 * SEC });
    expect(s.game.turn.activeSeat).toBe("s1");
    // 30 s before the pass + 10 s until the pause + 2 s after the resume.
    expect(remaining(s.game, "s1", T0 + 5 * MIN + 2 * SEC)).toBe(10 * MIN - 42 * SEC);
    expect(remaining(s.game, "s2", T0 + 5 * MIN + 2 * SEC)).toBe(10 * MIN);
  });

  it("undo while paused stays paused; undo-to a pause entry reverts only what came after it", () => {
    let s = createSession(bank(10 * MIN));
    s = step(s, { type: "START_GAME", now: T0 });
    s = step(s, life("s2", T0 + SEC));
    s = step(s, { type: "TIMER_PAUSE", reason: "user", now: T0 + 2 * SEC });
    const pauseId = s.game.log.at(-1)!.id;
    // Nothing undoable after the pause → no-op.
    expect(step(s, { type: "UNDO_TO", eventId: pauseId, now: T0 + 3 * SEC })).toBe(s);
    s = step(s, life("s3", T0 + 4 * SEC));
    s = step(s, { type: "UNDO_TO", eventId: pauseId, now: T0 + 9 * MIN });
    expect(s.game.timer.status).toBe("paused");
    expect(s.game.log.some((e) => e.kind === "counter" && e.seatId === "s2")).toBe(true);
    expect(s.game.log.some((e) => e.kind === "counter" && e.seatId === "s3")).toBe(false);
    expect(remaining(s.game, "s1", T0 + 9 * MIN)).toBe(10 * MIN - 2 * SEC);
    s = step(s, { type: "UNDO", now: T0 + 9 * MIN });
    expect(s.game.timer.status).toBe("paused");
    expect(remaining(s.game, "s1", T0 + 9 * MIN)).toBe(10 * MIN - 2 * SEC);
    expect(canUndo(s)).toBe(true);
  });

  it("no-op pause / resume and unknown event ids leave the session unchanged", () => {
    let s = createSession(bank(10 * MIN));
    expect(step(s, { type: "TIMER_PAUSE", reason: "user", now: T0 })).toBe(s);
    expect(step(s, { type: "TIMER_RESUME", now: T0 })).toBe(s);
    s = step(s, { type: "START_GAME", now: T0 });
    expect(step(s, { type: "UNDO_TO", eventId: "nope", now: T0 })).toBe(s);
  });

  it("an ended game paused for a menu: undoing END_GAME keeps the clocks paused", () => {
    let s = createSession(bank(10 * MIN));
    s = step(s, { type: "START_GAME", now: T0 });
    s = step(s, { type: "END_GAME", winners: [], now: T0 + MIN });
    s = step(s, { type: "TIMER_PAUSE", reason: "menu", now: T0 + 2 * MIN });
    s = step(s, { type: "UNDO", now: T0 + 7 * MIN });
    expect(s.game.timer.status).toBe("paused");
    expect(remaining(s.game, "s1", T0 + 7 * MIN)).toBe(8 * MIN);
  });
});

type Raw =
  | { type: "PASS_TURN" }
  | { type: "TIMER_PAUSE"; reason: "menu" | "background" | "user" }
  | { type: "TIMER_RESUME" }
  | { type: "UNDO" }
  | { type: "REDO" }
  | { type: "UNDO_TO" }
  | { type: "LIFE"; seatId: string }
  | { type: "TIMER_RESPOND"; seatId: string };

const rawArb: fc.Arbitrary<Raw> = fc.oneof(
  fc.constant<Raw>({ type: "PASS_TURN" }),
  fc.constantFrom<Raw>(
    { type: "TIMER_PAUSE", reason: "menu" },
    { type: "TIMER_PAUSE", reason: "background" },
    { type: "TIMER_PAUSE", reason: "user" },
  ),
  fc.constant<Raw>({ type: "TIMER_RESUME" }),
  fc.constant<Raw>({ type: "UNDO" }),
  fc.constant<Raw>({ type: "REDO" }),
  fc.constant<Raw>({ type: "UNDO_TO" }),
  fc.constantFrom(...SEATS).map<Raw>((seatId) => ({ type: "LIFE", seatId })),
  fc.constantFrom("s2", "s3").map<Raw>((seatId) => ({ type: "TIMER_RESPOND", seatId })),
);

function toAction(r: Raw, s: GameSession, now: number, pick: number): GameAction | null {
  switch (r.type) {
    case "LIFE":
      return life(r.seatId, now);
    case "UNDO_TO": {
      const log = s.game.log;
      return log.length === 0
        ? null
        : { type: "UNDO_TO", eventId: log[pick % log.length]!.id, now };
    }
    default:
      return { ...r, now } as GameAction;
  }
}

describe("B-1 property: no seat is ever charged time while the timeline was paused", () => {
  // @req TMR-021 @req GAME-015
  it("charged time never exceeds the wall time minus every paused span", () => {
    const stepArb = fc.record({
      gap: fc.integer({ min: 0, max: 10 * MIN }),
      pick: fc.nat(50),
      raw: rawArb,
    });
    fc.assert(
      fc.property(fc.array(stepArb, { maxLength: 50 }), (steps) => {
        let now = T0;
        let s = step(createSession(bank(600 * MIN)), { type: "START_GAME", now });
        // Wall time during which the user's timeline was paused (never chargeable).
        let paused = 0;
        let pausedSince: number | null = null;
        for (const { gap, pick, raw } of steps) {
          now += gap;
          const a = toAction(raw, s, now, pick);
          if (!a) continue;
          s = step(s, a);
          const isPaused = s.game.timer.status === "paused";
          if (!isPaused && pausedSince !== null) {
            paused += now - pausedSince;
            pausedSince = null;
          } else if (isPaused && pausedSince === null) pausedSince = now;
          const live = pausedSince === null ? 0 : now - pausedSince;
          const used = SEATS.reduce((n, id) => n + timeUsed(s.game, id, now), 0);
          expect(used).toBeLessThanOrEqual(now - T0 - paused - live);
        }
      }),
      { numRuns: 500, seed: 20261101 },
    );
  });
});
