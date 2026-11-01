// @vitest-environment node
/** Pure clock helpers: display format (TMR-040), projections, holder. */
import { describe, expect, it } from "vitest";
import { MIN, SEC, Table } from "../../../tests/unit/helpers/timer";
import { T0 } from "../../../tests/unit/helpers/engine";
import {
  clockAt,
  clockState,
  displayMs,
  formatClock,
  holder,
  isCharging,
  isLimited,
  remaining,
  timeUsed,
  turnTimeUsed,
} from "../index";

describe("formatClock (TMR-040)", () => {
  // @req TMR-040 @req TMR-031
  it.each([
    [10 * MIN, {}, "10:00"],
    [10 * MIN - 1, {}, "9:59"],
    [65 * SEC, {}, "1:05"],
    [10 * SEC, {}, "0:10"],
    [9_999, {}, "9.9"],
    [9_400, {}, "9.4"],
    [50, {}, "0.0"],
    [0, {}, "0.0"],
    [9_400, { showTenths: false }, "0:09"],
    [60 * MIN, {}, "1:00:00"],
    [61 * MIN + 5 * SEC, {}, "1:01:05"],
    [-45 * SEC, {}, "−0:45"],
    [-3_250, {}, "−3.2"],
    [-61 * MIN, {}, "−1:01:00"],
    [Number.POSITIVE_INFINITY, {}, "∞"],
  ] as const)("%d ms %o → %s", (ms, opts, out) => {
    expect(formatClock(ms, opts)).toBe(out);
  });
});

describe("projection helpers", () => {
  it("unknown seats read as empty", () => {
    const x = new Table({ mode: "bank" });
    expect(remaining(x.g, "zz", T0)).toBe(0);
    expect(timeUsed(x.g, "zz", T0)).toBe(0);
    expect(turnTimeUsed(x.g, "zz", T0)).toBe(0);
    expect(displayMs(x.g, "zz", T0)).toBe(0);
    expect(clockAt(x.g, "zz", T0)).toBeUndefined();
    expect(clockState(x.g, "zz")).toBe("normal");
    expect(clockState(x.g, "s1")).toBe("normal");
  });

  it("projects only the charging holder, and never before runningSince", () => {
    const x = new Table({ mode: "bank" });
    x.doAt(10 * SEC, { type: "START_GAME" });
    expect(isCharging(x.timer)).toBe(true);
    expect(remaining(x.g, "s1", T0)).toBe(10 * MIN);
    expect(remaining(x.g, "s1", T0 + 11 * SEC)).toBe(10 * MIN - SEC);
    expect(remaining(x.g, "s2", T0 + 11 * SEC)).toBe(10 * MIN);
    expect(holder({ ...x.g, status: "ended" })).toBeNull();
  });

  it("isLimited per mode", () => {
    expect(isLimited("off")).toBe(false);
    expect(isLimited("countup")).toBe(false);
    expect(isLimited("bank")).toBe(true);
    expect(isLimited("perTurnReserve")).toBe(true);
  });
});
