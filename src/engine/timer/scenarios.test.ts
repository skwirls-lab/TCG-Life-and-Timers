// @vitest-environment node
/** PRD Appendix B Scenarios 3 (clock with response) and 4 (timeout with grace), exact ms. */
import { describe, expect, it } from "vitest";
import { MIN, SEC, Table } from "../../../tests/unit/helpers/timer";
import { T0 } from "../../../tests/unit/helpers/engine";
import { describeCause, holder, nextSignificantEvent } from "../index";

describe("Scenario 3: clock with response", () => {
  // @req TMR-002 @req TMR-003 @req TMR-005 @req TMR-006 @req TMR-007 @req TMR-050
  it("charges every second to the right seat through a nested response", () => {
    const x = new Table({ mode: "bank", bankMs: 10 * MIN, incrementMs: 0 });
    x.doAt(0, { type: "START_GAME" });
    expect(holder(x.g)).toBe("s1");

    x.doAt(30 * SEC, { type: "TIMER_RESPOND", seatId: "s3" });
    expect(x.rem("s1")).toBe(9 * MIN + 30 * SEC);
    expect(holder(x.g)).toBe("s3");
    expect(x.timer.responseStack).toEqual(["s3"]);

    x.doAt(50 * SEC, { type: "TIMER_RESPOND", seatId: "s1" });
    expect(x.timer.responseStack).toEqual(["s3", "s1"]);
    expect(holder(x.g)).toBe("s1");
    expect(x.rem("s3")).toBe(10 * MIN - 20 * SEC);

    x.doAt(60 * SEC, { type: "TIMER_PASS_BACK", seatId: "s1" });
    expect(holder(x.g)).toBe("s3");
    expect(x.rem("s1")).toBe(10 * MIN - 40 * SEC);
    expect(x.lastTimerEvent()?.meta).toMatchObject({ action: "passBack", durationMs: 10 * SEC });

    x.doAt(75 * SEC, { type: "TIMER_PASS_BACK", seatId: "s3" });
    expect(holder(x.g)).toBe("s1");
    expect(x.lastTimerEvent()?.meta).toMatchObject({ action: "passBack", durationMs: 45 * SEC });

    x.doAt(100 * SEC, { type: "PASS_TURN" });
    expect(holder(x.g)).toBe("s2");
    x.at(107 * SEC);
    // P1 = 10:00 − 30 s − 10 s − 25 s (after returning); P3 = 10:00 − 20 s − 15 s.
    expect(x.rem("s1")).toBe(10 * MIN - 65 * SEC);
    expect(x.rem("s3")).toBe(10 * MIN - 35 * SEC);
    expect(x.rem("s2")).toBe(10 * MIN - 7 * SEC);
    expect(x.rem("s4")).toBe(10 * MIN);
    const turn = x.g.log.filter((e) => e.kind === "turn").at(-1)!;
    expect(turn.meta).toMatchObject({ from: "s1", timeUsedMs: 65 * SEC });
    // Total held time == wall time since START.
    const total = ["s1", "s2", "s3", "s4"].reduce((n, s) => n + x.used(s), 0);
    expect(total).toBe(107 * SEC);
  });
});

describe("Scenario 4: timeout with grace", () => {
  // @req TMR-030 @req TMR-023 @req TMR-051
  it("enters overtime at 0:00, eliminates (cause Time) when grace ends, turn → P3", () => {
    const x = new Table({
      mode: "bank",
      bankMs: 10 * MIN,
      timeoutAction: "grace",
      graceMs: 10 * SEC,
    });
    x.doAt(0, { type: "START_GAME" }, { type: "PASS_TURN" });
    x.do({ type: "TIMER_SET", seatId: "s2", bankMs: 5 * SEC });
    expect(holder(x.g)).toBe("s2");

    const ev1 = nextSignificantEvent(x.g, x.now)!;
    expect(ev1).toEqual({ at: T0 + 5 * SEC, kind: "timeout", seatId: "s2" });
    x.doAt(5 * SEC, { type: "TIMER_TIMEOUT", seatId: "s2" });
    expect(x.timer.clocks.s2!.state).toBe("overtime");
    expect(x.rem("s2")).toBe(10 * SEC);
    expect(x.shown("s2")).toBe(10 * SEC);
    expect(holder(x.g)).toBe("s2");

    x.at(9 * SEC);
    expect(x.rem("s2")).toBe(6 * SEC);
    const ev2 = nextSignificantEvent(x.g, x.now)!;
    expect(ev2).toEqual({ at: T0 + 15 * SEC, kind: "graceEnd", seatId: "s2" });

    x.doAt(15 * SEC, { type: "TIMER_TIMEOUT", seatId: "s2" });
    const s2 = x.g.seats.find((s) => s.id === "s2")!;
    expect(s2.eliminated).toBe(true);
    expect(s2.eliminatedCause).toEqual({ kind: "time" });
    expect(describeCause(x.g, "s2", s2.eliminatedCause!)).toEqual({ kind: "time" });
    expect(x.timer.clocks.s2!.state).toBe("timedOut");
    expect(x.g.turn.activeSeat).toBe("s3");
    expect(holder(x.g)).toBe("s3");
    x.at(20 * SEC);
    expect(x.rem("s3")).toBe(10 * MIN - 5 * SEC);
    expect(x.used("s2")).toBe(15 * SEC);
  });
});
