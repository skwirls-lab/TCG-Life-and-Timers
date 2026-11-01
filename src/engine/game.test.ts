// @vitest-environment node
import { describe, expect, it } from "vitest";
import { testPreset, T0 } from "../../tests/unit/helpers/engine";
import {
  counterKey,
  counterValue,
  createGame,
  defaultTimerConfig,
  GAME_SCHEMA_VERSION,
  GameSchema,
  isTimerAction,
  previousResultOf,
  reduceTimer,
  seededRng,
} from "./index";
import { initialBankMs } from "./timer/types";

describe("createGame", () => {
  // @req GAME-001 @req GAME-013 @req PRE-013
  it("builds a ready game from a preset, seats and overrides", () => {
    const g = createGame(
      {
        preset: testPreset(),
        players: 3,
        seats: [
          { name: "A", commanders: ["X"] },
          { id: "s1", name: " " },
          {
            id: "custom",
            color: "#000",
            contrast: true,
            profileId: "p",
            deckId: "d",
            deckName: "D",
            teamId: "t",
            rotationOverride: 180,
            art: { kind: "default", value: "" },
          },
        ],
        startOverrides: { life: 30 },
        perSeatStart: { custom: { life: 12 } },
        enabledCounters: ["poison", "bogus"],
        layoutId: "rows",
      },
      seededRng(1),
      T0,
    );
    expect(GameSchema.safeParse(g).success).toBe(true);
    expect(g.schemaVersion).toBe(GAME_SCHEMA_VERSION);
    expect(g.status).toBe("ready");
    expect(g.seats.map((s) => s.id)).toEqual(["s1", "s2", "custom"]);
    expect(g.seats.map((s) => s.name)).toEqual(["A", "Player 2", "Player 3"]);
    expect(g.seats[2]).toMatchObject({
      color: "#000",
      contrast: true,
      profileId: "p",
      teamId: "t",
      rotationOverride: 180,
    });
    expect(g.enabledCounters).toEqual(["life", "poison"]);
    expect(counterValue(g, "life", "s1")).toBe(30);
    expect(counterValue(g, "life", "custom")).toBe(12);
    expect(g.layoutId).toBe("rows");
    expect(g.log[0]).toMatchObject({ kind: "firstPlayer", seatId: g.turn.firstSeat });
    expect(g.turn).toMatchObject({ turnNumber: 1, round: 1, turnStartedAt: null });
    expect(Object.keys(g.timer.clocks)).toEqual(["s1", "s2", "custom"]);
  });

  it("uses preset defaults: players, layout, options and turn tracking from the timer mode", () => {
    const preset = testPreset({
      defaults: {
        timer: defaultTimerConfig({ mode: "bank" }),
        firstPlayerRule: "choose",
        layoutByPlayers: { "4": "grid" },
        options: { autoKO: "prompt" },
      },
    });
    const g = createGame({ preset, id: "fixed" }, seededRng(1), T0);
    expect(g.id).toBe("fixed");
    expect(g.seats).toHaveLength(4);
    expect(g.layoutId).toBe("grid");
    expect(g.options).toMatchObject({
      autoKO: "prompt",
      turnTracking: true,
      firstPlayerRule: "choose",
    });
    expect(g.turn.awaitingFirstPlayer).toBe(true);
    expect(g.timer.clocks.s1!.bankMs).toBe(defaultTimerConfig().bankMs);
    const p2 = createGame({ preset: testPreset(), seats: [{}, {}] }, seededRng(1), T0);
    expect(p2.seats).toHaveLength(2);
    expect(p2.layoutId).toBe("default");
  });

  it("rejects invalid player counts and always enables the primary", () => {
    expect(() => createGame({ preset: testPreset(), players: 0 }, seededRng(1), T0)).toThrow(
      RangeError,
    );
    expect(() => createGame({ preset: testPreset(), players: 9 }, seededRng(1), T0)).toThrow(
      RangeError,
    );
    expect(() => createGame({ preset: testPreset(), players: 2.5 }, seededRng(1), T0)).toThrow(
      RangeError,
    );
    const g = createGame(
      { preset: testPreset(), players: 2, enabledCounters: [] },
      seededRng(1),
      T0,
    );
    expect(g.enabledCounters).toEqual(["life"]);
    expect(g.values[counterKey("life", "s1")]).toBe(20);
  });

  // @req GAME-012
  it("honors firstSeatId and previousResult", () => {
    const g = createGame(
      {
        preset: testPreset(),
        players: 3,
        options: { firstPlayerRule: "winner" },
        previousResult: { winners: ["s3"] },
      },
      seededRng(1),
      T0,
    );
    expect(g.turn.firstSeat).toBe("s3");
    expect(g.previous).toEqual({ winners: ["s3"] });
    const h = createGame({ preset: testPreset(), players: 3, firstSeatId: "s2" }, seededRng(1), T0);
    expect(h.turn.firstSeat).toBe("s2");
    expect(previousResultOf(h)).toEqual({ winners: [] });
    const ignored = createGame(
      {
        preset: testPreset(),
        players: 3,
        firstSeatId: "zz",
        options: { firstPlayerRule: "choose" },
      },
      seededRng(1),
      T0,
    );
    expect(ignored.turn.firstSeat).toBe("s1");
  });
});

describe("timer seam", () => {
  it("reduceTimer leaves an untimed game unchanged and isTimerAction classifies actions", () => {
    const g = createGame({ preset: testPreset(), players: 2 }, seededRng(1), T0);
    expect(reduceTimer(g, { type: "TIMER_RESUME", now: T0 }, T0)).toBe(g);
    expect(isTimerAction({ type: "TIMER_RESUME", now: T0 })).toBe(true);
    expect(isTimerAction({ type: "PASS_TURN", now: T0 })).toBe(false);
  });

  it("initial banks per mode", () => {
    const c = defaultTimerConfig();
    expect(initialBankMs({ ...c, mode: "off" })).toBe(0);
    expect(initialBankMs({ ...c, mode: "countup" })).toBe(0);
    expect(initialBankMs({ ...c, mode: "perTurn" })).toBe(c.perTurnMs);
    expect(initialBankMs({ ...c, mode: "perTurnReserve" })).toBe(c.reserveMs);
    expect(initialBankMs({ ...c, mode: "bankIncrement" })).toBe(c.bankMs);
  });
});
