import { describe, expect, it } from "vitest";
import { createGame, reduce, seededRng, type Game, type GameAction, type Rng } from "@/engine";
import { getBuiltInPreset } from "@/presets";
import {
  SPIN_MS,
  coinFlipWinner,
  detectUndoable,
  firstTurnReminderDue,
  formatCause,
  gameOverStats,
  latestFirstPlayerEvent,
  offersOpeningCoin,
  rolloffView,
  seatName,
  shouldAnnounce,
  spinSequence,
} from "./flow";

const commander = getBuiltInPreset("mtg.commander")!;
const rng = seededRng(42);
let now = 1_000;

function game(): Game {
  return createGame(
    { preset: commander, players: 4, seats: ["A", "B", "C", "D"].map((name) => ({ name })) },
    seededRng(7),
    now,
  );
}

function act(g: Game, a: GameAction): Game {
  now += 1000;
  return reduce(g, a, { rng });
}

describe("first-player spin", () => {
  // @req GAME-011
  it("decelerates for ~1.8 s and lands on the starter", () => {
    for (const n of [2, 3, 4, 5, 6, 8]) {
      for (let target = 0; target < n; target++) {
        const seq = spinSequence(n, target);
        expect(seq.at(-1)!.index).toBe(target);
        const total = seq.reduce((s, x) => s + x.delayMs, 0);
        expect(Math.abs(total - SPIN_MS)).toBeLessThan(seq.length);
        // later steps are slower than earlier ones
        expect(seq.at(-1)!.delayMs).toBeGreaterThan(seq[1]!.delayMs);
        expect(seq.length).toBeGreaterThanOrEqual(2 * n);
      }
    }
    expect(spinSequence(0, 0)).toEqual([]);
    expect(spinSequence(1, 0)).toEqual([{ index: 0, delayMs: 0 }]);
  });

  // @req GAME-011
  it("announces fresh picks (new game and reset), not games in progress", () => {
    let g = game();
    expect(latestFirstPlayerEvent(g)?.seatId).toBe(g.turn.firstSeat);
    expect(shouldAnnounce(g)).toBe(true);
    g = act(g, {
      type: "COUNTER_ADD",
      counterId: "mtg.life",
      seatId: g.seats[0]!.id,
      delta: -1,
      now,
    });
    expect(shouldAnnounce(g)).toBe(false);
    const reset = act(g, { type: "RESET_GAME", now });
    expect(shouldAnnounce(reset)).toBe(true);
    expect(latestFirstPlayerEvent(reset)!.id).not.toBe(undefined);
    expect(seatName(reset, reset.turn.firstSeat)).toMatch(/^[ABCD]$/);
  });

  // @req GAME-012
  it("waits for a manual pick with the 'choose' rule", () => {
    const g = createGame(
      { preset: commander, players: 2, options: { firstPlayerRule: "choose" } },
      seededRng(1),
      now,
    );
    expect(shouldAnnounce(g)).toBe(false);
    const picked = act(g, { type: "SET_FIRST_PLAYER", seatId: g.seats[1]!.id, now });
    expect(shouldAnnounce(picked)).toBe(true);
    expect(latestFirstPlayerEvent(picked)?.meta?.rule).toBe("manual");
  });
});

describe("game over and undo snackbar", () => {
  // @req GAME-014 @req LIFE-005
  it("summarises winners, turns and elimination order with causes", () => {
    let g = game();
    const [a, b, c, d] = g.seats.map((s) => s.id) as [string, string, string, string];
    g = act(g, { type: "COUNTER_SET", counterId: "mtg.life", seatId: b, value: 0, now });
    g = act(g, { type: "COUNTER_SET", counterId: "mtg.poison", seatId: c, value: 10, now });
    g = act(g, {
      type: "CMD_DAMAGE_ADD",
      targetSeatId: d,
      sourceSeatId: a,
      sourceIndex: 0,
      delta: 21,
      now,
    });
    expect(g.status).toBe("ended");
    const stats = gameOverStats(g);
    expect(stats.winners).toEqual(["A"]);
    expect(stats.turns).toBe(1);
    expect(stats.eliminated.map((e) => e.name)).toEqual(["B", "C", "D"]);
    expect(stats.eliminated[0]!.cause).toBe("Life 0");
    expect(stats.eliminated[1]!.cause).toBe("Poison 10");
    expect(stats.eliminated[2]!.cause).toBe("21 Commander damage from A");
    expect(stats.durationMs).toBeGreaterThan(0);
  });

  it("formats non-threshold causes", () => {
    const g = game();
    expect(formatCause(g, g.seats[0]!.id, { kind: "concede" })).toBe("Conceded");
    expect(formatCause(g, g.seats[0]!.id, { kind: "time" })).toBe("Out of time");
    expect(formatCause(g, g.seats[0]!.id, { kind: "manual" })).toBe("Knocked out");
    expect(gameOverStats(g).winners).toEqual([]);
  });

  // @req GAME-015
  it("detects resets and eliminations, but not undo or new games", () => {
    const g = game();
    const reset = act(g, { type: "RESET_GAME", now });
    expect(detectUndoable(g, reset)).toEqual({ kind: "reset" });
    expect(detectUndoable(g, reset, true)).toBeNull();
    expect(detectUndoable(g, game())).toBeNull();
    const ko = act(g, { type: "ELIMINATE", seatId: g.seats[2]!.id, now });
    expect(detectUndoable(g, ko)).toEqual({ kind: "eliminate", seatIds: [g.seats[2]!.id] });
    expect(detectUndoable(ko, ko)).toBeNull();
    expect(detectUndoable(undefined, ko)).toBeNull();
    const renamed = act(g, { type: "SEAT_RENAME", seatId: g.seats[0]!.id, name: "Z" });
    expect(detectUndoable(g, renamed)).toBeNull();
  });
});

/** Rng that returns a fixed sequence of `int()` results (d20 roll = value + 1). */
function scripted(values: number[]): Rng {
  let i = 0;
  return { int: (max) => (values[i++] ?? 0) % max };
}

describe("roll-off view (T3.7)", () => {
  // @req TOOL-004 @req GAME-012
  it("shows each seat's d20, re-rolls only the tied seats and names the winner", () => {
    // round 1: A 18, B 20, C 20, D 3 → B and C re-roll: B 5, C 12 → C goes first
    const g = createGame(
      {
        id: "g-rolloff", // no randomId: the scripted ints are all d20 rolls
        preset: commander,
        players: 4,
        seats: ["A", "B", "C", "D"].map((name) => ({ name })),
        options: { firstPlayerRule: "rolloff" },
      },
      scripted([17, 19, 19, 2, 4, 11]),
      now,
    );
    const view = rolloffView(g)!;
    expect(view.rounds).toBe(2);
    expect(view.rows.map((r) => [r.name, r.rolls, r.winner])).toEqual([
      ["A", [18], false],
      ["B", [20, 5], false],
      ["C", [20, 12], true],
      ["D", [3], false],
    ]);
    expect(seatName(g, view.winnerId)).toBe("C");
    expect(g.turn.activeSeat).toBe(view.winnerId);
  });

  // @req GAME-012
  it("is null for other rules and after a manual pick; a reset rolls again", () => {
    expect(rolloffView(game())).toBeNull();
    let g = createGame(
      { preset: commander, players: 3, options: { firstPlayerRule: "rolloff" } },
      seededRng(9),
      now,
    );
    expect(rolloffView(g)!.rows).toHaveLength(3);
    for (const r of rolloffView(g)!.rows) for (const v of r.rolls) expect(v).toBeGreaterThan(0);
    const manual = act(g, { type: "SET_FIRST_PLAYER", seatId: g.seats[1]!.id, now });
    expect(rolloffView(manual)).toBeNull();
    g = act(g, { type: "RESET_GAME", now });
    expect(rolloffView(g)?.winnerId).toBe(g.turn.firstSeat);
  });
});

describe("Pokémon opening coin and first-turn reminder (PRD §10.3)", () => {
  const pokemon = getBuiltInPreset("pokemon.standard")!;
  const pg = () =>
    createGame({ preset: pokemon, seats: [{ name: "Ash" }, { name: "Misty" }] }, seededRng(3), now);

  // @req TOOL-002
  it("offers the coin for coin-prominent 2-player games; heads = seat 1", () => {
    const g = pg();
    expect(offersOpeningCoin(g)).toBe(true);
    expect(offersOpeningCoin(game())).toBe(false);
    expect(seatName(g, coinFlipWinner(g, "heads"))).toBe("Ash");
    expect(seatName(g, coinFlipWinner(g, "tails"))).toBe("Misty");
  });

  it("reminds on turn 1 only, when the capability and the option are on", () => {
    let g = pg();
    expect(firstTurnReminderDue(g)).toBe(true);
    expect(firstTurnReminderDue(game())).toBe(false);
    expect(
      firstTurnReminderDue(act(g, { type: "SET_OPTION", key: "firstTurnReminder", value: false })),
    ).toBe(false);
    g = act(g, { type: "START_GAME", now });
    g = act(g, { type: "PASS_TURN", now });
    expect(g.turn.turnNumber).toBe(2);
    expect(firstTurnReminderDue(g)).toBe(false);
  });
});
