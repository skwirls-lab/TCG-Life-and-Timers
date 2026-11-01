// @vitest-environment node
import { describe, expect, it } from "vitest";
import { newGame, run, sessionOf, T0 } from "../../tests/unit/helpers/engine";
import {
  canRedo,
  canUndo,
  counterValue,
  createSession,
  reduceSession,
  seededRng,
  UNDO_LIMIT,
  type GameAction,
} from "./index";

const add = (seatId: string, delta: number, now: number): GameAction => ({
  type: "COUNTER_ADD",
  counterId: "life",
  seatId,
  delta,
  now,
});

describe("undo / redo", () => {
  // @req GAME-015
  it("undo restores the exact previous state and redo re-applies it", () => {
    const s0 = sessionOf(newGame());
    const s1 = run(s0, [add("s1", -3, T0 + 1), add("s2", -2, T0 + 2)]);
    expect(canUndo(s1)).toBe(true);
    expect(canRedo(s1)).toBe(false);
    const u = run(s1, [{ type: "UNDO" }]);
    expect(u.game).toBe(s1.past.at(-1));
    expect(counterValue(u.game, "life", "s2")).toBe(20);
    expect(canRedo(u)).toBe(true);
    const r = run(u, [{ type: "REDO" }]);
    expect(r.game).toBe(s1.game);
    expect(run(s0, [{ type: "UNDO" }])).toBe(s0);
    expect(run(r, [{ type: "REDO" }])).toBe(r);
  });

  it("a new action clears the redo stack; no-ops do not create steps", () => {
    let s = run(sessionOf(newGame()), [add("s1", -1, T0 + 1), { type: "UNDO" }]);
    expect(s.future).toHaveLength(1);
    const same = run(s, [add("s1", 0, T0 + 2)]);
    expect(same).toBe(s);
    s = run(s, [add("s2", -1, T0 + 3)]);
    expect(s.future).toHaveLength(0);
  });

  // @req CTR-005 @req CMD-004
  it("one undo reverts commander damage and its linked life loss", () => {
    const s = run(sessionOf(newGame()), [
      {
        type: "CMD_DAMAGE_ADD",
        targetSeatId: "s2",
        sourceSeatId: "s3",
        sourceIndex: 0,
        delta: 5,
        now: T0 + 1,
      },
    ]);
    expect(counterValue(s.game, "life", "s2")).toBe(15);
    const u = run(s, [{ type: "UNDO" }]);
    expect(counterValue(u.game, "life", "s2")).toBe(20);
    expect(counterValue(u.game, "cmd", "s2", "s3", 0)).toBe(0);
  });

  it("caps the undo stack at UNDO_LIMIT (≥ 50)", () => {
    const actions = Array.from({ length: UNDO_LIMIT + 20 }, (_, i) =>
      add(`s${(i % 4) + 1}`, -1, T0 + i * 10_000),
    );
    const s = run(sessionOf(newGame()), actions);
    expect(UNDO_LIMIT).toBeGreaterThanOrEqual(50);
    expect(s.past).toHaveLength(UNDO_LIMIT);
    const redo = run(
      run(
        s,
        Array.from({ length: 5 }, () => ({ type: "UNDO" as const })),
      ),
      [{ type: "REDO" }],
    );
    expect(redo.past).toHaveLength(UNDO_LIMIT - 4);
  });

  // @req HIST-013
  it("UNDO_TO reverts an event and everything after it; redo walks forward again", () => {
    const s = run(sessionOf(newGame()), [
      add("s1", -1, T0 + 1),
      add("s2", -2, T0 + 2),
      add("s3", -3, T0 + 3),
    ]);
    const target = s.game.log.find((e) => e.seatId === "s2" && e.kind === "counter")!;
    const u = run(s, [{ type: "UNDO_TO", eventId: target.id }]);
    expect(counterValue(u.game, "life", "s1")).toBe(19);
    expect(counterValue(u.game, "life", "s2")).toBe(20);
    expect(counterValue(u.game, "life", "s3")).toBe(20);
    expect(u.future).toHaveLength(2);
    const r1 = run(u, [{ type: "REDO" }]);
    expect(counterValue(r1.game, "life", "s2")).toBe(18);
    expect(counterValue(r1.game, "life", "s3")).toBe(20);
    expect(run(s, [{ type: "UNDO_TO", eventId: "missing" }])).toBe(s);
    // events older than the undo buffer cannot be targeted
    const first = s.game.log[0]!;
    expect(run(s, [{ type: "UNDO_TO", eventId: first.id }])).toBe(s);
  });

  it("sticky seat cosmetics apply to every snapshot and are not undo steps", () => {
    let s = run(sessionOf(newGame()), [add("s1", -1, T0 + 1), add("s1", -1, T0 + 5000)]);
    s = run(s, [{ type: "SEAT_RENAME", seatId: "s1", name: "Beth" }]);
    expect(s.past).toHaveLength(2);
    const u = run(s, [{ type: "UNDO" }, { type: "UNDO" }]);
    expect(u.game.seats[0]!.name).toBe("Beth");
    expect(run(u, [{ type: "REDO" }]).game.seats[0]!.name).toBe("Beth");
    expect(run(s, [{ type: "SEAT_RENAME", seatId: "zz", name: "x" }])).toBe(s);
  });
});

describe("INP-006 batching", () => {
  // @req INP-006
  it("consecutive taps on the same counter within the window merge into one event and one undo step", () => {
    const s = run(sessionOf(newGame()), [
      add("s1", -1, T0 + 100),
      add("s1", -1, T0 + 1500),
      add("s1", -1, T0 + 3000),
    ]);
    const counterEvents = s.game.log.filter((e) => e.kind === "counter");
    expect(counterEvents).toHaveLength(1);
    expect(counterEvents[0]).toMatchObject({
      from: 20,
      to: 17,
      delta: -3,
      at: T0 + 100,
      updatedAt: T0 + 3000,
    });
    expect(s.past).toHaveLength(1);
    expect(s.game.activity.changes).toBe(1);
    expect(counterValue(run(s, [{ type: "UNDO" }]).game, "life", "s1")).toBe(20);
  });

  // @req INP-006
  it("starts a new batch after the window, for another counter, or right after undo", () => {
    const late = run(sessionOf(newGame()), [add("s1", -1, T0), add("s1", -1, T0 + 2001)]);
    expect(late.game.log.filter((e) => e.kind === "counter")).toHaveLength(2);
    const other = run(sessionOf(newGame()), [
      add("s1", -1, T0),
      add("s2", -1, T0 + 10),
      add("s1", -1, T0 + 20),
    ]);
    expect(other.game.log.filter((e) => e.kind === "counter")).toHaveLength(3);
    const afterUndo = run(sessionOf(newGame()), [
      add("s1", -1, T0),
      add("s2", -1, T0 + 10),
      { type: "UNDO" },
      add("s1", -1, T0 + 20),
    ]);
    expect(afterUndo.past).toHaveLength(2);
    // backwards clock never merges
    const back = run(sessionOf(newGame()), [add("s1", -1, T0 + 50), add("s1", -1, T0)]);
    expect(back.game.log.filter((e) => e.kind === "counter")).toHaveLength(2);
  });

  // @req INP-006 @req CMD-004
  it("commander damage batches both linked events", () => {
    const cmd = (now: number): GameAction => ({
      type: "CMD_DAMAGE_ADD",
      targetSeatId: "s2",
      sourceSeatId: "s3",
      sourceIndex: 0,
      delta: 1,
      now,
    });
    const s = run(sessionOf(newGame()), [cmd(T0), cmd(T0 + 500), cmd(T0 + 900)]);
    const evs = s.game.log.filter((e) => e.kind === "counter");
    expect(evs).toHaveLength(2);
    expect(evs[0]).toMatchObject({ counterId: "cmd", delta: 3, to: 3 });
    expect(evs[1]).toMatchObject({ counterId: "life", delta: -3, to: 17, linkedTo: evs[0]!.id });
    expect(s.past).toHaveLength(1);
  });

  it("a linked change does not merge into an unlinked batch, but an unlinked one extends a linked batch", () => {
    const cmd = (now: number): GameAction => ({
      type: "CMD_DAMAGE_ADD",
      targetSeatId: "s2",
      sourceSeatId: "s3",
      sourceIndex: 0,
      delta: 1,
      now,
    });
    const s1 = run(sessionOf(newGame()), [
      { type: "SET_OPTION", key: "commanderDamageLifeLoss", value: false },
      cmd(T0),
      { type: "SET_OPTION", key: "commanderDamageLifeLoss", value: true },
      cmd(T0 + 10),
    ]);
    expect(s1.game.log.filter((e) => e.kind === "counter")).toHaveLength(3);
    const s2 = run(sessionOf(newGame()), [
      cmd(T0),
      { type: "SET_OPTION", key: "commanderDamageLifeLoss", value: false },
      cmd(T0 + 10),
    ]);
    const evs = s2.game.log.filter((e) => e.kind === "counter");
    expect(evs).toHaveLength(2);
    expect(evs[0]).toMatchObject({ delta: 2 });
    expect(evs[1]).toMatchObject({ delta: -1 });
  });

  it("an elimination closes the batch", () => {
    const s = run(sessionOf(newGame()), [
      add("s1", -19, T0),
      add("s1", -1, T0 + 10),
      add("s1", 1, T0 + 20),
    ]);
    expect(s.game.log.filter((e) => e.kind === "counter")).toHaveLength(2);
    expect(s.game.seats[0]!.eliminated).toBe(false);
  });

  it("reduceSession respects ctx.allowMerge = false", () => {
    const rng = seededRng(1);
    let s = createSession(newGame());
    s = reduceSession(s, add("s1", -1, T0), { rng, allowMerge: false });
    s = reduceSession(s, add("s1", -1, T0 + 1), { rng, allowMerge: false });
    expect(s.past).toHaveLength(2);
  });
});
