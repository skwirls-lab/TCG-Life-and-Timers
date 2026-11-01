// @vitest-environment node
/** Property tests (fast-check) for engine invariants (T1.2 DoD). */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { newGame, T0, testPreset } from "../../tests/unit/helpers/engine";
import {
  createSession,
  parseCounterKey,
  reduceSession,
  seatById as findSeat,
  seededRng,
  type Game,
  type GameAction,
  type GameSession,
} from "./index";

const SEATS = ["s1", "s2", "s3", "s4"];
const seat = fc.constantFrom(...SEATS);
const delta = fc.integer({ min: -25, max: 25 });

/** Arbitrary game actions (time is filled in by the runner). */
const actionArb: fc.Arbitrary<Omit<GameAction, "now">> = fc.oneof(
  fc.record({
    type: fc.constant("COUNTER_ADD" as const),
    counterId: fc.constantFrom("life", "poison", "energy", "tax", "seen"),
    seatId: seat,
    delta,
  }),
  fc.record({
    type: fc.constant("COUNTER_SET" as const),
    counterId: fc.constantFrom("life", "poison", "energy"),
    seatId: seat,
    value: fc.integer({ min: -50, max: 60 }),
  }),
  fc.record({
    type: fc.constant("CMD_DAMAGE_ADD" as const),
    targetSeatId: seat,
    sourceSeatId: seat,
    sourceIndex: fc.integer({ min: 0, max: 1 }),
    delta,
  }),
  fc.record({
    type: fc.constant("CMD_TAX_CAST" as const),
    seatId: seat,
    commanderIndex: fc.integer({ min: 0, max: 1 }),
    delta: fc.constantFrom(1, -1),
  }),
  fc.record({
    type: fc.constant("BOOL_TOGGLE" as const),
    counterId: fc.constantFrom("flag", "asleep", "confused"),
    seatId: seat,
  }),
  fc.record({ type: fc.constant("ENUM_NEXT" as const), counterId: fc.constant("daynight") }),
  fc.record({
    type: fc.constant("TOKEN_GIVE" as const),
    counterId: fc.constant("monarch"),
    seatId: fc.option(seat, { nil: null }),
  }),
  fc.record({ type: fc.constant("ELIMINATE" as const), seatId: seat }),
  fc.record({ type: fc.constant("REVIVE" as const), seatId: seat }),
  fc.record({ type: fc.constant("CONCEDE" as const), seatId: seat }),
  fc.record({ type: fc.constant("PASS_TURN" as const) }),
  fc.record({ type: fc.constant("START_GAME" as const) }),
  fc.record({ type: fc.constant("RESET_GAME" as const) }),
  fc.record({
    type: fc.constant("SEAT_SET_COMMANDERS" as const),
    seatId: seat,
    commanders: fc.constantFrom(["A"], ["A", "B"]),
  }),
  fc.record({
    type: fc.constant("SET_OPTION" as const),
    key: fc.constant("autoKO" as const),
    value: fc.constantFrom("auto" as const, "prompt" as const, "off" as const),
  }),
  fc.record({
    type: fc.constant("COUNTER_ENABLE" as const),
    counterId: fc.constant("energy"),
    enabled: fc.boolean(),
  }),
) as fc.Arbitrary<Omit<GameAction, "now">>;

const actionsArb = fc.array(fc.tuple(actionArb, fc.integer({ min: 0, max: 4000 })), {
  minLength: 1,
  maxLength: 60,
});
const ALL_COUNTERS = testPreset().counters.map((c) => c.id);

function runAll(steps: [Omit<GameAction, "now">, number][], seed: number): GameSession[] {
  const rng = seededRng(seed);
  let t = T0;
  const sessions: GameSession[] = [createSession(newGame({ enabledCounters: ALL_COUNTERS }))];
  for (const [a, gap] of steps) {
    t += gap;
    sessions.push(reduceSession(sessions.at(-1)!, { ...a, now: t } as GameAction, { rng }));
  }
  return sessions;
}

function inBounds(g: Game): boolean {
  for (const [key, v] of Object.entries(g.values)) {
    const def = g.preset.counters.find((c) => c.id === parseCounterKey(key).counterId)!;
    if (def.min !== null && def.min !== undefined && v < def.min) return false;
    if (def.max !== null && def.max !== undefined && v > def.max) return false;
  }
  return true;
}

describe("engine properties", () => {
  // @req CTR-002
  it("values always stay within [min, max]", () => {
    fc.assert(
      fc.property(actionsArb, fc.integer(), (steps, seed) =>
        runAll(steps, seed).every((s) => inBounds(s.game)),
      ),
      { numRuns: 300 },
    );
  });

  // @req GAME-015
  it("undo after N steps restores the exact earlier state and redo re-applies it", () => {
    fc.assert(
      fc.property(actionsArb, fc.integer(), fc.nat(), (steps, seed, k) => {
        const sessions = runAll(steps, seed);
        const final = sessions.at(-1)!;
        const n = final.past.length === 0 ? 0 : k % (final.past.length + 1);
        let s = final;
        for (let i = 0; i < n; i++) s = reduceSession(s, { type: "UNDO" }, { rng: seededRng(0) });
        expect(s.game).toBe(final.past[final.past.length - n] ?? final.game);
        for (let i = 0; i < n; i++) s = reduceSession(s, { type: "REDO" }, { rng: seededRng(0) });
        expect(s.game).toBe(final.game);
        expect(s.past).toEqual(final.past);
      }),
      { numRuns: 200 },
    );
  });

  // @req TOK-001
  it("a token has at most one holder, and it is a seat in the game", () => {
    fc.assert(
      fc.property(actionsArb, fc.integer(), (steps, seed) =>
        runAll(steps, seed).every(({ game }) => {
          const holder = game.tokens.monarch;
          return holder === null || holder === undefined || findSeat(game, holder) !== undefined;
        }),
      ),
      { numRuns: 200 },
    );
  });

  // @req TMR-003
  it("the turn never passes to an eliminated seat", () => {
    fc.assert(
      fc.property(actionsArb, fc.integer(), (steps, seed) => {
        const sessions = runAll(steps, seed);
        for (let i = 1; i < sessions.length; i++) {
          const g = sessions[i]!.game;
          const prev = sessions[i - 1]!.game;
          if (
            g.turn.turnNumber > prev.turn.turnNumber &&
            g.turn.activeSeat !== prev.turn.activeSeat
          ) {
            if (findSeat(g, g.turn.activeSeat)?.eliminated && g.status !== "ended") return false;
          }
        }
        return true;
      }),
      { numRuns: 200 },
    );
  });

  // @req GAME-014
  it("game ends iff ≤ 1 seat is alive or a win/manual result exists", () => {
    fc.assert(
      fc.property(actionsArb, fc.integer(), (steps, seed) =>
        runAll(steps, seed).every(({ game }) => {
          const alive = game.seats.filter((s) => !s.eliminated).length;
          if (alive <= 1) return game.status === "ended";
          return game.status !== "ended" || game.result?.reason !== "lastStanding";
        }),
      ),
      { numRuns: 300 },
    );
  });
});
