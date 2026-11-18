// @vitest-environment node
/**
 * Declare-blockers window (lane/timers): TIMER_BLOCKERS_START / TIMER_BLOCKERS_END, the 0:00
 * house rules, responses inside the window, pause, pass, undo and reload derivation.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { MIN, SEC, Table, type Input } from "../../../tests/unit/helpers/timer";
import { newGame, T0 } from "../../../tests/unit/helpers/engine";
import {
  createSession,
  isCharging,
  nextSignificantEvent,
  parseGame,
  reduce,
  reduceSession,
  seededRng,
  timeUsed,
  type Game,
  type GameAction,
  type TimerConfig,
} from "../index";
import { projectTimer } from "./clock";

const rng = seededRng(4);
const W = 30 * SEC;

function attack(cfg: Partial<TimerConfig> = {}) {
  const x = new Table({ mode: "bank", blockersWindow: true, ...cfg });
  x.doAt(0, { type: "START_GAME" });
  x.doAt(10 * SEC, { type: "TIMER_BLOCKERS_START", durationMs: W });
  return x;
}

const bw = (x: Table) => x.timer.blockers;

describe("blockers window", () => {
  it("stops the attacker's clock and counts down a shared window; declared gives the time back", () => {
    const x = attack();
    expect(bw(x)).toMatchObject({ seatId: "s1", durationMs: W, remainingMs: W });
    expect(x.lastTimerEvent()?.meta).toMatchObject({ action: "blockersStart", durationMs: W });
    expect(isCharging(x.timer)).toBe(false);
    x.at(28 * SEC);
    // Nobody is charged during the window.
    expect(x.rem("s1")).toBe(10 * MIN - 10 * SEC);
    expect(x.used("s1")).toBe(10 * SEC);
    expect(nextSignificantEvent(x.g, x.now)).toMatchObject({
      kind: "blockersEnd",
      at: T0 + 40 * SEC,
    });
    x.do({ type: "TIMER_BLOCKERS_END" });
    expect(bw(x)).toBeUndefined();
    expect(x.lastTimerEvent()?.meta).toMatchObject({
      action: "blockersEnd",
      reason: "declared",
      usedMs: 18 * SEC,
    });
    x.at(33 * SEC);
    expect(x.rem("s1")).toBe(10 * MIN - 15 * SEC);
  });

  it("uses config.blockersMs (default 30 s) when no duration is given", () => {
    const x = new Table({ mode: "bank", blockersMs: 45 * SEC });
    x.doAt(0, { type: "START_GAME" }, { type: "TIMER_BLOCKERS_START" });
    expect(bw(x)?.durationMs).toBe(45 * SEC);
    const y = new Table({ mode: "bank" });
    y.doAt(0, { type: "START_GAME" }, { type: "TIMER_BLOCKERS_START" });
    expect(bw(y)?.durationMs).toBe(30 * SEC);
  });

  it("is a no-op when idle, paused, off, during a response, twice, or with a bad duration", () => {
    const idle = new Table({ mode: "bank" });
    const g0 = idle.g;
    idle.do({ type: "TIMER_BLOCKERS_START" }, { type: "TIMER_BLOCKERS_END" });
    expect(idle.g).toBe(g0);
    const off = new Table({ mode: "off" });
    off.doAt(0, { type: "START_GAME" });
    const g1 = off.g;
    off.do({ type: "TIMER_BLOCKERS_START" });
    expect(off.g).toBe(g1);
    const x = new Table({ mode: "bank" });
    x.doAt(0, { type: "START_GAME" }, { type: "TIMER_PAUSE" });
    const g2 = x.g;
    x.do({ type: "TIMER_BLOCKERS_START" });
    expect(x.g).toBe(g2);
    x.doAt(SEC, { type: "TIMER_RESUME" }, { type: "TIMER_RESPOND", seatId: "s2" });
    const g3 = x.g;
    x.do({ type: "TIMER_BLOCKERS_START" });
    expect(x.g).toBe(g3);
    x.do(
      { type: "TIMER_PASS_BACK", seatId: "s2" },
      { type: "TIMER_BLOCKERS_START", durationMs: 0 },
    );
    expect(bw(x)).toBeUndefined();
    x.do({ type: "TIMER_BLOCKERS_START", durationMs: W });
    const g4 = x.g;
    x.do({ type: "TIMER_BLOCKERS_START", durationMs: W });
    expect(x.g).toBe(g4);
    // A timeout before 0:00 does nothing.
    x.doAt(2 * SEC, { type: "TIMER_BLOCKERS_END", reason: "timeout" });
    expect(bw(x)?.remainingMs).toBe(W);
  });

  it("'wait' rule: at 0:00 the alert marks it expired and the window stays; nobody is charged", () => {
    const x = attack({ blockersTimeout: "wait" });
    x.doAt(40 * SEC, { type: "TIMER_BLOCKERS_END", reason: "timeout" });
    expect(bw(x)).toMatchObject({ remainingMs: 0, expired: true });
    expect(x.lastTimerEvent()?.meta).toMatchObject({ action: "blockersTimeUp" });
    expect(nextSignificantEvent(x.g, x.now)).toBeNull();
    const again = x.g;
    x.do({ type: "TIMER_BLOCKERS_END", reason: "timeout" });
    expect(x.g).toBe(again);
    x.at(100 * SEC);
    expect(x.rem("s1")).toBe(10 * MIN - 10 * SEC);
    x.do({ type: "TIMER_BLOCKERS_END" });
    expect(x.lastTimerEvent()?.meta).toMatchObject({ reason: "declared", usedMs: W });
    x.at(105 * SEC);
    expect(x.rem("s1")).toBe(10 * MIN - 15 * SEC);
  });

  it("'return' rule: at 0:00 the attacker's clock runs again (late dispatch charges from 0:00)", () => {
    const x = attack({ blockersTimeout: "return" });
    // Derivation before the timeout action lands: the attacker runs again from 0:00 (T+40 s).
    x.at(45 * SEC);
    expect(x.rem("s1")).toBe(10 * MIN - 15 * SEC);
    expect(nextSignificantEvent(x.g, x.now)).toMatchObject({ kind: "blockersEnd", at: x.now });
    x.do({ type: "TIMER_BLOCKERS_END", reason: "timeout" });
    expect(bw(x)).toBeUndefined();
    expect(x.lastTimerEvent()?.meta).toMatchObject({ action: "blockersEnd", reason: "timeout" });
    x.at(50 * SEC);
    expect(x.rem("s1")).toBe(10 * MIN - 20 * SEC);
  });

  it("never charges the holder during the window, overtime included", () => {
    const x = new Table({ mode: "bank", bankMs: 5 * SEC, timeoutAction: "grace", graceMs: MIN });
    x.doAt(0, { type: "START_GAME" });
    x.doAt(5 * SEC, { type: "TIMER_TIMEOUT", seatId: "s1" });
    expect(x.timer.clocks.s1!.state).toBe("overtime");
    x.doAt(10 * SEC, { type: "TIMER_BLOCKERS_START", durationMs: W });
    x.at(35 * SEC);
    expect(x.shown("s1")).toBe(MIN - 5 * SEC);
    expect(nextSignificantEvent(x.g, x.now)?.kind).toBe("blockersEnd");
  });

  it("a response pauses the window and runs the responder; pass back / return resume it", () => {
    const x = attack();
    x.doAt(15 * SEC, { type: "TIMER_RESPOND", seatId: "s3" });
    expect(isCharging(x.timer)).toBe(true);
    x.at(25 * SEC);
    expect(x.rem("s3")).toBe(10 * MIN - 10 * SEC);
    expect(nextSignificantEvent(x.g, x.now)?.kind).not.toBe("blockersEnd");
    x.do({ type: "TIMER_PASS_BACK", seatId: "s3" });
    expect(bw(x)?.remainingMs).toBe(25 * SEC);
    x.at(30 * SEC);
    expect(nextSignificantEvent(x.g, x.now)).toMatchObject({
      kind: "blockersEnd",
      at: x.now + 20 * SEC,
    });
    // Nested: s2 then s4 respond; Return clears both and the window resumes.
    x.do({ type: "TIMER_RESPOND", seatId: "s2" }, { type: "TIMER_RESPOND", seatId: "s4" });
    x.doAt(40 * SEC, { type: "TIMER_RETURN_TO_ACTIVE" });
    expect(bw(x)?.remainingMs).toBe(20 * SEC);
    expect(x.rem("s1")).toBe(10 * MIN - 10 * SEC);
    expect(x.rem("s4")).toBe(10 * MIN - 10 * SEC);
  });

  it("freeze responses inside the window charge nobody and keep the window paused", () => {
    const x = attack({ responses: "freeze" });
    x.doAt(15 * SEC, { type: "TIMER_RESPOND", seatId: "s2" });
    x.at(60 * SEC);
    expect(x.rem("s2")).toBe(10 * MIN);
    expect(x.rem("s1")).toBe(10 * MIN - 10 * SEC);
    x.do({ type: "TIMER_PASS_BACK", seatId: "s2" });
    expect(bw(x)?.remainingMs).toBe(25 * SEC);
  });

  it("pausing freezes the window; resume continues it", () => {
    const x = attack();
    x.doAt(20 * SEC, { type: "TIMER_PAUSE" });
    expect(bw(x)?.remainingMs).toBe(20 * SEC);
    expect(nextSignificantEvent(x.g, T0 + 500 * SEC)).toBeNull();
    x.doAt(500 * SEC, { type: "TIMER_RESUME" });
    x.at(510 * SEC);
    expect(nextSignificantEvent(x.g, x.now)).toMatchObject({
      kind: "blockersEnd",
      at: x.now + 10 * SEC,
    });
    expect(x.rem("s1")).toBe(10 * MIN - 10 * SEC);
  });

  it("passing the turn during the window ends it first (logged 'pass')", () => {
    const x = attack();
    x.doAt(20 * SEC, { type: "PASS_TURN" });
    expect(bw(x)).toBeUndefined();
    const end = x.g.log.find((e) => e.kind === "timer" && e.meta?.action === "blockersEnd");
    expect(end?.meta).toMatchObject({ reason: "pass", usedMs: 10 * SEC });
    expect(x.rem("s1")).toBe(10 * MIN - 10 * SEC);
    expect(x.g.turn.activeSeat).toBe("s2");
    x.at(25 * SEC);
    expect(x.rem("s2")).toBe(10 * MIN - 5 * SEC);
  });

  it("elimination, game end and clock restart drop the window", () => {
    const x = attack();
    x.doAt(15 * SEC, { type: "CONCEDE", seatId: "s1" });
    expect(bw(x)).toBeUndefined();
    expect(x.g.turn.activeSeat).toBe("s2");
    const y = attack();
    y.doAt(15 * SEC, { type: "END_GAME", winners: ["s2"] });
    expect(y.timer.status).toBe("ended");
    expect(y.timer.blockers).toBeUndefined();
    const z = attack();
    z.doAt(15 * SEC, { type: "TIMER_RESET_CLOCKS" });
    expect(z.timer.blockers).toBeUndefined();
    expect(z.timer.status).toBe("idle");
  });

  it("undo / redo step over start and end like other timer actions", () => {
    const x = attack();
    x.doAt(20 * SEC, { type: "TIMER_BLOCKERS_END" });
    x.doAt(21 * SEC, { type: "UNDO" });
    expect(bw(x)?.remainingMs).toBe(W);
    x.at(22 * SEC);
    expect(x.rem("s1")).toBe(10 * MIN - 10 * SEC);
    x.do({ type: "UNDO" });
    expect(bw(x)).toBeUndefined();
    // Undoing the start means the attacker's clock never stopped.
    expect(x.rem("s1")).toBe(10 * MIN - 22 * SEC);
    x.do({ type: "REDO" }, { type: "REDO" });
    expect(bw(x)).toBeUndefined();
    expect(x.lastTimerEvent()?.meta).toMatchObject({ action: "blockersEnd" });
  });

  it("undo while paused never charges the paused time (B-1)", () => {
    const x = attack();
    x.doAt(20 * SEC, { type: "TIMER_PAUSE" });
    x.doAt(300 * SEC, { type: "UNDO" });
    expect(bw(x)).toBeUndefined();
    expect(x.timer.status).toBe("paused");
    expect(x.rem("s1")).toBe(10 * MIN - 20 * SEC);
  });

  it("reload: a persisted mid-window game derives the window and clocks from timestamps", () => {
    const x = attack();
    x.at(25 * SEC);
    const stored = parseGame(JSON.parse(JSON.stringify(x.g)));
    expect(stored.timer.blockers).toEqual(x.timer.blockers);
    // After the reload the scheduler fires the due window at once.
    const now = T0 + 70 * SEC;
    expect(nextSignificantEvent(stored, now)).toMatchObject({ kind: "blockersEnd", at: now });
    expect(projectTimer(stored.timer, now).blockers?.remainingMs).toBe(0);
    const g = reduce(stored, { type: "TIMER_BLOCKERS_END", reason: "timeout", now }, { rng });
    expect(g.timer.blockers?.expired).toBe(true);
    expect(timeUsed(g, "s1", now)).toBe(10 * SEC);
  });

  it("match timer keeps running during the window", () => {
    const x = attack({ match: { totalMs: 50 * MIN, extraTurns: 0 } });
    x.at(30 * SEC);
    expect(projectTimer(x.timer, x.now).match?.remainingMs).toBe(50 * MIN - 30 * SEC);
  });
});

// ---------------------------------------------------------------------------------------------
// Property: time charged == running wall time minus the window's counting time
// ---------------------------------------------------------------------------------------------

const SEATS = ["s1", "s2", "s3", "s4"];
const seat = fc.constantFrom(...SEATS);
const actionArb: fc.Arbitrary<Input> = fc.oneof(
  { weight: 4, arbitrary: fc.constant({ type: "PASS_TURN" as const }) },
  {
    weight: 4,
    arbitrary: fc.record({
      type: fc.constant("TIMER_BLOCKERS_START" as const),
      durationMs: fc.integer({ min: SEC, max: 40 * SEC }),
    }),
  },
  { weight: 3, arbitrary: fc.constant({ type: "TIMER_BLOCKERS_END" as const }) },
  {
    weight: 2,
    arbitrary: fc.record({ type: fc.constant("TIMER_RESPOND" as const), seatId: seat }),
  },
  {
    weight: 2,
    arbitrary: fc.record({ type: fc.constant("TIMER_PASS_BACK" as const), seatId: seat }),
  },
  fc.constant({ type: "TIMER_RETURN_TO_ACTIVE" as const }),
  fc.constant({ type: "TIMER_PAUSE" as const }),
  { weight: 2, arbitrary: fc.constant({ type: "TIMER_RESUME" as const }) },
  fc.record({ type: fc.constant("ELIMINATE" as const), seatId: seat }),
  fc.constant({ type: "START_GAME" as const }),
);

function simulate(cfg: Partial<TimerConfig>, steps: { gap: number; action: Input }[]) {
  let g: Game = newGame(
    { timer: { mode: "bank", bankMs: 10 * MIN, warningsMs: [], ...cfg } },
    seededRng(5),
  );
  let now = T0;
  let expected = 0;
  // Independent window model.
  let open = false;
  let left = 0;
  const advance = (to: number) => {
    const gap = to - now;
    const t = g.timer;
    const base =
      t.status === "running" &&
      g.status !== "ended" &&
      !(t.config.responses === "freeze" && t.responseStack.length > 0);
    let free = 0;
    if (open && t.responseStack.length === 0 && t.status === "running") {
      const counted = Math.min(gap, left);
      left -= counted;
      free = cfg.blockersTimeout === "return" ? counted : gap;
    }
    if (base) expected += gap - free;
    now = to;
  };
  const apply = (a: Input) => {
    const was = g.timer.blockers;
    g = reduce(g, { ...a, now } as GameAction, { rng });
    const b = g.timer.blockers;
    if (b && !was) {
      open = true;
      left = b.durationMs;
    } else if (!b) open = false;
  };
  for (const { gap, action } of steps) {
    const target = now + gap;
    for (let guard = 0; ; guard++) {
      expect(guard).toBeLessThan(100);
      const ev = nextSignificantEvent(g, now);
      if (!ev || ev.at > target) break;
      advance(ev.at);
      if (ev.kind === "timeout" || ev.kind === "graceEnd")
        apply({ type: "TIMER_TIMEOUT", seatId: ev.seatId! });
      else if (ev.kind === "blockersEnd") {
        const before = g;
        apply({ type: "TIMER_BLOCKERS_END", reason: "timeout" });
        expect(g).not.toBe(before);
      }
    }
    advance(target);
    apply(action);
    if (g.timer.blockers) expect(g.timer.blockers.seatId).toBe(g.turn.activeSeat);
  }
  return { g, now, expected };
}

describe("blockers properties", () => {
  it("charged time == running time outside the counting window (both house rules)", () => {
    fc.assert(
      fc.property(
        fc.record({
          blockersTimeout: fc.constantFrom("wait" as const, "return" as const),
          responses: fc.constantFrom("charge" as const, "freeze" as const),
          timeoutAction: fc.constantFrom("grace" as const, "flag" as const),
        }),
        fc.array(fc.record({ gap: fc.integer({ min: 0, max: 30 * SEC }), action: actionArb }), {
          maxLength: 50,
        }),
        (cfg, steps) => {
          const { g, now, expected } = simulate(cfg, steps);
          const total = SEATS.reduce((n, id) => n + timeUsed(g, id, now), 0);
          expect(total).toBe(expected);
        },
      ),
      { numRuns: 300, seed: 20261118 },
    );
  });

  it("undo/redo through a session keeps the window on the turn holder", () => {
    const step = fc.oneof(
      {
        weight: 4,
        arbitrary: fc.record({ gap: fc.integer({ min: 0, max: 20 * SEC }), action: actionArb }),
      },
      fc.record({ gap: fc.nat(5 * SEC), action: fc.constant({ type: "UNDO" as const }) }),
      fc.record({ gap: fc.nat(5 * SEC), action: fc.constant({ type: "REDO" as const }) }),
    );
    fc.assert(
      fc.property(fc.array(step, { maxLength: 40 }), (steps) => {
        let s = createSession(newGame({ timer: { mode: "bank", bankMs: 10 * MIN } }, seededRng(5)));
        let now = T0;
        for (const { gap, action } of steps) {
          now += gap;
          s = reduceSession(s, { ...action, now } as GameAction, { rng });
          const b = s.game.timer.blockers;
          if (b) {
            expect(b.seatId).toBe(s.game.turn.activeSeat);
            expect(s.game.timer.status === "running" || s.game.timer.status === "paused").toBe(
              true,
            );
          }
        }
      }),
      { numRuns: 200, seed: 20261119 },
    );
  });
});
