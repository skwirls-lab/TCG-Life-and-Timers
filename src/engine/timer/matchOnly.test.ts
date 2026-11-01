// @vitest-environment node
/**
 * TMR-032 / PRD §10.3–10.4 (review A-3): a match timer runs on its own when the per-seat chess
 * clock is Off (Pokémon 50 min + 3 turns, Yu-Gi-Oh! 40 min + 2 turns).
 */
import { describe, expect, it } from "vitest";
import { MIN, Table } from "../../../tests/unit/helpers/timer";
import { T0 } from "../../../tests/unit/helpers/engine";
import { matchRemaining, nextSignificantEvent } from "../index";
import { timerEngaged } from "./clock";

describe("match timer without per-seat clocks", () => {
  // @req TMR-032
  it("START runs the round clock with mode off; it pauses and calls time with extra turns", () => {
    const x = new Table({ mode: "off", match: { totalMs: 50 * MIN, extraTurns: 3 } });
    expect(timerEngaged(x.timer)).toBe(true);
    expect(x.timer.status).toBe("idle");
    x.doAt(0, { type: "START_GAME" });
    expect(x.timer.status).toBe("running");
    x.at(10 * MIN);
    expect(matchRemaining(x.g, x.now)?.remainingMs).toBe(40 * MIN);
    expect(nextSignificantEvent(x.g, x.now)).toEqual({ at: x.now + 40 * MIN, kind: "matchEnd" });
    x.do({ type: "TIMER_PAUSE" });
    x.at(20 * MIN);
    expect(matchRemaining(x.g, x.now)?.remainingMs).toBe(40 * MIN);
    x.do({ type: "TIMER_RESUME" });
    x.doAt(65 * MIN, { type: "PASS_TURN" });
    expect(x.g.log.find((e) => e.meta?.action === "matchEnd")?.at).toBe(T0 + 60 * MIN);
    expect(matchRemaining(x.g, x.now)).toMatchObject({ timeCalled: true, extraTurnsRemaining: 2 });
  });

  it("no match and mode off: nothing runs", () => {
    const x = new Table({ mode: "off" });
    expect(timerEngaged(x.timer)).toBe(false);
    x.doAt(0, { type: "START_GAME" });
    expect(x.timer.status).toBe("idle");
    expect(nextSignificantEvent(x.g, x.now)).toBeNull();
  });
});
