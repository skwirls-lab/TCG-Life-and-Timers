// @vitest-environment node
/** PRD Appendix B scenarios 1 and 2 at engine level, on the real MTG Commander preset. */
import { describe, expect, it } from "vitest";
import { commander } from "@/presets/mtg/presets";
import {
  commanderDamageFrom,
  commanderDamageGrid,
  counterValue,
  createGame,
  createSession,
  describeCause,
  nextSeat,
  reduceSession,
  seededRng,
  type GameAction,
  type GameSession,
} from "./index";

const T0 = 1_750_000_000_000;
const rng = seededRng(42);
const LIFE = "mtg.life";
const CMD = "mtg.cmdDamage";

function play(s: GameSession, ...actions: GameAction[]) {
  return actions.reduce((acc, a) => reduceSession(acc, a, { rng }), s);
}

function pod(seed: number) {
  const seats = ["Bethany", "JP", "Conner", "Josh"].map((name, i) => ({
    id: name.toLowerCase(),
    name,
    art: { kind: "gradient" as const, value: `g${i}` },
  }));
  return createGame(
    { preset: commander, seats, options: { turnTracking: true } },
    seededRng(seed),
    T0,
  );
}

describe("Appendix B scenario 1: commander pod, full game", () => {
  // @req GAME-011 @req CMD-001 @req CMD-002 @req CMD-004 @req CTR-005 @req GAME-014 @req GAME-010 @req LIFE-006
  it("plays a commander game from first player to rematch", () => {
    // Find a seed whose random first player is Bethany (the scenario's starter).
    let seed = 1;
    while (pod(seed).turn.firstSeat !== "bethany") seed++;
    let s = createSession(pod(seed));
    expect(s.game.turn.activeSeat).toBe("bethany");
    expect(s.game.status).toBe("ready");

    s = play(s, { type: "START_GAME", now: T0 + 1000 });
    // JP takes 5 commander damage from Conner: grid shows 5 under Conner, life 40 → 35.
    s = play(s, {
      type: "CMD_DAMAGE_ADD",
      targetSeatId: "jp",
      sourceSeatId: "conner",
      sourceIndex: 0,
      delta: 5,
      now: T0 + 2000,
    });
    expect(commanderDamageFrom(s.game, "jp", "conner")).toBe(5);
    const cell = commanderDamageGrid(s.game, "jp").find((c) => c.sourceSeatId === "conner");
    expect(cell?.value).toBe(5);
    expect(commanderDamageGrid(s.game, "jp").find((c) => c.sourceSeatId === "jp")?.self).toBe(true);
    expect(counterValue(s.game, LIFE, "jp")).toBe(35);
    // Undo reverts both.
    s = play(s, { type: "UNDO" });
    expect(commanderDamageFrom(s.game, "jp", "conner")).toBe(0);
    expect(counterValue(s.game, LIFE, "jp")).toBe(40);

    // Josh reaches 0 → skull, skipped in turn order.
    s = play(s, {
      type: "COUNTER_ADD",
      counterId: LIFE,
      seatId: "josh",
      delta: -40,
      now: T0 + 10_000,
    });
    expect(s.game.seats.find((x) => x.id === "josh")!.eliminated).toBe(true);
    s = play(s, { type: "PASS_TURN", now: T0 + 20_000 }, { type: "PASS_TURN", now: T0 + 30_000 });
    expect(s.game.turn.activeSeat).toBe("conner");
    expect(nextSeat(s.game, "conner")).toBe("bethany");
    s = play(s, { type: "PASS_TURN", now: T0 + 40_000 });
    expect(s.game.turn.activeSeat).toBe("bethany");
    expect(s.game.turn.round).toBe(2);

    // One survivor → game over.
    s = play(
      s,
      { type: "COUNTER_ADD", counterId: "mtg.poison", seatId: "jp", delta: 10, now: T0 + 50_000 },
      { type: "CONCEDE", seatId: "conner", now: T0 + 60_000 },
    );
    expect(s.game.status).toBe("ended");
    expect(s.game.result?.winners).toEqual(["bethany"]);
    expect(s.game.result?.eliminated.map((e) => e.seatId)).toEqual(["josh", "jp", "conner"]);

    // Rematch: new random starter, values reset, names and art kept.
    const ended = s.game;
    s = play(s, { type: "RESET_GAME", now: T0 + 70_000 });
    expect(s.game.status).toBe("ready");
    expect(s.game.log[1]).toMatchObject({ kind: "firstPlayer", seatId: s.game.turn.firstSeat });
    expect(s.game.seats.map((x) => [x.name, x.art?.value])).toEqual(
      ended.seats.map((x) => [x.name, x.art?.value]),
    );
    expect(s.game.seats.every((x) => !x.eliminated)).toBe(true);
    for (const seat of s.game.seats) {
      expect(counterValue(s.game, LIFE, seat.id)).toBe(40);
      expect(counterValue(s.game, "mtg.poison", seat.id)).toBe(0);
    }
    expect(s.game.previous).toEqual({ winners: ["bethany"], firstEliminated: "josh" });
  });
});

describe("Appendix B scenario 2: partners", () => {
  // @req CMD-003 @req CMD-005 @req CTR-003
  it("21 from a single partner eliminates; 24 split across two does not", () => {
    let s = createSession(pod(3));
    s = play(s, { type: "SEAT_SET_COMMANDERS", seatId: "conner", commanders: ["A", "B"] });
    const hit = (idx: number, delta: number, now: number): GameAction => ({
      type: "CMD_DAMAGE_ADD",
      targetSeatId: "jp",
      sourceSeatId: "conner",
      sourceIndex: idx,
      delta,
      now,
    });
    s = play(s, hit(0, 12, T0 + 1000), hit(1, 12, T0 + 5000));
    const jp = () => s.game.seats.find((x) => x.id === "jp")!;
    expect(jp().eliminated).toBe(false);
    expect(
      counterValue(s.game, CMD, "jp", "conner", 0) + counterValue(s.game, CMD, "jp", "conner", 1),
    ).toBe(24);
    s = play(s, hit(0, 9, T0 + 10_000));
    expect(jp().eliminated).toBe(true);
    expect(jp().eliminatedCause).toEqual({
      kind: "threshold",
      counterId: CMD,
      sourceSeatId: "conner",
      sourceIndex: 0,
    });
    expect(describeCause(s.game, "jp", jp().eliminatedCause!)).toEqual({
      kind: "threshold",
      counterId: CMD,
      counterName: "Commander damage",
      value: 21,
      sourceSeatId: "conner",
      sourceName: "Conner",
      commanderName: "A",
    });
    expect(counterValue(s.game, LIFE, "jp")).toBe(40 - 33);
  });
});
