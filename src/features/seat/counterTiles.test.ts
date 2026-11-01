// @req SEAT-001 @req CMD-010 @req TOK-001 @req TOK-003 @req TOK-004
import { describe, expect, it } from "vitest";
import {
  counterValue,
  createGame,
  reduce,
  seededRng,
  taxDisplay,
  tokenHolder,
  type Game,
} from "@/engine";
import { cellLevel, matrixCounter } from "@/features/commander/damage";
import { getBuiltInPreset } from "@/presets";
import {
  counterTiles,
  minusAction,
  resetAction,
  setAction,
  tapAction,
  tileDisplay,
  type CounterTile,
  type MenuAction,
} from "./counterTiles";

const rng = seededRng(7);
const T = 1_700_000_000_000;

function game(): Game {
  return createGame(
    {
      preset: getBuiltInPreset("mtg.commander")!,
      players: 4,
      seats: [{ name: "A" }, { name: "B" }],
    },
    rng,
    T,
  );
}
const run = (g: Game, a: MenuAction) =>
  reduce(g, { ...a, now: T + 1 } as Parameters<typeof reduce>[1], { rng });
const tile = (g: Game, seatId: string, id: string): CounterTile =>
  counterTiles(g, seatId).find((x) => x.tileId === id)!;

describe("counter tiles", () => {
  // @req SEAT-001
  it("lists enabled counters (no primary, no matrix) and then the disabled ones", () => {
    const g = game();
    const s = g.seats[0]!.id;
    const tiles = counterTiles(g, s);
    const ids = tiles.map((x) => x.tileId);
    expect(ids).not.toContain("mtg.life");
    expect(ids).not.toContain("mtg.cmdDamage");
    expect(ids).toContain("mtg.poison");
    expect(ids).toContain("mtg.tax");
    const firstDisabled = tiles.findIndex((x) => !x.enabled);
    expect(firstDisabled).toBeGreaterThan(0);
    expect(tiles.slice(firstDisabled).every((x) => !x.enabled)).toBe(true);
    expect(tileDisplay(g, tile(g, s, "mtg.energy"), s)).toEqual({ kind: "off" });
  });

  it("tap increments numbers and hold options decrement / set / reset", () => {
    let g = game();
    const s = g.seats[0]!.id;
    g = run(g, tapAction(tile(g, s, "mtg.poison"), s));
    expect(counterValue(g, "mtg.poison", s)).toBe(1);
    expect(tile(g, s, "mtg.poison").isDefault).toBe(false);
    g = run(g, setAction(tile(g, s, "mtg.poison"), s, 7));
    expect(counterValue(g, "mtg.poison", s)).toBe(7);
    g = run(g, minusAction(tile(g, s, "mtg.poison"), s));
    expect(tileDisplay(g, tile(g, s, "mtg.poison"), s)).toEqual({ kind: "number", value: 6 });
    g = run(g, resetAction(tile(g, s, "mtg.poison"), s));
    expect(counterValue(g, "mtg.poison", s)).toBe(0);
  });

  // @req CMD-010
  it("commander tax counts casts and shows the tax; partners get two tiles", () => {
    let g = game();
    const s = g.seats[0]!.id;
    g = run(g, tapAction(tile(g, s, "mtg.tax"), s));
    g = run(g, tapAction(tile(g, s, "mtg.tax"), s));
    expect(tileDisplay(g, tile(g, s, "mtg.tax"), s)).toEqual({ kind: "tax", tax: 4, casts: 2 });
    g = run(g, minusAction(tile(g, s, "mtg.tax"), s));
    expect(taxDisplay(g, s)).toEqual({ casts: 1, tax: 2 });
    g = run(g, { type: "SEAT_SET_COMMANDERS", seatId: s, commanders: ["A", "B"] });
    const second = tile(g, s, "mtg.tax-1");
    expect(second.sourceIndex).toBe(1);
    g = run(g, tapAction(second, s));
    expect(taxDisplay(g, s, 1)).toEqual({ casts: 1, tax: 2 });
    expect(taxDisplay(g, s, 0)).toEqual({ casts: 1, tax: 2 });
  });

  // @req TOK-001
  it("token tap gives the token to this seat (transfer) and clears when held", () => {
    let g = game();
    const [a, b] = [g.seats[0]!.id, g.seats[1]!.id];
    g = run(g, tapAction(tile(g, a, "mtg.monarch"), a));
    expect(tokenHolder(g, "mtg.monarch")).toBe(a);
    expect(tileDisplay(g, tile(g, a, "mtg.monarch"), a)).toEqual({ kind: "token", held: true });
    g = run(g, tapAction(tile(g, b, "mtg.monarch"), b));
    expect(tokenHolder(g, "mtg.monarch")).toBe(b);
    g = run(g, tapAction(tile(g, b, "mtg.monarch"), b));
    expect(tokenHolder(g, "mtg.monarch")).toBeNull();
    g = run(g, tapAction(tile(g, b, "mtg.monarch"), b));
    g = run(g, resetAction(tile(g, b, "mtg.monarch"), b));
    expect(tokenHolder(g, "mtg.monarch")).toBeNull();
  });

  // @req TOK-003 @req TOK-004
  it("disabled counters enable on tap; enums cycle; booleans toggle", () => {
    let g = game();
    const s = g.seats[0]!.id;
    g = run(g, tapAction(tile(g, s, "mtg.dayNight"), s));
    g = run(g, tapAction(tile(g, s, "mtg.citysBlessing"), s));
    const dn = tile(g, s, "mtg.dayNight");
    expect(dn.enabled && dn.global).toBe(true);
    g = run(g, tapAction(dn, s));
    expect(tileDisplay(g, tile(g, s, "mtg.dayNight"), s)).toEqual({ kind: "enum", label: "day" });
    g = run(g, tapAction(tile(g, s, "mtg.dayNight"), s));
    g = run(g, tapAction(tile(g, s, "mtg.dayNight"), s));
    expect(counterValue(g, "mtg.dayNight")).toBe(1);
    g = run(g, resetAction(tile(g, s, "mtg.dayNight"), s));
    expect(counterValue(g, "mtg.dayNight")).toBe(0);

    g = run(g, tapAction(tile(g, s, "mtg.citysBlessing"), s));
    expect(tileDisplay(g, tile(g, s, "mtg.citysBlessing"), s)).toEqual({
      kind: "boolean",
      on: true,
    });
    g = run(g, resetAction(tile(g, s, "mtg.citysBlessing"), s));
    expect(counterValue(g, "mtg.citysBlessing", s)).toBe(0);

    g = run(g, tapAction(tile(g, s, "mtg.storm"), s));
    g = run(g, tapAction(tile(g, s, "mtg.storm"), s));
    expect(counterValue(g, "mtg.storm")).toBe(1);
  });
});

describe("commander damage helpers", () => {
  // @req CMD-005
  it("finds the matrix counter and grades cells against the threshold", () => {
    expect(matrixCounter(game())?.id).toBe("mtg.cmdDamage");
    expect(
      matrixCounter(
        createGame({ preset: getBuiltInPreset("mtg.constructed")!, players: 2 }, rng, T),
      ),
    ).toBeUndefined();
    expect(cellLevel(0, 21)).toBe("none");
    expect(cellLevel(15, 21)).toBe("none");
    expect(cellLevel(16, 21)).toBe("warning");
    expect(cellLevel(21, 21)).toBe("lethal");
    expect(cellLevel(30, null)).toBe("none");
  });
});
