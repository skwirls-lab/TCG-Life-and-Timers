// @req LAY-008 @req LIFE-002 @req CMD-002 @req CMD-010 @req INP-006 @req TOK-003
import { describe, expect, it } from "vitest";
import { createGame, reduce, seededRng, type Game, type GameAction } from "@/engine";
import { commander } from "@/presets/mtg/presets";
import {
  artStyle,
  damageSummary,
  defaultSeatBackground,
  enumStateIcon,
  formatDelta,
  formatValue,
  hasCommanderDamage,
  parseSettingsParams,
  prefersReducedMotion,
  seatBadges,
  tileMetrics,
  toolbarGlobals,
} from "./boardHelpers";
import { carrySeats, configWithPlayers } from "./boardActions";

const rng = seededRng(5);
const game = () => createGame({ preset: commander, players: 4 }, rng, 0);
const step = (g: Game, ...a: GameAction[]) => a.reduce((acc, x) => reduce(acc, x, { rng }), g);

describe("formatting", () => {
  it("uses a true minus sign", () => {
    expect(formatDelta(3)).toBe("+3");
    expect(formatDelta(-3)).toBe("−3");
    expect(formatDelta(0)).toBe("0");
    expect(formatValue(-2)).toBe("−2");
    expect(formatValue(40)).toBe("40");
  });
});

describe("tileMetrics (LAY-008)", () => {
  it("never lets the number overlap the pill or bottom rows", () => {
    for (const frame of [
      { w: 246, h: 152 },
      { w: 342, h: 180 },
      { w: 180, h: 342 },
      { w: 360, h: 342 },
    ]) {
      for (const wide of [true, false]) {
        const m = tileMetrics(frame, { wide, details: true, big: false, chars: 2, gridRows: 3 });
        expect(m.numberTop).toBeGreaterThanOrEqual(m.topH);
        expect(m.fontPx).toBeLessThanOrEqual(m.numberH);
        expect(m.numberTop + m.numberH).toBeLessThanOrEqual(frame.h - m.bottomH + 1e-6);
        expect(m.cellPx).toBeGreaterThanOrEqual(12);
      }
    }
  });

  it("fits 5 characters (8000 LP + sign) in the width, and big font is bigger", () => {
    const frame = { w: 300, h: 300 };
    const five = tileMetrics(frame, {
      wide: true,
      details: true,
      big: false,
      chars: 5,
      gridRows: 1,
    });
    expect(five.fontPx * 0.6 * 5).toBeLessThanOrEqual(300);
    const normal = tileMetrics(
      { w: 500, h: 220 },
      {
        wide: true,
        details: true,
        big: false,
        chars: 2,
        gridRows: 1,
      },
    );
    const big = tileMetrics(
      { w: 500, h: 220 },
      {
        wide: true,
        details: false,
        big: true,
        chars: 2,
        gridRows: 1,
      },
    );
    expect(big.fontPx).toBeGreaterThan(normal.fontPx);
    expect(big.bottomH).toBe(0);
  });
});

describe("artStyle", () => {
  it("handles image art with a focal point and zoom", () => {
    const s = artStyle(
      { kind: "scryfall", value: 'https://x/a"b.jpg', focal: { x: 0.2, y: 0.8, zoom: 1.5 } },
      "#fff",
    );
    expect(s.backgroundImage).toBe('url("https://x/a\\"b.jpg")');
    expect(s.backgroundPosition).toBe("20% 80%");
    expect(s.transform).toBe("scale(1.5)");
    expect(artStyle({ kind: "upload", value: "blob:1" }, "#fff").transform).toBeUndefined();
  });

  it("handles gradients, solids and the default seat colour", () => {
    expect(artStyle({ kind: "gradient", value: "linear-gradient(red, blue)" }, "#000")).toEqual({
      background: "linear-gradient(red, blue)",
    });
    expect(artStyle({ kind: "solid", value: "#123" }, "#000")).toEqual({ background: "#123" });
    expect(artStyle({ kind: "gradient", value: "palette-7" }, "#abc")).toEqual({
      background: defaultSeatBackground("#abc"),
    });
    expect(artStyle(undefined, "#abc").background).toContain("#abc");
  });
});

describe("game-derived views", () => {
  it("badges: tokens on the holder, tax shows casts × 2", () => {
    let g = game();
    const [a, b] = g.seats;
    g = step(
      g,
      { type: "TOKEN_GIVE", counterId: "mtg.monarch", seatId: b!.id, now: 1 },
      { type: "CMD_TAX_CAST", seatId: a!.id, commanderIndex: 0, delta: 2, now: 2 },
      { type: "COUNTER_ADD", counterId: "mtg.poison", seatId: a!.id, delta: -1, now: 3 },
    );
    expect(seatBadges(g, a!.id, "nonDefault").map((x) => [x.counterId, x.text])).toEqual([
      ["mtg.tax", "4"],
    ]);
    expect(seatBadges(g, b!.id, "nonDefault")).toEqual([
      expect.objectContaining({ counterId: "mtg.monarch", icon: "crown", text: "" }),
    ]);
    expect(seatBadges(g, a!.id, "hidden")).toEqual([]);
    expect(seatBadges(g, a!.id, "always").length).toBeGreaterThan(1);
  });

  it("damage summary groups partner commanders by source seat", () => {
    let g = createGame(
      { preset: commander, players: 3, seats: [{}, { commanders: ["A", "B"] }, {}] },
      rng,
      0,
    );
    const [t, p] = g.seats;
    g = step(g, {
      type: "CMD_DAMAGE_ADD",
      targetSeatId: t!.id,
      sourceSeatId: p!.id,
      sourceIndex: 1,
      delta: 4,
      now: 1,
    });
    const s = damageSummary(g, t!.id);
    expect(s).toHaveLength(3);
    expect(s[0]).toEqual({ sourceSeatId: t!.id, values: [0], self: true });
    expect(s[1]!.values).toEqual([0, 4]);
    expect(hasCommanderDamage(g)).toBe(true);
  });

  it("day/night appears in the toolbar only when enabled, with sun/moon icons", () => {
    let g = game();
    expect(toolbarGlobals(g)).toEqual([]);
    g = step(g, { type: "COUNTER_ENABLE", counterId: "mtg.dayNight", enabled: true });
    const [def] = toolbarGlobals(g);
    expect(def!.id).toBe("mtg.dayNight");
    expect(enumStateIcon(def!, 0)).toBe("daynight");
    expect(enumStateIcon(def!, 1)).toBe("sun");
    expect(enumStateIcon(def!, 2)).toBe("moon");
  });

  it("player-count change keeps seats by index and the game's options", () => {
    const g = step(game(), { type: "SEAT_RENAME", seatId: "s1", name: "Conner" });
    const cfg = configWithPlayers(g, 3, "topPair");
    expect(cfg.players).toBe(3);
    expect(cfg.layoutId).toBe("topPair");
    expect(cfg.seats![0]!.name).toBe("Conner");
    expect(carrySeats(g, 6)).toHaveLength(4);
    expect(configWithPlayers(g, 2).layoutId).toBeUndefined();
  });
});

describe("settings helpers", () => {
  it("reduced motion follows the setting, then the system", () => {
    expect(prefersReducedMotion("always", false)).toBe(true);
    expect(prefersReducedMotion("never", true)).toBe(false);
    expect(prefersReducedMotion("system", true)).toBe(true);
  });

  it("parses test-build settings params", () => {
    const p = parseSettingsParams(
      new URLSearchParams(
        "s.cameraMode=bottom&s.onePlayerMode=1&s.bubbleMs=3000&s.holdDelayMs=1&x=1",
      ),
    );
    expect(p).toEqual({
      cameraMode: "bottom",
      onePlayerMode: true,
      bubbleMs: 3000,
      holdDelayMs: 1,
    });
  });
});
