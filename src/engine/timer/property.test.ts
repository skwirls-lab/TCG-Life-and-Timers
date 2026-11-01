// @vitest-environment node
// @req ARCH-005
/**
 * Timer property tests (T2.1 DoD) with an ideal scheduler: before each user action, every
 * timeout / grace end that falls due is dispatched at its exact moment (as timerScheduler does).
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { newGame, T0 } from "../../../tests/unit/helpers/engine";
import { MIN, SEC, type Input } from "../../../tests/unit/helpers/timer";
import {
  clockAt,
  createSession,
  holder,
  nextSignificantEvent,
  reduce,
  reduceSession,
  remaining,
  seededRng,
  timeUsed,
  type Game,
  type GameAction,
  type GameSession,
  type TimerConfig,
} from "../index";

const SEATS = ["s1", "s2", "s3", "s4"];
const seat = fc.constantFrom(...SEATS);
const rng = seededRng(11);

const actionArb: fc.Arbitrary<Input> = fc.oneof(
  { weight: 6, arbitrary: fc.constant({ type: "PASS_TURN" as const }) },
  {
    weight: 3,
    arbitrary: fc.record({ type: fc.constant("TIMER_RESPOND" as const), seatId: seat }),
  },
  {
    weight: 3,
    arbitrary: fc.record({ type: fc.constant("TIMER_PASS_BACK" as const), seatId: seat }),
  },
  fc.constant({ type: "TIMER_RETURN_TO_ACTIVE" as const }),
  fc.record({
    type: fc.constant("TIMER_PAUSE" as const),
    reason: fc.constantFrom("user" as const, "background" as const, "menu" as const),
  }),
  { weight: 2, arbitrary: fc.constant({ type: "TIMER_RESUME" as const }) },
  fc.record({
    type: fc.constant("TIMER_ADJUST" as const),
    seatId: seat,
    deltaMs: fc.integer({ min: -20 * SEC, max: 20 * SEC }),
  }),
  fc.record({ type: fc.constant("ELIMINATE" as const), seatId: seat }),
  fc.record({ type: fc.constant("REVIVE" as const), seatId: seat }),
  fc.record({
    type: fc.constant("COUNTER_ADD" as const),
    counterId: fc.constant("life"),
    seatId: seat,
    delta: fc.integer({ min: -25, max: 25 }),
  }),
  fc.constant({ type: "START_GAME" as const }),
);

const configArb: fc.Arbitrary<Partial<TimerConfig>> = fc.record({
  mode: fc.constantFrom(
    "countup" as const,
    "bank" as const,
    "bankIncrement" as const,
    "bankDelay" as const,
    "perTurn" as const,
    "perTurnReserve" as const,
  ),
  bankMs: fc.integer({ min: SEC, max: 2 * MIN }),
  incrementMs: fc.integer({ min: 0, max: 10 * SEC }),
  delayMs: fc.integer({ min: 0, max: 5 * SEC }),
  perTurnMs: fc.integer({ min: SEC, max: MIN }),
  reserveMs: fc.integer({ min: 0, max: MIN }),
  graceMs: fc.integer({ min: 0, max: 20 * SEC }),
  timeoutAction: fc.constantFrom(
    "lose" as const,
    "grace" as const,
    "flag" as const,
    "addOnce" as const,
  ),
  addOnceMs: fc.integer({ min: SEC, max: 30 * SEC }),
  finalAction: fc.constantFrom("lose" as const, "flag" as const),
  responses: fc.constantFrom("charge" as const, "freeze" as const, "disabled" as const),
  warningsMs: fc.constant([30 * SEC, 10 * SEC]),
  match: fc.option(
    fc.record({ totalMs: fc.integer({ min: SEC, max: 5 * MIN }), extraTurns: fc.nat(3) }),
    {
      nil: undefined,
    },
  ),
});

const stepArb = fc.record({ gap: fc.integer({ min: 0, max: 40 * SEC }), action: actionArb });

/** Wall time that must be charged between two moments (independent oracle). */
function charging(g: Game): boolean {
  const t = g.timer;
  return (
    t.mode !== "off" &&
    t.status === "running" &&
    g.status !== "ended" &&
    !(t.config.responses === "freeze" && t.responseStack.length > 0)
  );
}

const BANK_RAISERS = new Set(["PASS_TURN", "TIMER_ADJUST", "TIMER_SET", "TIMER_TIMEOUT"]);

function checkInvariants(prev: Game, g: Game, action: GameAction) {
  const t = g.timer;
  // The clock holder is never eliminated.
  if (t.holder !== null) expect(g.seats.find((s) => s.id === t.holder)?.eliminated).toBe(false);
  // holder(game) is null iff the timer isn't running or the game ended.
  expect(holder(g) === null).toBe(t.status !== "running" || g.status === "ended");
  if (t.status === "running") expect(t.holder).not.toBeNull();
  if (t.status !== "idle") expect(t.status === "ended").toBe(g.status === "ended");
  // A bank never increases except by increment / adjust / addOnce (and per-turn refresh).
  const turnChanged = g.turn.turnNumber !== prev.turn.turnNumber;
  if (!BANK_RAISERS.has(action.type) && !(t.mode === "perTurn" && turnChanged)) {
    const now = action.now!;
    for (const id of SEATS) {
      const before = clockAt(prev, id, now)?.bankMs;
      const after = clockAt(g, id, now)?.bankMs;
      if (before !== undefined && after !== undefined) expect(after).toBeLessThanOrEqual(before);
    }
  }
}

function simulate(cfg: Partial<TimerConfig>, steps: { gap: number; action: Input }[]) {
  let g = newGame({ timer: { ...cfg } }, seededRng(5));
  let now = T0;
  let expectedUsed = 0;
  const advance = (to: number) => {
    if (charging(g)) expectedUsed += to - now;
    now = to;
  };
  const apply = (a: Input) => {
    const action = { ...a, now } as GameAction;
    const prev = g;
    g = reduce(g, action, { rng });
    checkInvariants(prev, g, action);
  };
  for (const { gap, action } of steps) {
    const target = now + gap;
    for (let guard = 0; ; guard++) {
      expect(guard).toBeLessThan(100);
      const ev = nextSignificantEvent(g, now);
      if (!ev || ev.at > target) break;
      expect(ev.at).toBeGreaterThanOrEqual(now);
      advance(ev.at);
      if (ev.kind === "timeout" || ev.kind === "graceEnd") {
        const before = g;
        apply({ type: "TIMER_TIMEOUT", seatId: ev.seatId! });
        expect(g).not.toBe(before);
      }
    }
    advance(target);
    if (action.type === "TIMER_ADJUST" && cfg.mode === "countup") continue;
    apply(action);
  }
  return { g, now, expectedUsed };
}

describe("timer properties", () => {
  // @req TMR-044 @req TMR-010 @req TMR-023 @req TMR-050
  it("total time charged == running wall time (excl. pauses / freeze responses); invariants hold", () => {
    fc.assert(
      fc.property(configArb, fc.array(stepArb, { maxLength: 60 }), (cfg, steps) => {
        const { g, now, expectedUsed } = simulate(cfg, steps);
        const total = SEATS.reduce((n, id) => n + timeUsed(g, id, now), 0);
        expect(total).toBe(expectedUsed);
      }),
      { numRuns: 400 },
    );
  });

  // @req TMR-004
  it("undo/redo through a session keeps holder invariants", () => {
    const sessionStep = fc.oneof(
      { weight: 4, arbitrary: stepArb },
      fc.record({
        gap: fc.integer({ min: 0, max: 5 * SEC }),
        action: fc.constant({ type: "UNDO" as const }),
      }),
      fc.record({
        gap: fc.integer({ min: 0, max: 5 * SEC }),
        action: fc.constant({ type: "REDO" as const }),
      }),
    );
    fc.assert(
      fc.property(configArb, fc.array(sessionStep, { maxLength: 40 }), (cfg, steps) => {
        let s: GameSession = createSession(newGame({ timer: cfg }, seededRng(5)));
        let now = T0;
        for (const { gap, action } of steps) {
          now += gap;
          s = reduceSession(s, { ...action, now } as GameAction, { rng });
          const g = s.game;
          if (g.timer.holder !== null) {
            expect(g.seats.find((x) => x.id === g.timer.holder)?.eliminated).toBe(false);
          }
          expect(holder(g) === null).toBe(g.timer.status !== "running" || g.status === "ended");
        }
      }),
      { numRuns: 200 },
    );
  });

  // @req TMR-044
  it("drift: 60 min of random-interval events — remaining equals the exact expected value", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            gap: fc.integer({ min: 1, max: 90 * SEC }),
            kind: fc.nat(9),
            who: fc.nat(3),
          }),
          { minLength: 80, maxLength: 200 },
        ),
        (events) => {
          const BANK = 120 * MIN;
          let g = newGame({ timer: { mode: "bank", bankMs: BANK, warningsMs: [] } }, seededRng(5));
          let now = T0;
          const end = T0 + 60 * MIN;
          g = reduce(g, { type: "START_GAME", now }, { rng });
          const charged: Record<string, number> = { s1: 0, s2: 0, s3: 0, s4: 0 };
          let active = 0;
          let responder: number | null = null;
          for (const ev of events) {
            const to = Math.min(end, now + ev.gap);
            charged[SEATS[responder ?? active]!]! += to - now;
            now = to;
            if (now >= end) break;
            if (responder === null && ev.kind < 6) {
              g = reduce(g, { type: "PASS_TURN", now }, { rng });
              active = (active + 1) % 4;
            } else if (responder === null) {
              const r = (active + 1 + (ev.who % 3)) % 4;
              g = reduce(g, { type: "TIMER_RESPOND", seatId: SEATS[r]!, now }, { rng });
              responder = r;
            } else {
              g = reduce(g, { type: "TIMER_PASS_BACK", seatId: SEATS[responder]!, now }, { rng });
              responder = null;
            }
          }
          charged[SEATS[responder ?? active]!]! += end - now;
          for (const id of SEATS) {
            expect(Math.abs(remaining(g, id, end) - (BANK - charged[id]!))).toBeLessThan(1);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
