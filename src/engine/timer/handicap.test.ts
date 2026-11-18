// @vitest-environment node
// @req TMR-060
/**
 * TMR-060 handicap: per-seat extra starting time (TimerConfig.seatExtraMs) across modes, reset,
 * restart, undo and seat-count changes; plus the bankDelay turn-start buffer audit.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { MIN, SEC, Table } from "../../../tests/unit/helpers/timer";
import { newGame, T0 } from "../../../tests/unit/helpers/engine";
import {
  createSession,
  initialTimerState,
  defaultTimerConfig,
  parseGame,
  reduceSession,
  remaining,
  seatAllotmentMs,
  seededRng,
  type GameAction,
} from "../index";

const EXTRA = { s2: 5 * MIN, s3: -2 * MIN };

describe("TMR-060 per-seat starting time", () => {
  it("bank modes: each seat starts with base + its extra time", () => {
    const x = new Table({ mode: "bank", bankMs: 10 * MIN, seatExtraMs: EXTRA });
    expect(x.rem("s1")).toBe(10 * MIN);
    expect(x.rem("s2")).toBe(15 * MIN);
    expect(x.rem("s3")).toBe(8 * MIN);
    // Increment is the same for everyone.
    const y = new Table({ mode: "bankIncrement", incrementMs: 5 * SEC, seatExtraMs: EXTRA });
    y.doAt(0, { type: "START_GAME" }, { type: "PASS_TURN" });
    y.doAt(10 * SEC, { type: "PASS_TURN" });
    expect(y.rem("s2")).toBe(15 * MIN - 5 * SEC);
  });

  it("perTurn: the per-turn allowance is per seat and refreshes every turn", () => {
    const x = new Table({ mode: "perTurn", perTurnMs: MIN, seatExtraMs: { s2: 30 * SEC } });
    expect(x.rem("s2")).toBe(90 * SEC);
    expect(x.timer.clocks.s2!.turnMs).toBe(90 * SEC);
    expect(x.timer.clocks.s1!.turnMs).toBeUndefined();
    x.doAt(0, { type: "START_GAME" }, { type: "PASS_TURN" });
    x.doAt(80 * SEC, { type: "PASS_TURN" });
    x.doAt(80 * SEC + 4 * 60 * SEC, { type: "PASS_TURN" }, { type: "PASS_TURN" });
    expect(x.g.turn.activeSeat).toBe("s1");
    expect(x.rem("s2")).toBe(90 * SEC);
  });

  it("perTurnReserve: extra goes to the per-turn part; the reserve stays shared", () => {
    const x = new Table({
      mode: "perTurnReserve",
      perTurnMs: MIN,
      reserveMs: 5 * MIN,
      seatExtraMs: { s1: 30 * SEC },
    });
    expect(x.rem("s1")).toBe(5 * MIN + 90 * SEC);
    expect(x.rem("s2")).toBe(6 * MIN);
    x.doAt(0, { type: "START_GAME" });
    x.at(100 * SEC);
    expect(x.rem("s1")).toBe(5 * MIN - 10 * SEC);
  });

  it("countup ignores it; the allotment never goes below 0", () => {
    const x = new Table({ mode: "countup", seatExtraMs: EXTRA });
    expect(x.timer.clocks.s2!.bankMs).toBe(0);
    const cfg = defaultTimerConfig({ mode: "bank", bankMs: MIN, seatExtraMs: { s1: -5 * MIN } });
    expect(seatAllotmentMs(cfg, "s1")).toBe(0);
    expect(seatAllotmentMs(cfg)).toBe(MIN);
  });

  it("TIMER_RESET_CLOCKS, RESET_GAME and a new idle config respect it; undo restores", () => {
    const x = new Table({ mode: "bank", bankMs: 10 * MIN, seatExtraMs: EXTRA });
    x.doAt(0, { type: "START_GAME" });
    x.doAt(MIN, { type: "PASS_TURN" });
    x.doAt(2 * MIN, { type: "TIMER_RESET_CLOCKS" });
    expect(x.timer.status).toBe("idle");
    expect(x.rem("s1")).toBe(10 * MIN);
    expect(x.rem("s2")).toBe(15 * MIN);
    x.doAt(2 * MIN, { type: "TIMER_RESET_CLOCKS", config: { seatExtraMs: { s4: MIN } } });
    expect(x.rem("s2")).toBe(10 * MIN);
    expect(x.rem("s4")).toBe(11 * MIN);
    x.do({ type: "UNDO" });
    expect(x.rem("s2")).toBe(15 * MIN);
    x.do({ type: "RESET_GAME" });
    expect(x.rem("s2")).toBe(15 * MIN);
    expect(x.rem("s3")).toBe(8 * MIN);
    x.do({ type: "TIMER_SET_CONFIG", config: { bankMs: 20 * MIN } });
    expect(x.rem("s2")).toBe(25 * MIN);
  });

  it("is a structure key: ignored while the clocks run", () => {
    const x = new Table({ mode: "bank", bankMs: 10 * MIN });
    x.doAt(0, { type: "START_GAME" });
    x.do({ type: "TIMER_SET_CONFIG", config: { seatExtraMs: { s1: MIN } } });
    expect(x.timer.config.seatExtraMs).toBeUndefined();
  });

  it("seat add/remove: removed seats are pruned, so a reused id starts at the base", () => {
    const x = new Table({ mode: "bank", bankMs: 10 * MIN, seatExtraMs: { s4: 3 * MIN } });
    x.doAt(0, { type: "SEAT_REMOVE", seatId: "s4" });
    expect(x.timer.config.seatExtraMs).toEqual({});
    x.do({ type: "SEAT_ADD" });
    const added = x.g.seats.at(-1)!.id;
    expect(added).toBe("s4");
    expect(x.rem(added)).toBe(10 * MIN);
    // A new seat with its own (pre-set) id entry gets it.
    const y = new Table({ mode: "bank", bankMs: 10 * MIN, seatExtraMs: { s2: MIN } });
    y.do({ type: "SEAT_REMOVE", seatId: "s3" }, { type: "SEAT_ADD" });
    expect(y.rem("s2")).toBe(11 * MIN);
  });

  it("initialTimerState prunes entries for seats not in the game; persists through parseGame", () => {
    const cfg = defaultTimerConfig({ mode: "bank", seatExtraMs: { s1: MIN, s9: MIN } });
    expect(initialTimerState(cfg, ["s1", "s2"]).config.seatExtraMs).toEqual({ s1: MIN });
    const g = newGame({ timer: { mode: "bank", seatExtraMs: { s2: MIN } } });
    const back = parseGame(JSON.parse(JSON.stringify(g)));
    expect(back.timer.config.seatExtraMs).toEqual({ s2: MIN });
    expect(remaining(back, "s2", T0)).toBe(g.timer.config.bankMs + MIN);
  });

  it("property: across random seat add/remove + resets each seat starts at base + its extra", () => {
    const rng = seededRng(9);
    const op = fc.oneof(
      fc.constant({ type: "SEAT_ADD" as const }),
      fc.nat(7).map((i) => ({ type: "SEAT_REMOVE" as const, seatId: `s${i + 1}` })),
      fc.constant({ type: "RESET_GAME" as const }),
      fc.constant({ type: "TIMER_RESET_CLOCKS" as const }),
      fc.constant({ type: "UNDO" as const }),
    );
    fc.assert(
      fc.property(
        fc.dictionary(
          fc.constantFrom("s1", "s2", "s3", "s4", "s5"),
          fc.integer({ min: -MIN, max: 10 * MIN }),
        ),
        fc.array(op, { maxLength: 20 }),
        (extra, ops) => {
          let s = createSession(
            newGame({ timer: { mode: "bank", bankMs: 5 * MIN, seatExtraMs: extra } }, rng),
          );
          let now = T0;
          for (const a of ops) {
            now += SEC;
            s = reduceSession(s, { ...a, now } as GameAction, { rng });
            const cfg = s.game.timer.config;
            const ids = s.game.seats.map((x) => x.id);
            for (const k of Object.keys(cfg.seatExtraMs ?? {})) expect(ids).toContain(k);
            for (const id of ids)
              expect(s.game.timer.clocks[id]!.bankMs).toBe(seatAllotmentMs(cfg, id));
          }
        },
      ),
      { numRuns: 200, seed: 6060 },
    );
  });
});

describe("bankDelay turn-start buffer (audit)", () => {
  it("every turn starts with delayMs free; responses and the return to the active seat get one too", () => {
    const x = new Table({ mode: "bankDelay", bankMs: 10 * MIN, delayMs: 5 * SEC });
    x.doAt(0, { type: "START_GAME" });
    x.doAt(4 * SEC, { type: "PASS_TURN" });
    expect(x.rem("s1")).toBe(10 * MIN);
    x.doAt(10 * SEC, { type: "PASS_TURN" });
    // s2 held 6 s: 5 s free, 1 s charged.
    expect(x.rem("s2")).toBe(10 * MIN - SEC);
    x.at(17 * SEC);
    expect(x.rem("s3")).toBe(10 * MIN - 2 * SEC);
    // s3's response holds start fresh delays: s1 responds 3 s (free), then s3 again 3 s (free).
    x.do({ type: "TIMER_RESPOND", seatId: "s1" });
    x.doAt(20 * SEC, { type: "TIMER_PASS_BACK", seatId: "s1" });
    x.at(23 * SEC);
    expect(x.rem("s1")).toBe(10 * MIN);
    expect(x.rem("s3")).toBe(10 * MIN - 2 * SEC);
  });
});
