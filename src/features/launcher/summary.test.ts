import { describe, expect, it } from "vitest";
import { createGame, seededRng, type Game } from "@/engine";
import { getBuiltInPreset } from "@/presets";
import { canResume, formatClock, formatElapsed, quickStartSummary, resumeSummary } from "./summary";

const T0 = 1_700_000_000_000;
const commander = getBuiltInPreset("mtg.commander")!;

function game(): Game {
  return createGame({ preset: commander, players: 4 }, seededRng(1), T0);
}

describe("launcher summaries", () => {
  // @req GAME-016
  it("formats elapsed play time", () => {
    expect(formatElapsed(0)).toBe("<1 min");
    expect(formatElapsed(34 * 60_000 + 5_000)).toBe("34 min");
    expect(formatElapsed(65 * 60_000)).toBe("1 h 05 min");
  });

  it("formats clock durations", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(75_000)).toBe("1:15");
    expect(formatClock(3_725_000)).toBe("1:02:05");
  });

  // @req GAME-016
  it("offers resume for unfinished games with preset · players · elapsed", () => {
    const g = game();
    expect(canResume(g)).toBe(true);
    expect(canResume(null)).toBe(false);
    expect(canResume({ ...g, status: "ended" })).toBe(false);
    const withActivity: Game = {
      ...g,
      activity: { changes: 4, lastAt: T0, activeMs: 34 * 60_000 },
    };
    expect(resumeSummary(withActivity, T0 + 1000)).toEqual({
      presetName: "Commander",
      players: 4,
      elapsed: "34 min",
    });
  });

  // @req GAME-001
  it("summarises the last config for quick start", () => {
    expect(
      quickStartSummary({
        preset: commander,
        players: 3,
        seats: [{ name: "Conner" }, { name: " " }, { name: "JP" }, { name: "extra" }],
      }),
    ).toEqual({ presetName: "Commander", players: 3, names: ["Conner", "JP"] });
    expect(quickStartSummary({ preset: commander }).players).toBe(4);
  });
});
