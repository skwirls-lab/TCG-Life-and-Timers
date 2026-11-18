// @req A11Y-001
import { describe, expect, it } from "vitest";
import { newGame, run, sessionOf, T0 } from "../../../tests/unit/helpers/engine";
import { createAnnouncer } from "./announcer";
import { diffAnnouncements } from "./announcements";

function fakeClock() {
  let now = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  let id = 0;
  return {
    now: () => now,
    setTimer: (fn: () => void, ms: number) => {
      timers.set(++id, { at: now + ms, fn });
      return id;
    },
    clearTimer: (h: unknown) => void timers.delete(h as number),
    advance(ms: number) {
      const end = now + ms;
      for (;;) {
        const next = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > end) break;
        timers.delete(next[0]);
        now = next[1].at;
        next[1].fn();
      }
      now = end;
    },
  };
}

describe("createAnnouncer (A11Y-001)", () => {
  it("batches consecutive changes on a seat into one message after the quiet period", () => {
    const c = fakeClock();
    const out: string[] = [];
    const a = createAnnouncer({ emit: (s) => out.push(s), ...c });
    a.update("s1", "Conner Life 41");
    c.advance(300);
    a.update("s1", "Conner Life 42");
    c.advance(300);
    a.update("s1", "Conner Life 43");
    c.advance(999);
    expect(out).toEqual([]);
    c.advance(1);
    expect(out).toEqual(["Conner Life 43"]);
  });

  it("throttles a seat to one message per interval, independently per seat", () => {
    const c = fakeClock();
    const out: string[] = [];
    const a = createAnnouncer({
      emit: (s) => out.push(s),
      quietMs: 100,
      minIntervalMs: 1000,
      ...c,
    });
    a.update("s1", "A 1");
    a.update("s2", "B 1");
    c.advance(100);
    expect(out).toEqual(["A 1", "B 1"]);
    a.update("s1", "A 2");
    c.advance(500);
    expect(out).toHaveLength(2); // still within 1 s of the last A message
    c.advance(499);
    expect(out).toHaveLength(2);
    c.advance(1); // 1 s after the first A message
    expect(out).toEqual(["A 1", "B 1", "A 2"]);
  });

  it("says immediate messages at once and reset drops pending ones", () => {
    const c = fakeClock();
    const out: string[] = [];
    const a = createAnnouncer({ emit: (s) => out.push(s), ...c });
    a.update("s1", "pending");
    a.say("Josh's turn");
    expect(out).toEqual(["Josh's turn"]);
    a.reset();
    c.advance(5000);
    expect(out).toEqual(["Josh's turn"]);
  });

  it("works with the default timers", async () => {
    const out: string[] = [];
    const a = createAnnouncer({ emit: (s) => out.push(s), quietMs: 1, minIntervalMs: 1 });
    a.update("k", "x");
    await new Promise((r) => setTimeout(r, 20));
    expect(out).toEqual(["x"]);
    a.update("k", "y");
    a.reset();
  });
});

describe("diffAnnouncements (A11Y-001)", () => {
  it("announces the primary counter of each changed seat", () => {
    const s0 = sessionOf(newGame());
    const s1 = run(s0, [
      { type: "COUNTER_ADD", counterId: "life", seatId: "s3", delta: 1, now: T0 + 1 },
    ]);
    const d = diffAnnouncements(s0.game, s1.game);
    expect(d.counters).toEqual([{ key: "s3", text: "Conner Life 21" }]);
    expect(d.immediate).toEqual([]);
  });

  it("is silent for the first state, the same state and a new game", () => {
    const g = newGame();
    expect(diffAnnouncements(null, g)).toEqual({ counters: [], immediate: [] });
    expect(diffAnnouncements(g, g).counters).toEqual([]);
    const other = { ...newGame(), id: "other", values: {} };
    expect(diffAnnouncements(g, other).counters).toEqual([]);
  });

  it("announces turn passes when turns are tracked, eliminations and clock timeouts", () => {
    const s0 = sessionOf(newGame({ options: { turnTracking: true } }));
    const s1 = run(s0, [
      { type: "PASS_TURN", now: T0 + 1 },
      { type: "PASS_TURN", now: T0 + 2 },
    ]);
    const turn = diffAnnouncements(s1.game, run(s1, [{ type: "PASS_TURN", now: T0 + 3 }]).game);
    expect(turn.immediate.join(" ")).toMatch(/turn/);

    const dead = run(s0, [
      { type: "COUNTER_ADD", counterId: "life", seatId: "s2", delta: -20, now: T0 + 1 },
    ]);
    expect(diffAnnouncements(s0.game, dead.game).immediate).toContain("JP eliminated");

    const g = s0.game;
    const clock = g.timer.clocks.s1!;
    const timedOut = {
      ...g,
      timer: {
        ...g.timer,
        clocks: { ...g.timer.clocks, s1: { ...clock, state: "timedOut" as const } },
      },
    };
    expect(diffAnnouncements(g, timedOut).immediate).toEqual(["Bethany is out of time"]);
  });

  it("does not announce turns when nothing tracks them", () => {
    const s0 = sessionOf(newGame({ options: { turnTracking: false } }));
    const s1 = run(s0, [{ type: "PASS_TURN", now: T0 + 1 }]);
    expect(diffAnnouncements(s0.game, s1.game).immediate).toEqual([]);
  });

  it("announces clocks paused / resumed, not after the game ended", () => {
    const g = newGame();
    const at = (status: "running" | "paused") => ({ ...g, timer: { ...g.timer, status } });
    expect(diffAnnouncements(at("running"), at("paused")).immediate).toEqual(["Clocks paused"]);
    expect(diffAnnouncements(at("paused"), at("running")).immediate).toEqual(["Clocks resumed"]);
    const ended = { ...at("paused"), status: "ended" as const };
    expect(diffAnnouncements(at("running"), ended).immediate).toEqual([]);
  });
});
