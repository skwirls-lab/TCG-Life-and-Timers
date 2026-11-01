// @req HIST-031 @req HIST-008 @req HIST-032
import { describe, expect, it } from "vitest";
import { MIN, Play, names } from "../../../tests/unit/helpers/records";
import { hasWinner, historyEnabled, historyVisible, resetPlan } from "./policy";

const SEC = 1000;

function meaningful() {
  const p = new Play(names("A", "B", "C"));
  p.wait(SEC * 5).life("s1", -1);
  p.wait(SEC * 5).life("s2", -1);
  p.wait(SEC * 5).life("s3", -1);
  return p;
}

describe("resetPlan (HIST-031)", () => {
  // @req HIST-031
  it("asks when the game is meaningful and unresolved (default 'unclear')", () => {
    const p = meaningful();
    expect(p.g.activity.changes).toBe(3);
    expect(resetPlan(p.g, p.now, "unclear")).toBe("prompt");
    expect(resetPlan(p.g, p.now, "always")).toBe("prompt");
    expect(resetPlan(p.g, p.now, "never")).toBe("save");
  });

  it("asks after ≥ 5 minutes of activity even with few changes", () => {
    const p = new Play(names("A", "B"));
    p.wait(4 * MIN).life("s1", -1);
    expect(resetPlan(p.g, p.now, "unclear")).toBe("save");
    p.wait(2 * MIN).life("s1", -1);
    expect(resetPlan(p.g, p.now, "unclear")).toBe("prompt");
  });

  it("saves light games without asking unless 'always'", () => {
    const p = new Play(names("A", "B"));
    p.wait(SEC * 5).life("s1", -1);
    expect(resetPlan(p.g, p.now, "unclear")).toBe("save");
    expect(resetPlan(p.g, p.now, "always")).toBe("prompt");
  });

  // @req HIST-032
  it("skips trivial games, games already recorded and games with history off", () => {
    const trivial = new Play(names("A", "B"));
    expect(resetPlan(trivial.g, trivial.now, "always")).toBe("skip");
    const ended = meaningful();
    ended.wait(SEC).life("s2", -40).wait(SEC).life("s3", -40);
    expect(ended.g.status).toBe("ended");
    expect(hasWinner(ended.g)).toBe(true);
    expect(resetPlan(ended.g, ended.now, "always")).toBe("skip");
    const draw = meaningful();
    draw.do({ type: "END_GAME", winners: [] });
    expect(resetPlan(draw.g, draw.now, "unclear")).toBe("skip");
    expect(resetPlan(draw.g, draw.now, "always")).toBe("prompt");
    const off = meaningful();
    off.do({ type: "SET_OPTION", key: "historyEnabled", value: false });
    expect(resetPlan(off.g, off.now, "always")).toBe("skip");
  });

  it("saves (no prompt) a running game that already has a winner under 'always'", () => {
    const p = meaningful();
    const withWinner = {
      ...p.g,
      result: { winners: ["s1"], eliminated: [], endedAt: p.now, reason: "manual" as const },
    };
    expect(resetPlan(withWinner, p.now, "always")).toBe("save");
    expect(resetPlan(withWinner, p.now, "unclear")).toBe("save");
  });
});

describe("history visibility (HIST-008)", () => {
  // @req HIST-008
  it("hides history when the game's history option is off", () => {
    const p = new Play(names("A", "B"));
    expect(historyEnabled(p.g)).toBe(true);
    expect(historyVisible({}, p.g)).toBe(true);
    expect(historyVisible({}, null)).toBe(true);
    p.do({ type: "SET_OPTION", key: "historyEnabled", value: false });
    expect(historyEnabled(p.g)).toBe(false);
    expect(historyVisible(undefined, p.g)).toBe(false);
  });
});
