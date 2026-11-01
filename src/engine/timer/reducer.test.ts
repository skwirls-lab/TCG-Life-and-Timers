// @vitest-environment node
/** Timer engine transitions (T2.1): every mode, responses, pause, adjust, timeouts, sync, undo. */
import { describe, expect, it } from "vitest";
import { MIN, SEC, Table } from "../../../tests/unit/helpers/timer";
import { newGame, T0 } from "../../../tests/unit/helpers/engine";
import {
  counterValue,
  holder,
  matchRemaining,
  nextSignificantEvent,
  parseGame,
  reduce,
  reduceTimer,
  remaining,
  seededRng,
  syncTimer,
  turnStats,
  turnTimeUsed,
} from "../index";

const rng = seededRng(3);

describe("start and pass (bank)", () => {
  // @req TMR-001
  it("clocks wait for START; life tracking works before", () => {
    const x = new Table({ mode: "bank" });
    expect(x.timer.status).toBe("idle");
    x.doAt(5 * SEC, { type: "COUNTER_ADD", counterId: "life", seatId: "s1", delta: -1 });
    expect(counterValue(x.g, "life", "s1")).toBe(19);
    expect(x.timer.status).toBe("idle");
    expect(holder(x.g)).toBeNull();
    expect(x.rem("s1")).toBe(10 * MIN);
    expect(nextSignificantEvent(x.g, x.now)).toBeNull();
  });

  // @req TMR-002 @req TMR-003 @req TURN-001
  it("START runs the first player's clock; PASS_TURN stops it and starts the next living seat", () => {
    const x = new Table({ mode: "bank" });
    x.doAt(0, { type: "START_GAME" });
    expect(x.timer).toMatchObject({ status: "running", holder: "s1", runningSince: T0 });
    x.doAt(10 * SEC, { type: "ELIMINATE", seatId: "s2" });
    x.doAt(20 * SEC, { type: "PASS_TURN" });
    expect(x.g.turn.activeSeat).toBe("s3");
    expect(holder(x.g)).toBe("s3");
    x.at(25 * SEC);
    expect(x.rem("s1")).toBe(10 * MIN - 20 * SEC);
    expect(x.rem("s3")).toBe(10 * MIN - 5 * SEC);
    expect(x.rem("s2")).toBe(10 * MIN);
    expect(turnTimeUsed(x.g, "s3", x.now)).toBe(5 * SEC);
    expect(turnTimeUsed(x.g, "s1", x.now)).toBe(0);
  });

  // @req TMR-003
  it("PASS_TURN in 'ready' starts the game with the clock on the next seat", () => {
    const x = new Table({ mode: "bank" });
    x.doAt(0, { type: "PASS_TURN" });
    expect(x.g.status).toBe("running");
    expect(holder(x.g)).toBe("s2");
  });

  it("START_GAME mid-game starts clocks enabled after the game began; no-op otherwise", () => {
    const x = new Table({ mode: "off" });
    x.doAt(0, { type: "START_GAME" });
    x.doAt(1000, { type: "TIMER_SET_CONFIG", config: { mode: "bank", bankMs: MIN } });
    expect(x.timer.mode).toBe("bank");
    expect(x.timer.status).toBe("idle");
    x.doAt(2000, { type: "START_GAME" });
    expect(holder(x.g)).toBe("s1");
    const before = x.g;
    x.doAt(3000, { type: "START_GAME" });
    expect(x.g).toBe(before);
  });

  // @req TMR-024
  it("counter changes never touch the clocks", () => {
    const x = new Table({ mode: "bank" });
    x.doAt(0, { type: "START_GAME" });
    const timer = x.timer;
    x.doAt(4 * SEC, { type: "COUNTER_ADD", counterId: "life", seatId: "s1", delta: -3 });
    expect(x.timer).toBe(timer);
  });

  // @req TURN-002
  it("records time used per turn in the turn event and per-seat stats", () => {
    const x = new Table({ mode: "bank" });
    x.doAt(0, { type: "START_GAME" });
    x.doAt(10 * SEC, { type: "PASS_TURN" });
    x.doAt(15 * SEC, { type: "PASS_TURN" });
    x.doAt(18 * SEC, { type: "PASS_TURN" }, { type: "PASS_TURN" });
    x.doAt(38 * SEC, { type: "PASS_TURN" });
    expect(turnStats(x.g, "s1")).toEqual({
      turns: 2,
      timedTurns: 2,
      totalMs: 30 * SEC,
      averageMs: 15 * SEC,
    });
    expect(turnStats(x.g, "s3").averageMs).toBe(3 * SEC);
    expect(turnStats(x.g, "s4").averageMs).toBe(0);
    expect(turnStats(x.g, "zz")).toEqual({ turns: 0, timedTurns: 0, totalMs: 0, averageMs: null });
  });
});

describe("modes", () => {
  // @req TURN-001
  it("off: no clocks, turn tracking still works", () => {
    const x = new Table({ mode: "off" });
    expect(x.g.options.turnTracking).toBe(false);
    x.do({ type: "SET_OPTION", key: "turnTracking", value: true });
    x.doAt(0, { type: "START_GAME" }).doAt(SEC, { type: "PASS_TURN" });
    expect(x.g.turn.activeSeat).toBe("s2");
    expect(x.timer.status).toBe("idle");
    expect(holder(x.g)).toBeNull();
    expect(x.shown("s1")).toBe(0);
    expect(nextSignificantEvent(x.g, x.now)).toBeNull();
    const g = x.g;
    expect(reduceTimer(g, { type: "TIMER_PAUSE", now: T0 }, T0)).toBe(g);
    expect(syncTimer(g, T0)).toBe(g);
  });

  it("countup: tracks used time without limit; adjust edits the used time", () => {
    const x = new Table({ mode: "countup" });
    x.doAt(0, { type: "START_GAME" });
    x.at(90 * MIN);
    expect(x.rem("s1")).toBe(Number.POSITIVE_INFINITY);
    expect(x.shown("s1")).toBe(90 * MIN);
    expect(nextSignificantEvent(x.g, x.now)).toBeNull();
    x.do({ type: "TIMER_ADJUST", seatId: "s1", deltaMs: -100 * MIN });
    expect(x.used("s1")).toBe(0);
    x.do({ type: "TIMER_SET", seatId: "s2", bankMs: 5 * SEC });
    expect(x.used("s2")).toBe(5 * SEC);
  });

  // @req TMR-003
  it("bankIncrement: the passer gets +increment on each pass", () => {
    const x = new Table({ mode: "bankIncrement", bankMs: 15 * MIN, incrementMs: 10 * SEC });
    x.doAt(0, { type: "START_GAME" });
    x.doAt(30 * SEC, { type: "PASS_TURN" });
    expect(x.rem("s1")).toBe(15 * MIN - 20 * SEC);
    expect(x.g.log.at(-1)!.meta).toMatchObject({ incrementMs: 10 * SEC, timeUsedMs: 30 * SEC });
  });

  it("bankIncrement: an increment lifts a flagged clock back to normal", () => {
    const x = new Table({
      mode: "bankIncrement",
      bankMs: 5 * SEC,
      incrementMs: 10 * SEC,
      timeoutAction: "flag",
    });
    x.doAt(0, { type: "START_GAME" });
    x.doAt(6 * SEC, { type: "TIMER_TIMEOUT", seatId: "s1" });
    expect(x.timer.clocks.s1!.state).toBe("flagged");
    x.doAt(7 * SEC, { type: "PASS_TURN" });
    expect(x.timer.clocks.s1).toMatchObject({ bankMs: 8 * SEC, state: "normal" });
  });

  it("bankDelay: the first delayMs of each hold are free", () => {
    const x = new Table({ mode: "bankDelay", bankMs: 15 * MIN, delayMs: 5 * SEC });
    x.doAt(0, { type: "START_GAME" });
    x.at(3 * SEC);
    expect(x.rem("s1")).toBe(15 * MIN);
    x.at(8 * SEC);
    expect(x.rem("s1")).toBe(15 * MIN - 3 * SEC);
    expect(x.used("s1")).toBe(8 * SEC);
    // Pause mid-delay keeps the rest of the delay for this hold.
    x.doAt(10 * SEC, { type: "PASS_TURN" });
    x.doAt(12 * SEC, { type: "TIMER_PAUSE" });
    x.doAt(60 * SEC, { type: "TIMER_RESUME" });
    x.at(64 * SEC);
    expect(x.rem("s2")).toBe(15 * MIN - SEC);
    // A response is a new hold with its own delay.
    x.doAt(64 * SEC, { type: "TIMER_RESPOND", seatId: "s1" });
    x.at(68 * SEC);
    expect(x.rem("s1")).toBe(15 * MIN - 5 * SEC);
    expect(nextSignificantEvent(x.g, x.now)).toMatchObject({
      kind: "timeout",
      seatId: "s1",
      at: x.now + SEC + 15 * MIN - 5 * SEC,
    });
  });

  it("perTurn: fixed allotment resets on every pass; unused time is lost", () => {
    const x = new Table({ mode: "perTurn", perTurnMs: 3 * MIN });
    x.doAt(0, { type: "START_GAME" });
    x.doAt(MIN, { type: "TIMER_RESPOND", seatId: "s3" });
    x.doAt(MIN + 20 * SEC, { type: "TIMER_PASS_BACK", seatId: "s3" });
    x.at(2 * MIN);
    expect(x.rem("s1")).toBe(3 * MIN - 100 * SEC);
    expect(x.rem("s3")).toBe(3 * MIN - 20 * SEC);
    x.do({ type: "PASS_TURN" });
    expect(x.rem("s1")).toBe(3 * MIN);
    expect(x.rem("s3")).toBe(3 * MIN);
    x.at(2 * MIN + 30 * SEC);
    expect(x.rem("s2")).toBe(2 * MIN + 30 * SEC);
  });

  it("perTurn: a timed-out turn in grace starts the next turn fresh but keeps the used grace", () => {
    const x = new Table({
      mode: "perTurn",
      perTurnMs: 10 * SEC,
      timeoutAction: "grace",
      graceMs: 30 * SEC,
    });
    x.doAt(0, { type: "START_GAME" });
    x.doAt(10 * SEC, { type: "TIMER_TIMEOUT", seatId: "s1" });
    x.doAt(15 * SEC, { type: "PASS_TURN" });
    expect(x.timer.clocks.s1).toMatchObject({
      state: "normal",
      bankMs: 10 * SEC,
      graceMs: 25 * SEC,
    });
  });

  it("perTurnReserve: per-turn time first, then the reserve", () => {
    const x = new Table({ mode: "perTurnReserve", perTurnMs: 2 * MIN, reserveMs: 10 * MIN });
    x.doAt(0, { type: "START_GAME" });
    x.at(MIN);
    expect(x.shown("s1")).toBe(MIN);
    expect(x.rem("s1")).toBe(11 * MIN);
    x.at(3 * MIN);
    expect(x.shown("s1")).toBe(9 * MIN);
    expect(x.rem("s1")).toBe(9 * MIN);
    x.do(
      { type: "PASS_TURN" },
      { type: "PASS_TURN" },
      { type: "PASS_TURN" },
      { type: "PASS_TURN" },
    );
    expect(holder(x.g)).toBe("s1");
    expect(x.shown("s1")).toBe(2 * MIN);
    expect(x.rem("s1")).toBe(11 * MIN);
  });

  it("perTurnReserve: overtime draws the per-turn part before grace", () => {
    const x = new Table({
      mode: "perTurnReserve",
      perTurnMs: 10 * SEC,
      reserveMs: 5 * SEC,
      timeoutAction: "grace",
      graceMs: 20 * SEC,
    });
    x.doAt(0, { type: "START_GAME" });
    x.doAt(15 * SEC, { type: "TIMER_TIMEOUT", seatId: "s1" });
    x.doAt(
      16 * SEC,
      { type: "PASS_TURN" },
      { type: "PASS_TURN" },
      { type: "PASS_TURN" },
      { type: "PASS_TURN" },
    );
    x.at(20 * SEC);
    expect(x.shown("s1")).toBe(6 * SEC);
    x.at(30 * SEC);
    expect(x.shown("s1")).toBe(15 * SEC);
    expect(x.rem("s1")).toBe(15 * SEC);
  });
});

describe("match timer (TMR-032)", () => {
  // @req TMR-032 @req TMR-020
  it("counts down globally, pauses with the clocks, then counts extra turns", () => {
    const x = new Table({
      mode: "bank",
      bankMs: 90 * MIN,
      match: { totalMs: 50 * MIN, extraTurns: 2 },
    });
    x.doAt(0, { type: "START_GAME" });
    x.doAt(10 * MIN, { type: "TIMER_PAUSE" });
    x.at(20 * MIN);
    expect(matchRemaining(x.g, x.now)).toEqual({
      remainingMs: 40 * MIN,
      timeCalled: false,
      extraTurnsRemaining: 2,
    });
    expect(nextSignificantEvent(x.g, x.now)).toBeNull();
    x.do({ type: "TIMER_RESUME" });
    expect(nextSignificantEvent(x.g, x.now)).toEqual({ at: x.now + 40 * MIN, kind: "matchEnd" });
    x.doAt(65 * MIN, { type: "PASS_TURN" });
    const end = x.g.log.find((e) => e.meta?.action === "matchEnd")!;
    expect(end.at).toBe(T0 + 60 * MIN);
    expect(matchRemaining(x.g, x.now)).toMatchObject({ timeCalled: true, extraTurnsRemaining: 1 });
    x.do({ type: "PASS_TURN" }, { type: "PASS_TURN" });
    expect(matchRemaining(x.g, x.now)!.extraTurnsRemaining).toBe(0);
    expect(matchRemaining(new Table({}).g, T0)).toBeNull();
  });
});

describe("responses (TMR-005..010)", () => {
  // @req TMR-005 @req TMR-007 @req TMR-008
  it("respond / nested / return to active", () => {
    const x = new Table({ mode: "bank" });
    x.doAt(0, { type: "START_GAME" });
    x.doAt(SEC, { type: "TIMER_RESPOND", seatId: "s2" });
    x.doAt(2 * SEC, { type: "TIMER_RESPOND", seatId: "s3" });
    expect(x.lastTimerEvent()).toMatchObject({
      seatId: "s3",
      meta: { action: "respond", depth: 2 },
    });
    x.doAt(3 * SEC, { type: "TIMER_RESPOND", seatId: "s2" });
    expect(x.timer.responseStack).toEqual(["s2", "s3", "s2"]);
    x.doAt(4 * SEC, { type: "TIMER_RETURN_TO_ACTIVE" });
    expect(x.timer.responseStack).toEqual([]);
    expect(holder(x.g)).toBe("s1");
    expect(x.lastTimerEvent()!.meta).toMatchObject({ action: "returnToActive", cleared: 3 });
    x.at(5 * SEC);
    expect([x.rem("s1"), x.rem("s2"), x.rem("s3")]).toEqual([
      10 * MIN - 2 * SEC,
      10 * MIN - 2 * SEC,
      10 * MIN - SEC,
    ]);
  });

  it("rejects invalid responses (no-op, same game object)", () => {
    const x = new Table({ mode: "bank" });
    const idle = x.g;
    x.do({ type: "TIMER_RESPOND", seatId: "s2" });
    expect(x.g).toBe(idle);
    x.doAt(0, { type: "START_GAME" }, { type: "ELIMINATE", seatId: "s4" });
    const g = x.g;
    x.doAt(SEC, { type: "TIMER_RESPOND", seatId: "s1" }); // the holder
    x.do({ type: "TIMER_RESPOND", seatId: "s4" }); // eliminated
    x.do({ type: "TIMER_RESPOND", seatId: "nope" });
    x.do({ type: "TIMER_PASS_BACK", seatId: "s2" }); // not the top
    x.do({ type: "TIMER_RETURN_TO_ACTIVE" }); // empty stack
    x.do({ type: "TIMER_RESUME" }); // not paused
    x.do({ type: "TIMER_TIMEOUT", seatId: "s1" }); // not due
    x.do({ type: "TIMER_ADJUST", seatId: "s1", deltaMs: 0 });
    x.do({ type: "TIMER_ADJUST", seatId: "nope", deltaMs: 5 });
    x.do({ type: "TIMER_SET", seatId: "s1", bankMs: Number.NaN });
    expect(x.g).toBe(g);
  });

  it("responses 'disabled' ignores Respond", () => {
    const x = new Table({ mode: "bank", responses: "disabled" });
    x.doAt(0, { type: "START_GAME" });
    const g = x.g;
    x.doAt(SEC, { type: "TIMER_RESPOND", seatId: "s2" });
    expect(x.g).toBe(g);
  });

  // @req TMR-009
  it("PASS_TURN is blocked while responses are pending unless the turn holder is on top", () => {
    const x = new Table({ mode: "bank" });
    x.doAt(0, { type: "START_GAME" });
    x.doAt(SEC, { type: "TIMER_RESPOND", seatId: "s2" });
    const g = x.g;
    x.doAt(2 * SEC, { type: "PASS_TURN" });
    expect(x.g).toBe(g);
    x.doAt(3 * SEC, { type: "TIMER_RESPOND", seatId: "s1" });
    x.doAt(4 * SEC, { type: "PASS_TURN" });
    expect(x.timer.responseStack).toEqual([]);
    expect(holder(x.g)).toBe("s2");
    expect(x.g.turn.activeSeat).toBe("s2");
  });

  // @req TMR-010
  it("freeze mode: a response pauses every clock", () => {
    const x = new Table({
      mode: "bank",
      responses: "freeze",
      match: { totalMs: MIN, extraTurns: 0 },
    });
    x.doAt(0, { type: "START_GAME" });
    x.doAt(10 * SEC, { type: "TIMER_RESPOND", seatId: "s2" });
    expect(holder(x.g)).toBe("s2");
    x.at(40 * SEC);
    expect(x.rem("s1")).toBe(10 * MIN - 10 * SEC);
    expect(x.rem("s2")).toBe(10 * MIN);
    expect(nextSignificantEvent(x.g, x.now)).toMatchObject({ kind: "matchEnd" });
    x.doAt(40 * SEC, { type: "TIMER_PASS_BACK", seatId: "s2" });
    x.at(45 * SEC);
    expect(x.rem("s1")).toBe(10 * MIN - 15 * SEC);
  });

  it("responses work while paused (nobody is charged)", () => {
    const x = new Table({ mode: "bank" });
    x.doAt(0, { type: "START_GAME" });
    x.doAt(SEC, { type: "TIMER_PAUSE", reason: "menu" });
    x.doAt(2 * SEC, { type: "TIMER_RESPOND", seatId: "s3" });
    expect(x.timer).toMatchObject({ holder: "s3", status: "paused", pausedReason: "menu" });
    expect(holder(x.g)).toBeNull();
    x.doAt(10 * SEC, { type: "TIMER_RESUME" });
    expect(x.lastTimerEvent()!.meta).toEqual({ action: "resume", reason: "menu" });
    x.at(12 * SEC);
    expect(x.rem("s3")).toBe(10 * MIN - 2 * SEC);
    expect(x.rem("s1")).toBe(10 * MIN - SEC);
  });
});

describe("pause / adjust (TMR-020..022)", () => {
  // @req TMR-020 @req TMR-021
  it("pause freezes all clocks", () => {
    const x = new Table({ mode: "bank" });
    x.doAt(0, { type: "START_GAME" });
    x.doAt(SEC, { type: "TIMER_PAUSE", reason: "background" });
    expect(x.timer).toMatchObject({
      status: "paused",
      pausedReason: "background",
      runningSince: null,
    });
    expect(x.lastTimerEvent()!.meta).toEqual({ action: "pause", reason: "background" });
    const g = x.g;
    x.doAt(2 * SEC, { type: "TIMER_PAUSE" });
    expect(x.g).toBe(g);
    x.at(10 * MIN);
    expect(x.rem("s1")).toBe(10 * MIN - SEC);
    x.do({ type: "TIMER_RESUME" });
    expect(x.timer.pausedReason).toBeUndefined();
    x.at(10 * MIN + SEC);
    expect(x.rem("s1")).toBe(10 * MIN - 2 * SEC);
    // Pass during a pause moves the (paused) clock.
    x.doAt(11 * MIN, { type: "TIMER_PAUSE" }, { type: "PASS_TURN" });
    expect(x.timer).toMatchObject({ holder: "s2", status: "paused" });
  });

  // @req TMR-022
  it("adjust/set are logged with adjusted:true", () => {
    const x = new Table({ mode: "bank" });
    x.doAt(0, { type: "START_GAME" });
    x.doAt(30 * SEC, { type: "TIMER_ADJUST", seatId: "s1", deltaMs: MIN });
    expect(x.rem("s1")).toBe(10 * MIN + 30 * SEC);
    expect(x.lastTimerEvent()).toMatchObject({
      seatId: "s1",
      delta: MIN,
      from: 10 * MIN - 30 * SEC,
      to: 10 * MIN + 30 * SEC,
      meta: { action: "adjust", adjusted: true },
    });
    x.do({ type: "TIMER_SET", seatId: "s3", bankMs: 5 * MIN });
    expect(x.rem("s3")).toBe(5 * MIN);
    expect(x.lastTimerEvent()!.meta).toEqual({ action: "set", adjusted: true });
    // Adjusting below zero times the holder out immediately.
    x.do({ type: "TIMER_SET", seatId: "s1", bankMs: 0 });
    expect(x.g.seats[0]!.eliminated).toBe(true);
    expect(holder(x.g)).toBe("s2");
  });
});

describe("timeouts (§9.5)", () => {
  // @req TMR-030
  it("lose: eliminated with cause Time at 0:00", () => {
    const x = new Table({ mode: "bank", bankMs: 5 * SEC, timeoutAction: "lose" });
    x.doAt(0, { type: "START_GAME" });
    expect(nextSignificantEvent(x.g, x.now)).toEqual({
      at: T0 + 5 * SEC,
      kind: "timeout",
      seatId: "s1",
    });
    x.doAt(5 * SEC, { type: "TIMER_TIMEOUT", seatId: "s1" });
    expect(x.g.seats[0]).toMatchObject({ eliminated: true, eliminatedCause: { kind: "time" } });
    expect(x.lastTimerEvent()).toMatchObject({
      seatId: "s1",
      meta: { action: "timeout", result: "eliminated", phase: "timeout" },
    });
    expect(holder(x.g)).toBe("s2");
  });

  it("a late timeout charges the lateness to the next holder, not the timed-out seat", () => {
    const x = new Table({ mode: "bank", bankMs: 5 * SEC, timeoutAction: "lose" });
    x.doAt(0, { type: "START_GAME" });
    x.doAt(7 * SEC, { type: "TIMER_TIMEOUT", seatId: "s1" });
    expect(x.timer.clocks.s1).toMatchObject({ bankMs: 0, usedMs: 5 * SEC, state: "timedOut" });
    expect(x.rem("s2")).toBe(5 * SEC - 2 * SEC);
    expect(x.used("s2")).toBe(2 * SEC);
  });

  // @req TMR-044 regression (found by the timer property test): an adjustment below 0:00 is
  // not time held past it, so nothing moves to the next holder and real usage is kept.
  it("an adjustment past 0:00 eliminates without charging the adjusted-away time to anyone", () => {
    const x = new Table({ mode: "perTurn", perTurnMs: SEC, timeoutAction: "lose" });
    x.doAt(0, { type: "START_GAME" });
    x.doAt(SEC, { type: "TIMER_TIMEOUT", seatId: "s1" });
    expect(holder(x.g)).toBe("s2");
    x.do({ type: "TIMER_ADJUST", seatId: "s2", deltaMs: -1001 });
    expect(x.g.seats[1]!.eliminated).toBe(true);
    expect(holder(x.g)).toBe("s3");
    expect(x.used("s3")).toBe(0);
    expect(x.rem("s3")).toBe(SEC);
    expect(x.used("s1") + x.used("s2") + x.used("s3") + x.used("s4")).toBe(SEC);
  });

  // @req TMR-044
  it("an adjustment past 0:00 keeps the time the holder really used (addOnce → final lose)", () => {
    const x = new Table({
      mode: "perTurnReserve",
      perTurnMs: SEC,
      reserveMs: 0,
      timeoutAction: "addOnce",
      addOnceMs: SEC,
      finalAction: "lose",
    });
    x.doAt(0, { type: "START_GAME" });
    x.doAt(1, { type: "TIMER_ADJUST", seatId: "s1", deltaMs: -2 * SEC });
    expect(x.g.seats[0]!.eliminated).toBe(true);
    expect(x.used("s1")).toBe(1);
    expect(x.used("s2")).toBe(0);
  });

  // @req TMR-044
  it("a late timeout found while adjusting still carries only the real lateness", () => {
    const x = new Table({ mode: "bank", bankMs: 5 * SEC, timeoutAction: "lose" });
    x.doAt(0, { type: "START_GAME" });
    // 2 s past 0:00 (the timeout was not dispatched in time), then an adjustment of −3 s
    x.doAt(7 * SEC, { type: "TIMER_ADJUST", seatId: "s1", deltaMs: -3 * SEC });
    expect(x.g.seats[0]!.eliminated).toBe(true);
    expect(x.used("s1")).toBe(5 * SEC);
    expect(x.used("s2")).toBe(2 * SEC);
  });

  it("a late grace end also carries the lateness", () => {
    const x = new Table({ mode: "bank", bankMs: SEC, timeoutAction: "grace", graceMs: SEC });
    x.doAt(0, { type: "START_GAME" });
    x.doAt(2500, { type: "TIMER_TIMEOUT", seatId: "s1" }); // overtime + grace end in one go
    expect(x.g.seats[0]!.eliminated).toBe(true);
    expect(x.used("s1")).toBe(2 * SEC);
    expect(x.used("s2")).toBe(500);
  });

  // @req TMR-030
  it("flag: keeps counting negative, nobody is eliminated", () => {
    const x = new Table({ mode: "bank", bankMs: 5 * SEC, timeoutAction: "flag" });
    x.doAt(0, { type: "START_GAME" });
    x.doAt(5 * SEC, { type: "TIMER_TIMEOUT", seatId: "s1" });
    expect(x.timer.clocks.s1!.state).toBe("flagged");
    x.at(50 * SEC);
    expect(x.rem("s1")).toBe(-45 * SEC);
    expect(nextSignificantEvent(x.g, x.now)).toBeNull();
    x.do({ type: "TIMER_ADJUST", seatId: "s1", deltaMs: MIN });
    expect(x.timer.clocks.s1).toMatchObject({ state: "normal", bankMs: 15 * SEC });
  });

  it("grace then final action 'flag'", () => {
    const x = new Table({
      mode: "bank",
      bankMs: SEC,
      timeoutAction: "grace",
      graceMs: 2 * SEC,
      finalAction: "flag",
    });
    x.doAt(0, { type: "START_GAME" });
    x.doAt(SEC, { type: "TIMER_TIMEOUT", seatId: "s1" });
    x.doAt(3 * SEC, { type: "TIMER_TIMEOUT", seatId: "s1" });
    expect(x.timer.clocks.s1!.state).toBe("flagged");
    x.at(4 * SEC);
    expect(x.rem("s1")).toBe(-SEC);
  });

  it("overtime: adjust back above 0 leaves overtime", () => {
    const x = new Table({ mode: "bank", bankMs: SEC, timeoutAction: "grace", graceMs: 10 * SEC });
    x.doAt(0, { type: "START_GAME" });
    x.doAt(SEC, { type: "TIMER_TIMEOUT", seatId: "s1" });
    x.doAt(3 * SEC, { type: "TIMER_ADJUST", seatId: "s1", deltaMs: 30 * SEC });
    expect(x.timer.clocks.s1).toMatchObject({
      state: "normal",
      bankMs: 30 * SEC,
      graceMs: 8 * SEC,
    });
  });

  // @req TMR-030
  it("addOnce: one extension, then the final action", () => {
    const x = new Table({
      mode: "bank",
      bankMs: SEC,
      timeoutAction: "addOnce",
      addOnceMs: 5 * SEC,
    });
    x.doAt(0, { type: "START_GAME" });
    x.doAt(SEC, { type: "TIMER_TIMEOUT", seatId: "s1" });
    expect(x.timer.clocks.s1).toMatchObject({ addOnceUsed: true, state: "normal" });
    expect(x.rem("s1")).toBe(5 * SEC);
    x.doAt(6 * SEC, { type: "TIMER_TIMEOUT", seatId: "s1" });
    expect(x.g.seats[0]!.eliminated).toBe(true);
    const y = new Table({
      mode: "bank",
      bankMs: SEC,
      timeoutAction: "addOnce",
      addOnceMs: SEC,
      finalAction: "flag",
    });
    y.doAt(0, { type: "START_GAME" });
    y.doAt(SEC, { type: "TIMER_TIMEOUT", seatId: "s1" });
    y.doAt(2 * SEC, { type: "TIMER_TIMEOUT", seatId: "s1" });
    expect(y.timer.clocks.s1!.state).toBe("flagged");
  });

  it("a pass after 0:00 still times out the passer (due timeout for a non-holder)", () => {
    const x = new Table({ mode: "bankIncrement", bankMs: 5 * SEC, incrementMs: 10 * SEC });
    x.doAt(0, { type: "START_GAME" });
    x.doAt(6 * SEC, { type: "PASS_TURN" });
    expect(x.g.seats[0]!.eliminated).toBe(true);
    expect(holder(x.g)).toBe("s2");
    const y = new Table({ mode: "bank", bankMs: 5 * SEC });
    y.doAt(0, { type: "START_GAME" });
    // Simulate a passer whose timeout was not processed (e.g. restored state).
    const late = reduceTimer(
      {
        ...y.g,
        timer: {
          ...y.g.timer,
          clocks: { ...y.g.timer.clocks, s2: { ...y.g.timer.clocks.s2!, bankMs: -1 } },
        },
      },
      { type: "TIMER_PAUSE", now: T0 + SEC },
      T0 + SEC,
    );
    expect(nextSignificantEvent(late, T0 + SEC)).toBeNull();
    expect(late.seats[1]!.eliminated).toBe(true);
    const due = {
      ...y.g,
      timer: {
        ...y.g.timer,
        clocks: { ...y.g.timer.clocks, s2: { ...y.g.timer.clocks.s2!, bankMs: -1 } },
      },
    };
    expect(nextSignificantEvent(due, T0 + SEC)).toEqual({
      at: T0 + SEC,
      kind: "timeout",
      seatId: "s2",
    });
  });

  // @req TMR-031
  it("warnings fire at each threshold, descending", () => {
    const x = new Table({ mode: "bank", bankMs: 6 * MIN, warningsMs: [MIN, 5 * MIN, 10 * SEC] });
    x.doAt(0, { type: "START_GAME" });
    const seen: number[] = [];
    let now = x.now;
    for (let i = 0; i < 3; i++) {
      const ev = nextSignificantEvent(x.g, now)!;
      expect(ev.kind).toBe("warning");
      seen.push(ev.at - T0);
      expect(remainingAt(x, ev.at)).toBe(ev.thresholdMs);
      now = ev.at;
    }
    expect(seen).toEqual([MIN, 5 * MIN, 6 * MIN - 10 * SEC]);
    expect(nextSignificantEvent(x.g, now)).toMatchObject({ kind: "timeout", at: T0 + 6 * MIN });
  });
});

function remainingAt(x: Table, at: number) {
  return x.at(at - T0).rem("s1");
}

describe("elimination sync (TMR-023)", () => {
  // @req TMR-023
  it("holder eliminated by a life threshold → clock moves to the next living seat", () => {
    const x = new Table({ mode: "bank" });
    x.doAt(0, { type: "START_GAME" });
    x.doAt(10 * SEC, { type: "COUNTER_SET", counterId: "life", seatId: "s1", value: 0 });
    expect(x.g.seats[0]!.eliminated).toBe(true);
    expect(holder(x.g)).toBe("s2");
    x.at(15 * SEC);
    expect(x.rem("s1")).toBe(10 * MIN - 10 * SEC);
    expect(x.rem("s2")).toBe(10 * MIN - 5 * SEC);
  });

  // @req TMR-023
  it("responder eliminated → removed from the stack, clock returns to the next entry", () => {
    const x = new Table({ mode: "bank" });
    x.doAt(0, { type: "START_GAME" });
    x.doAt(SEC, { type: "TIMER_RESPOND", seatId: "s2" });
    x.doAt(2 * SEC, { type: "TIMER_RESPOND", seatId: "s3" });
    x.doAt(3 * SEC, { type: "CONCEDE", seatId: "s3" });
    expect(x.timer.responseStack).toEqual(["s2"]);
    expect(holder(x.g)).toBe("s2");
    x.doAt(4 * SEC, { type: "TIMER_RESPOND", seatId: "s3" });
    x.doAt(
      4 * SEC,
      { type: "TIMER_RESPOND", seatId: "s1" },
      { type: "TIMER_RESPOND", seatId: "s2" },
    );
    x.doAt(5 * SEC, { type: "ELIMINATE", seatId: "s1" });
    // [s2, s1, s2] → [s2, s2] → collapsed to [s2]
    expect(x.timer.responseStack).toEqual(["s2"]);
    expect(x.g.turn.activeSeat).toBe("s2");
  });

  it("turn holder eliminated with turn tracking off → clock still moves on", () => {
    const x = new Table({ mode: "bank" });
    x.do({ type: "SET_OPTION", key: "turnTracking", value: false });
    x.doAt(0, { type: "START_GAME" });
    x.doAt(SEC, { type: "ELIMINATE", seatId: "s1" });
    expect(x.g.turn.activeSeat).toBe("s2");
    expect(holder(x.g)).toBe("s2");
  });

  // @req GAME-014
  it("game end stops the clocks; a revive reopens and restarts them", () => {
    const x = new Table({ mode: "bank" });
    x.doAt(0, { type: "START_GAME" });
    x.doAt(SEC, { type: "ELIMINATE", seatId: "s2" }, { type: "ELIMINATE", seatId: "s3" });
    x.doAt(2 * SEC, { type: "TIMER_PAUSE" });
    x.doAt(3 * SEC, { type: "ELIMINATE", seatId: "s4" });
    expect(x.g.status).toBe("ended");
    expect(x.timer).toMatchObject({ status: "ended", holder: null, runningSince: null });
    expect(holder(x.g)).toBeNull();
    expect(nextSignificantEvent(x.g, x.now)).toBeNull();
    x.doAt(60 * SEC, { type: "REVIVE", seatId: "s4" });
    expect(x.g.status).toBe("running");
    expect(x.timer.status).toBe("running");
    expect(holder(x.g)).toBe("s1");
    x.at(61 * SEC);
    expect(x.rem("s1")).toBe(10 * MIN - 3 * SEC);
  });

  it("END_GAME stops the clocks", () => {
    const x = new Table({ mode: "bank" });
    x.doAt(0, { type: "START_GAME" });
    x.doAt(5 * SEC, { type: "END_GAME", winners: ["s1"] });
    expect(x.timer.status).toBe("ended");
    expect(x.timer.clocks.s1!.usedMs).toBe(5 * SEC);
  });

  it("a revived timed-out seat continues flagged", () => {
    const x = new Table({ mode: "bank", bankMs: SEC });
    x.doAt(0, { type: "START_GAME" });
    x.doAt(SEC, { type: "TIMER_TIMEOUT", seatId: "s1" });
    x.doAt(2 * SEC, { type: "REVIVE", seatId: "s1" });
    expect(x.timer.clocks.s1!.state).toBe("flagged");
    expect(x.g.seats[0]!.eliminated).toBe(false);
    const y = new Table({ mode: "bank", bankMs: SEC });
    y.doAt(0, { type: "START_GAME" });
    y.doAt(SEC, { type: "TIMER_TIMEOUT", seatId: "s1" });
    y.do({ type: "TIMER_ADJUST", seatId: "s1", deltaMs: MIN }, { type: "REVIVE", seatId: "s1" });
    expect(y.timer.clocks.s1!.state).toBe("normal");
  });

  it("hook actions that change nothing stay no-ops", () => {
    const x = new Table({ mode: "bank" });
    x.doAt(0, { type: "START_GAME" }, { type: "ELIMINATE", seatId: "s3" });
    const g = x.g;
    x.doAt(SEC, { type: "ELIMINATE", seatId: "s3" }, { type: "REVIVE", seatId: "s2" });
    expect(x.g).toBe(g);
  });
});

describe("reset, seats, config", () => {
  // @req GAME-010
  it("RESET_GAME resets the clocks", () => {
    const x = new Table({ mode: "bank" });
    x.doAt(0, { type: "START_GAME" });
    x.doAt(MIN, { type: "PASS_TURN" }, { type: "RESET_GAME" });
    expect(x.timer.status).toBe("idle");
    expect(x.timer.holder).toBeNull();
    expect(x.rem("s1")).toBe(10 * MIN);
  });

  it("SEAT_ADD gives the new seat a fresh clock; SEAT_REMOVE of the holder moves the clock", () => {
    const x = new Table({ mode: "bank" });
    x.doAt(0, { type: "START_GAME" });
    x.doAt(SEC, { type: "SEAT_ADD", seat: { id: "s5", name: "Late" } });
    expect(x.rem("s5")).toBe(10 * MIN);
    x.doAt(2 * SEC, { type: "SEAT_REMOVE", seatId: "s1" });
    expect(holder(x.g)).toBe("s2");
    x.at(3 * SEC);
    expect(x.rem("s2")).toBe(10 * MIN - SEC);
  });

  it("TIMER_SET_CONFIG: structure before start; runtime keys only while running", () => {
    const x = new Table({ mode: "bank" });
    x.do({ type: "TIMER_SET_CONFIG", config: { bankMs: 3 * MIN } });
    expect(x.rem("s1")).toBe(3 * MIN);
    const g = x.g;
    x.do({ type: "TIMER_SET_CONFIG", config: { bankMs: 3 * MIN } });
    expect(x.g).toBe(g);
    x.doAt(0, { type: "START_GAME" });
    x.doAt(SEC, { type: "TIMER_SET_CONFIG", config: { bankMs: 99 * MIN, responses: "freeze" } });
    expect(x.timer.config).toMatchObject({ bankMs: 3 * MIN, responses: "freeze" });
    const h = x.g;
    x.doAt(2 * SEC, { type: "TIMER_SET_CONFIG", config: { mode: "countup" } });
    expect(x.g).toBe(h);
    expect(x.rem("s1")).toBe(3 * MIN - 2 * SEC);
  });

  it("enabling clocks before start turns on turn tracking", () => {
    const g = newGame({ timer: { mode: "off" } });
    expect(g.options.turnTracking).toBe(false);
    const n = reduce(
      g,
      { type: "TIMER_SET_CONFIG", config: { mode: "countup" }, now: T0 },
      { rng },
    );
    expect(n.options.turnTracking).toBe(true);
    expect(n.timer.mode).toBe("countup");
  });
});

describe("undo (TMR-004)", () => {
  // @req TMR-004
  it("undoing a pass puts the clock back on the passer, charging the elapsed time to them", () => {
    const x = new Table({ mode: "bankIncrement", bankMs: 10 * MIN, incrementMs: 5 * SEC });
    x.doAt(0, { type: "START_GAME" });
    x.doAt(30 * SEC, { type: "PASS_TURN" });
    x.doAt(32 * SEC, { type: "UNDO" });
    expect(x.g.turn.activeSeat).toBe("s1");
    expect(holder(x.g)).toBe("s1");
    // As if the pass never happened: no increment; 32 s charged to s1; s2 untouched.
    expect(x.rem("s1")).toBe(10 * MIN - 32 * SEC);
    expect(x.rem("s2")).toBe(10 * MIN);
    x.at(40 * SEC);
    expect(x.rem("s1")).toBe(10 * MIN - 40 * SEC);
    x.do({ type: "REDO" });
    expect(holder(x.g)).toBe("s2");
    expect(x.rem("s2")).toBe(10 * MIN - 10 * SEC);
  });

  it("undoing a response returns the time to the original holder's account", () => {
    const x = new Table({ mode: "bank" });
    x.doAt(0, { type: "START_GAME" });
    x.doAt(10 * SEC, { type: "TIMER_RESPOND", seatId: "s3" });
    x.doAt(12 * SEC, { type: "UNDO" });
    expect(holder(x.g)).toBe("s1");
    expect(x.rem("s1")).toBe(10 * MIN - 12 * SEC);
    expect(x.rem("s3")).toBe(10 * MIN);
  });
});

describe("syncTimer", () => {
  it("returns the same game when consistent", () => {
    const x = new Table({ mode: "bank" });
    expect(syncTimer(x.g, T0)).toBe(x.g);
    x.doAt(0, { type: "START_GAME" });
    expect(syncTimer(x.g, T0 + SEC)).toBe(x.g);
  });
});

describe("persistence", () => {
  // @req TMR-044
  it("a running timer state round-trips through the Game schema (reload resumes exactly)", () => {
    const x = new Table({ mode: "bankDelay", delayMs: 5 * SEC, finalAction: "flag" });
    x.doAt(0, { type: "START_GAME" }).doAt(3 * SEC, { type: "TIMER_RESPOND", seatId: "s2" });
    const restored = parseGame(JSON.parse(JSON.stringify(x.g)));
    expect(restored.timer).toEqual(x.g.timer);
    expect(remaining(restored, "s2", T0 + 20 * SEC)).toBe(10 * MIN - 12 * SEC);
  });
});
