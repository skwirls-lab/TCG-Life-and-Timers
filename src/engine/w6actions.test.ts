// @vitest-environment node
/** W6 additive engine actions: SET_LAYOUT (sticky view preference) and TIMER_RESET_CLOCKS. */
import { describe, expect, it } from "vitest";
import { MIN, SEC, Table } from "../../tests/unit/helpers/timer";
import { newGame, run, sessionOf, T0 } from "../../tests/unit/helpers/engine";
import {
  counterValue,
  GameActionSchema,
  holder,
  reduce,
  seededRng,
  STICKY_ACTIONS,
  TIMER_ACTION_TYPES,
} from "./index";

const rng = seededRng(5);

describe("SET_LAYOUT", () => {
  // @req LAY-003
  it("switches the layout variant without a log event or an undo step", () => {
    const s0 = sessionOf(newGame({ players: 4, layoutId: "sides" }));
    const s1 = run(s0, [
      { type: "COUNTER_ADD", counterId: "life", seatId: "s1", delta: -2, now: T0 + 1 },
      { type: "SET_LAYOUT", layoutId: "topBottom" },
    ]);
    expect(s1.game.layoutId).toBe("topBottom");
    expect(s1.game.log).toHaveLength(s0.game.log.length + 1);
    expect(s1.past).toHaveLength(1);
    // Undo reverts the life change but keeps the layout (sticky).
    const u = run(s1, [{ type: "UNDO" }]);
    expect(counterValue(u.game, "life", "s1")).toBe(20);
    expect(u.game.layoutId).toBe("topBottom");
    expect(run(u, [{ type: "REDO" }]).game.layoutId).toBe("topBottom");
    expect(STICKY_ACTIONS).toContain("SET_LAYOUT");
  });

  // @req LAY-003
  it("same or blank id is a no-op", () => {
    const g = newGame({ players: 4, layoutId: "sides" });
    expect(reduce(g, { type: "SET_LAYOUT", layoutId: "sides" }, { rng })).toBe(g);
    expect(reduce(g, { type: "SET_LAYOUT", layoutId: "  " }, { rng })).toBe(g);
  });

  it("is a valid action per the schema", () => {
    expect(GameActionSchema.safeParse({ type: "SET_LAYOUT", layoutId: "sides" }).success).toBe(
      true,
    );
    expect(GameActionSchema.safeParse({ type: "SET_LAYOUT", layoutId: "" }).success).toBe(false);
  });
});

describe("TIMER_RESET_CLOCKS", () => {
  // @req TMR-001 @req SET-011
  it("returns running clocks to idle at the configured bank, logs a restart, and is undoable", () => {
    const x = new Table({ mode: "bank", bankMs: 10 * MIN });
    x.doAt(0, { type: "START_GAME" });
    x.doAt(30 * SEC, { type: "PASS_TURN" });
    x.doAt(40 * SEC, { type: "TIMER_RESET_CLOCKS" });
    expect(x.g.timer.status).toBe("idle");
    expect(holder(x.g)).toBeNull();
    expect(x.g.timer.clocks.s1!.bankMs).toBe(10 * MIN);
    expect(x.g.timer.clocks.s2!.bankMs).toBe(10 * MIN);
    expect(x.g.log.at(-1)).toMatchObject({ kind: "timer", meta: { action: "restart" } });
    expect(x.g.status).toBe("running"); // the game itself keeps going
    // START begins again from the turn holder.
    x.doAt(50 * SEC, { type: "START_GAME" });
    expect(holder(x.g)).toBe("s2");
    // Undo the START and the restart: the old clocks come back.
    x.do({ type: "UNDO" }, { type: "UNDO" });
    expect(x.g.timer.status).toBe("running");
    expect(x.g.timer.clocks.s1!.bankMs).toBe(10 * MIN - 30 * SEC);
  });

  // @req TMR-001
  it("applies a structure patch (mode/bank) and turns on turn tracking", () => {
    const x = new Table({ mode: "off" }, { options: { turnTracking: false } });
    x.doAt(0, { type: "START_GAME" });
    expect(x.g.options.turnTracking).toBe(false);
    x.doAt(SEC, { type: "TIMER_RESET_CLOCKS", config: { mode: "bank", bankMs: 20 * MIN } });
    expect(x.g.timer.mode).toBe("bank");
    expect(x.g.timer.config.bankMs).toBe(20 * MIN);
    expect(x.g.timer.clocks.s1!.bankMs).toBe(20 * MIN);
    expect(x.g.options.turnTracking).toBe(true);
    // Back to off keeps turn tracking as is.
    x.doAt(2 * SEC, { type: "TIMER_RESET_CLOCKS", config: { mode: "off" } });
    expect(x.g.timer.mode).toBe("off");
    expect(x.g.options.turnTracking).toBe(true);
  });

  it("is a no-op when the clocks are already idle with the same config", () => {
    const x = new Table({ mode: "bank" });
    const before = x.g;
    x.doAt(0, { type: "TIMER_RESET_CLOCKS" });
    expect(x.g).toBe(before);
    x.doAt(0, { type: "TIMER_RESET_CLOCKS", config: { bankMs: 10 * MIN } });
    expect(x.g).toBe(before);
    expect(TIMER_ACTION_TYPES).toContain("TIMER_RESET_CLOCKS");
    expect(
      GameActionSchema.safeParse({ type: "TIMER_RESET_CLOCKS", config: { bankMs: 1 }, now: 1 })
        .success,
    ).toBe(true);
  });

  it("resets per-turn modes and the match timer too", () => {
    const x = new Table({
      mode: "perTurn",
      perTurnMs: MIN,
      match: { totalMs: 50 * MIN, extraTurns: 3 },
    });
    x.doAt(0, { type: "START_GAME" });
    x.doAt(20 * SEC, { type: "TIMER_RESET_CLOCKS" });
    expect(x.g.timer.match).toEqual({
      totalMs: 50 * MIN,
      remainingMs: 50 * MIN,
      extraTurnsRemaining: 3,
    });
    expect(x.g.timer.clocks.s1!.bankMs).toBe(MIN);
  });
});
