// @req TOOL-001 @req TOOL-002 @req TOOL-003 @req TOOL-008 @req TOOL-011 @req HIST-012
import { describe, expect, it } from "vitest";
import { createGame, createSession, reduceSession, seededRng, type GameAction } from "@/engine";
import { commander } from "@/presets/mtg/presets";
import { bump, emptyMana, findStormCounter, ManaStateSchema, MANA_MAX } from "./mana";
import { resultText, runTool, toLogNote } from "./tools";

const T0 = 1_760_000_000_000;
const seats = ["Conner", "Josh", "JP", "Bethany"].map((name) => ({ id: name.toLowerCase(), name }));
const game = () => createGame({ preset: commander, seats }, seededRng(1), T0);

describe("runTool", () => {
  it("dice: single, multi (clamped) and custom", () => {
    const rng = seededRng(3);
    const one = runTool({ kind: "dice", sides: 20 }, rng, null)!;
    expect(one.kind).toBe("dice");
    if (one.kind !== "dice") return;
    expect(one.values).toHaveLength(1);
    expect(one.total).toBeGreaterThanOrEqual(1);
    expect(one.total).toBeLessThanOrEqual(20);
    const multi = runTool({ kind: "dice", sides: 6, count: 99 }, rng, null)!;
    if (multi.kind !== "dice") throw new Error();
    expect(multi.values).toHaveLength(10);
    expect(multi.total).toBe(multi.values.reduce((a, b) => a + b, 0));
    const custom = runTool({ kind: "dice", sides: 7 }, rng, null)!;
    if (custom.kind !== "dice") throw new Error();
    expect(custom.sides).toBe(7);
  });

  it("coins: flip N and until tails", () => {
    const r = runTool({ kind: "coin", count: 3 }, seededRng(1), null)!;
    if (r.kind !== "coin") throw new Error();
    expect(r.flips).toHaveLength(3);
    expect(r.mode).toBe("flip");
    const u = runTool({ kind: "untilTails" }, seededRng(1), null)!;
    if (u.kind !== "coin") throw new Error();
    expect(u.flips.at(-1)).toBe("tails");
    expect(u.mode).toBe("untilTails");
    expect(runTool({ kind: "coin" }, seededRng(1), null)).toMatchObject({ kind: "coin" });
  });

  it("seat randomizers need a game; opponent never returns the chooser", () => {
    expect(runTool({ kind: "player" }, seededRng(1), null)).toBeNull();
    expect(runTool({ kind: "opponent", chooserId: "jp" }, seededRng(1), null)).toBeNull();
    const g = game();
    expect(runTool({ kind: "opponent", chooserId: "ghost" }, seededRng(1), g)).toBeNull();
    const rng = seededRng(11);
    for (let i = 0; i < 200; i++) {
      const r = runTool({ kind: "opponent", chooserId: "jp" }, rng, g)!;
      if (r.kind !== "opponent") throw new Error();
      expect(r.seat?.id).not.toBe("jp");
      expect(r.chooser.name).toBe("JP");
    }
    const p = runTool({ kind: "player" }, rng, g)!;
    expect(p.kind).toBe("player");
    const dead = { ...g, seats: g.seats.map((s) => ({ ...s, eliminated: true })) };
    expect(runTool({ kind: "player" }, rng, dead)).toBeNull();
    const lonely = { ...g, seats: g.seats.map((s) => ({ ...s, eliminated: s.id !== "jp" })) };
    expect(runTool({ kind: "opponent", chooserId: "jp" }, rng, lonely)).toMatchObject({
      seat: null,
    });
  });
});

describe("toLogNote (HIST-012)", () => {
  it("produces LOG_NOTE actions the engine logs", () => {
    let s = createSession(game());
    const results = [
      runTool({ kind: "dice", sides: 6, count: 3 }, seededRng(1), s.game)!,
      runTool({ kind: "dice", sides: 20 }, seededRng(1), s.game)!,
      runTool({ kind: "coin" }, seededRng(1), s.game)!,
      runTool({ kind: "untilTails" }, seededRng(2), s.game)!,
      runTool({ kind: "player" }, seededRng(1), s.game)!,
      runTool({ kind: "opponent", chooserId: "jp" }, seededRng(1), s.game)!,
    ];
    for (const r of results) {
      s = reduceSession(s, { ...toLogNote(r), now: T0 + 1 } as GameAction, { rng: seededRng(1) });
      expect(resultText(r).length).toBeGreaterThan(0);
    }
    const notes = s.game.log.filter((e) => ["dice", "coin", "random"].includes(e.kind));
    expect(notes.map((e) => e.kind)).toEqual(["dice", "dice", "coin", "coin", "random", "random"]);
    expect(notes[0]!.meta).toMatchObject({ sides: 6, count: 3 });
    expect(notes[5]!.seatId).toBe("jp");
    expect(notes[5]!.meta?.mode).toBe("opponent");
    const none = toLogNote({
      kind: "opponent",
      chooser: { id: "jp", name: "JP", color: "#fff" },
      seat: null,
    });
    expect(none).toMatchObject({ meta: { resultSeatId: null } });
    expect(
      resultText({ kind: "opponent", chooser: { id: "jp", name: "JP", color: "" }, seat: null }),
    ).toBe("JP → —");
  });
});

describe("mana (TOOL-011)", () => {
  it("bump clamps to 0..MANA_MAX and the schema validates", () => {
    const m = emptyMana();
    expect(bump(m, "W", -1).W).toBe(0);
    expect(bump(m, "G", 3).G).toBe(3);
    expect(bump({ ...m, R: MANA_MAX }, "R", 1).R).toBe(MANA_MAX);
    expect(ManaStateSchema.safeParse(m).success).toBe(true);
    expect(ManaStateSchema.safeParse({ ...m, U: -1 }).success).toBe(false);
  });
  it("finds the preset's global storm counter when it has one", () => {
    expect(findStormCounter({ preset: { ...commander, counters: [] } })).toBeUndefined();
    expect(findStormCounter({ preset: commander })?.id).toBe("mtg.storm");
    expect(game().enabledCounters).not.toContain("mtg.storm");
  });
});
