// @req GAME-011 @req LIFE-006 @req CMD-003 @req ENV-003 @req LAY-010
/** Review A helpers: first-player marker, pips, partner cells, the toolbar fit and the track. */
import { describe, expect, it } from "vitest";
import { createGame, reduce, seededRng, type Game } from "@/engine";
import { getLayout } from "@/engine/layout";
import { getBuiltInPreset } from "@/presets";
import { firstMarkerKey } from "@/features/game-flow/flow";
import { offersStartPicker } from "@/features/setup/setupModel";
import {
  TOOLBAR_MORE_PX,
  fitToolbar,
  pipLayout,
  trackGlobals,
  trackPlusAtEnd,
  type ToolbarItem,
} from "./boardHelpers";
import { cellValues } from "./MiniGrid";

const preset = (id: string) => getBuiltInPreset(id)!;
const make = (id: string, players = 2): Game =>
  createGame(
    {
      preset: preset(id),
      players,
      seats: ["A", "B", "C", "D"].slice(0, players).map((name) => ({ name })),
    },
    seededRng(7),
    1000,
  );

describe("first-player marker (A-1)", () => {
  it("marks only the starter until a counter changes or the turn passes", () => {
    const g = make("mtg.commander", 4);
    const first = g.turn.firstSeat;
    const keys = g.seats.map((s) => firstMarkerKey(g, s.id));
    expect(keys.filter(Boolean)).toHaveLength(1);
    expect(firstMarkerKey(g, first)).toMatch(new RegExp(`^${g.id}:.+\\|1$`));
    const changed = reduce(
      g,
      { type: "COUNTER_ADD", counterId: "mtg.life", seatId: first, delta: -1, now: 2000 },
      { rng: seededRng(1) },
    );
    expect(firstMarkerKey(changed, first)).toBe("");
    const passed = reduce(g, { type: "PASS_TURN", now: 2000 }, { rng: seededRng(1) });
    expect(firstMarkerKey(passed, first)).toBe("");
  });
});

describe("pips (A-6)", () => {
  it("picks one or two rows, whichever gives bigger pips", () => {
    expect(pipLayout(7, 600, 80)).toMatchObject({ rows: 1, cols: 7 });
    const two = pipLayout(7, 220, 220);
    expect(two).toMatchObject({ rows: 2, cols: 4 });
    expect(two.d * 4 + two.gap * 3).toBeLessThanOrEqual(220 + 4);
    expect(pipLayout(1, 100, 100)).toMatchObject({ rows: 1, cols: 1 });
  });
});

describe("partner cells (A-2)", () => {
  it("lists one value per commander, or nothing without damage", () => {
    expect(cellValues(undefined)).toEqual([]);
    expect(cellValues({ sourceSeatId: "s1", values: [0, 0], self: false })).toEqual([]);
    expect(cellValues({ sourceSeatId: "s1", values: [14, 12], self: false })).toEqual(["14", "12"]);
    expect(cellValues({ sourceSeatId: "s1", values: [21], self: false })).toEqual(["21"]);
  });
});

describe("toolbar fit (A-5)", () => {
  const items: ToolbarItem[] = [
    { key: "reset", size: 48, compactSize: 44, priority: 1 },
    { key: "players", size: 48, compactSize: 44, priority: 4 },
    { key: "history", size: 48, compactSize: 44, priority: 6 },
    { key: "clock", size: 120, compactSize: 44, priority: 0, pinned: true },
    { key: "match", size: 80, compactSize: 64, priority: 2 },
    { key: "tools", size: 48, compactSize: 44, priority: 5 },
    { key: "settings", size: 48, compactSize: 44, priority: 3, pinned: true },
  ];
  it("keeps normal density when it fits", () => {
    expect(fitToolbar(items, 1000)).toEqual({ compact: false, overflow: [] });
  });
  it("goes compact, then moves the lowest priorities into More (Settings stays)", () => {
    expect(fitToolbar(items, 330)).toEqual({ compact: true, overflow: [] });
    const tight = fitToolbar(items, 290);
    expect(tight.compact).toBe(true);
    expect(tight.overflow).toEqual(["history", "tools"]);
    const kept = items.filter((i) => !tight.overflow.includes(i.key));
    expect(kept.reduce((s, i) => s + i.compactSize, 0) + TOOLBAR_MORE_PX).toBeLessThanOrEqual(290);
    expect(fitToolbar(items, 200).overflow).not.toContain("settings");
  });
});

describe("shared track (A-4)", () => {
  it("only Digimon-style global track counters qualify", () => {
    expect(trackGlobals(make("digimon.standard")).map((c) => c.id)).toEqual(["digimon.memory"]);
    expect(trackGlobals(make("mtg.commander"))).toEqual([]);
  });
  it("puts each owner's side on their right", () => {
    expect(trackPlusAtEnd("horizontal", 180)).toBe(false); // top player: screen left
    expect(trackPlusAtEnd("horizontal", 0)).toBe(true);
    expect(trackPlusAtEnd("vertical", 90)).toBe(true); // left player: bottom
    expect(trackPlusAtEnd("vertical", 270)).toBe(false);
  });
  it("a thicker toolbar strip makes room for the track", () => {
    const base = getLayout({ players: 2, viewport: { w: 360, h: 740 } });
    const thick = getLayout({ players: 2, viewport: { w: 360, h: 740 }, toolbarPx: 112 });
    expect(thick.toolbar.rect.h * 740).toBeCloseTo(112, 0);
    expect(thick.toolbar.rect.h).toBeGreaterThan(base.toolbar.rect.h);
    const land = getLayout({ players: 2, viewport: { w: 915, h: 412 }, toolbarPx: 112 });
    expect(land.toolbar.orientation).toBe("vertical");
    expect(land.toolbar.rect.w * 915).toBeCloseTo(112, 0);
  });
});

describe("setup start picker (A-10)", () => {
  it("is hidden for damage counted up from 0 (SWU, FFTCG) and shown for life presets", () => {
    expect(offersStartPicker(preset("swu.premier"))).toBe(false);
    expect(offersStartPicker(preset("fftcg.standard"))).toBe(false);
    expect(offersStartPicker(preset("mtg.commander"))).toBe(true);
    expect(offersStartPicker(preset("onepiece.standard"))).toBe(true);
  });
});
