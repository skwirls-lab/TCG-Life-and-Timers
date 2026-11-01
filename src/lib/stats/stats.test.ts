// @req HIST-005 @req HIST-021 @req HIST-022 @req HIST-023 @req HIST-024 @req HIST-033
/**
 * Every expected number below was computed by hand from the fixture table in ./fixtures.ts
 * (see the comments next to each assertion).
 */
import { describe, expect, it } from "vitest";
import type { GameRecord } from "@/lib/records/types";
import { DAY, FIXTURE_BASE, FIXTURE_RECORDS } from "./fixtures";
import {
  activeFilterKeys,
  applyFilter,
  clearFilterKey,
  deckKey,
  filterOptions,
  freeTierFilter,
} from "./filter";
import {
  byPreset,
  clockInsights,
  commanderLeaderboard,
  durations,
  eliminationCauses,
  firstBlood,
  playgroups,
  summary,
  turnOrderAdvantage,
} from "./insights";
import { deckDetail, deckRows, pct, playerDetail, playerRows, weightedTurnMs } from "./players";

const R = FIXTURE_RECORDS;
const MIN = 60_000;
const ANA = "p:p-ana";

describe("fixtures", () => {
  it("has 26 records with distinct ids", () => {
    expect(R).toHaveLength(26);
    expect(new Set(R.map((r) => r.id)).size).toBe(26);
  });
});

describe("players (HIST-021, HIST-033)", () => {
  // @req HIST-021 @req HIST-033
  it("lists W/L and win % per identity, excluding default names", () => {
    const rows = playerRows(R);
    expect(rows.map((r) => [r.name, r.games, r.wins, r.losses])).toEqual([
      ["Ben", 26, 7, 16], // A 2/8, B 3/4, C 1/3, D 1/1
      ["Ana", 24, 9, 12], // A 4/6, B 4/3, C 1/3
      ["Cy", 14, 2, 10], // A 2/8, D 0/2
      ["Dee", 12, 2, 8],
      ["declan", 2, 1, 1], // "Declan" + "declan" → one identity (latest name shown)
    ]);
    expect(rows[1]!.winPct).toBeCloseTo(9 / 21);
    expect(rows[1]!.profileId).toBe("p-ana");
    expect(rows.some((r) => /player/i.test(r.name))).toBe(false);
  });

  // @req HIST-033
  it("shows default names with the toggle", () => {
    const rows = playerRows(R, { includeDefaultNames: true });
    const p3 = rows.find((r) => r.identity === "n:player 3")!;
    expect([p3.games, p3.wins, p3.losses, p3.isDefault]).toEqual([4, 1, 3, true]);
    expect(rows).toHaveLength(7);
  });

  // @req HIST-021
  it("player detail: by preset, deck, position, h2h, turn time, common cause", () => {
    const d = playerDetail(R, ANA)!;
    expect(d.games).toHaveLength(24);
    expect(d.byPreset.map((b) => [b.key, b.games, b.wins, b.losses])).toEqual([
      ["mtg.commander", 16, 5, 9],
      ["mtg.constructed", 8, 4, 3],
    ]);
    expect(d.byDeck.map((b) => [b.label, b.games, b.wins, b.losses])).toEqual([
      ["Toxrill", 12, 4, 6],
    ]);
    // Ana's turn positions: A seat 0 with start i%4; B even = 1st; C start k.
    expect(d.byPosition.map((b) => [b.key, b.games, b.wins, b.losses])).toEqual([
      ["1", 8, 5, 3],
      ["2", 8, 2, 5],
      ["3", 4, 0, 3],
      ["4", 4, 2, 1],
    ]);
    // (100 s × 5 + 60 s × 80) / 85 turns
    expect(d.avgTurnMs).toBe(Math.round(5_300_000 / 85));
    expect(d.headToHead.map((h) => [h.name, h.games, h.wins, h.losses])).toEqual([
      ["Ben", 24, 9, 6],
      ["Cy", 12, 4, 2],
      ["Dee", 12, 4, 2],
    ]);
    expect(d.favoriteOpponents).toHaveLength(3);
    expect(d.commonCause).toEqual({ kind: "life", count: 8 });
    // Head-to-head with default names when toggled.
    const all = playerDetail(R, ANA, { includeDefaultNames: true })!;
    expect(all.headToHead.map((h) => h.name)).toContain("Player 3");
    expect(playerDetail(R, "n:nobody")).toBeNull();
    // A player who was never eliminated has no common cause.
    const declan = playerDetail(R, "n:declan")!;
    expect(declan.commonCause).toEqual({ kind: "life", count: 1 });
    expect(declan.avgTurnMs).toBeNull();
    expect(declan.byPosition.map((b) => [b.key, b.games])).toEqual([
      ["1", 1],
      ["3", 1],
    ]);
  });
});

describe("decks (HIST-022)", () => {
  // @req HIST-022
  it("lists decks with player and W/L (top 3 preview order)", () => {
    const rows = deckRows(R);
    expect(rows.map((d) => [d.deckName, d.playerName, d.games, d.wins, d.losses])).toEqual([
      ["Toxrill", "Ana", 12, 4, 6],
      ["Kaalia", "Cy", 12, 2, 8],
      ["Krenko", "Ben", 12, 2, 8],
    ]);
    expect(rows[1]!.commanders).toEqual(["Kaalia"]);
  });

  // @req HIST-022
  it("deck detail: by position, average place, damage dealt / taken", () => {
    const d = deckDetail(R, "d:d-tox")!;
    expect(d.games).toHaveLength(12);
    expect(d.byPosition.map((b) => [b.key, b.games, b.wins, b.losses])).toEqual([
      ["1", 3, 2, 1],
      ["2", 3, 1, 2],
      ["3", 3, 0, 2],
      ["4", 3, 1, 1],
    ]);
    // places 1,4,3,2,1,1,3,1,3,(none),1,4 → 24 / 11
    expect(d.avgPlace).toBeCloseTo(24 / 11);
    expect(d.damageTo).toEqual([
      { identity: "n:ben", name: "Ben", amount: 21 },
      { identity: "n:cy", name: "Cy", amount: 21 },
    ]);
    expect(d.damageFrom).toEqual([{ identity: "n:cy", name: "Cy", amount: 21 }]);
    expect(deckDetail(R, "d:none")).toBeNull();
    const ben = deckDetail(R, "x:n:ben|krenko")!;
    expect(ben.damageTo).toEqual([{ identity: "n:dee", name: "Dee", amount: 10 }]);
    expect(ben.damageFrom).toEqual([{ identity: ANA, name: "Ana", amount: 21 }]);
  });

  it("derives deck keys", () => {
    expect(deckKey({ deckId: "d1", commanders: [], identity: "n:a" })).toBe("d:d1");
    expect(deckKey({ deckName: " Elves ", commanders: [], identity: "n:a" })).toBe("x:n:a|elves");
    expect(deckKey({ commanders: ["Tymna", "Thrasios"], identity: "n:a" })).toBe(
      "x:n:a|tymna / thrasios",
    );
    expect(deckKey({ commanders: [], identity: "n:a" })).toBeNull();
  });
});

describe("insights (HIST-023)", () => {
  // @req HIST-023
  it("summary tiles: games, total time, average game", () => {
    // A 615 + B 155 + C 200 + D 80 = 1050 minutes
    expect(summary(R)).toEqual({
      games: 26,
      totalMs: 1050 * MIN,
      avgMs: Math.round((1050 * MIN) / 26),
    });
    expect(summary([])).toEqual({ games: 0, totalMs: 0, avgMs: null });
  });

  // @req HIST-023
  it("turn-order advantage: win % by starting position", () => {
    expect(turnOrderAdvantage(R)).toEqual([
      { position: 1, games: 23, wins: 15, pct: 15 / 23 },
      { position: 2, games: 23, wins: 4, pct: 4 / 23 },
      { position: 3, games: 16, wins: 1, pct: 1 / 16 },
      { position: 4, games: 14, wins: 3, pct: 3 / 14 },
    ]);
    const noPositions = R.slice(0, 1).map((r) => ({
      ...r,
      players: r.players.map(({ turnPosition: _t, ...p }) => p),
    }));
    expect(turnOrderAdvantage(noPositions)).toEqual([]);
  });

  // @req HIST-023
  it("durations: average, longest, shortest, turns and turn length", () => {
    expect(durations(R)).toEqual({
      avgMs: Math.round((1050 * MIN) / 26),
      longest: { id: "a9", ms: 80 * MIN },
      shortest: { id: "b8", ms: 15 * MIN },
      avgTurns: (30 + 28 + 36 + 20) / 4,
      // (500 + 600 + 1000 + 400) s in a4 + 8 × (600 + 900) s in B over 180 timed turns
      avgTurnMs: Math.round(14_500_000 / 180),
    });
    expect(durations([])).toEqual({
      avgMs: null,
      longest: null,
      shortest: null,
      avgTurns: null,
      avgTurnMs: null,
    });
  });

  it("win % by preset with the leading player", () => {
    expect(byPreset(R)).toEqual([
      {
        presetId: "mtg.commander",
        presetName: "Commander",
        games: 18,
        leader: { identity: "n:declan", name: "declan", wins: 1, winPct: 0.5 },
      },
      {
        presetId: "mtg.constructed",
        presetName: "Constructed",
        games: 8,
        leader: { identity: ANA, name: "Ana", wins: 4, winPct: 4 / 7 },
      },
    ]);
  });

  it("elimination causes breakdown", () => {
    expect(eliminationCauses(R).map((c) => [c.kind, c.count])).toEqual([
      ["life", 46],
      ["commander", 3],
      ["poison", 3],
      ["concede", 2],
      ["time", 1],
    ]);
    expect(eliminationCauses(R)[0]!.pct).toBeCloseTo(46 / 55);
  });

  it("first blood", () => {
    expect(firstBlood(R).map((f) => [f.name, f.count, f.games])).toEqual([
      ["Ben", 9, 26],
      ["Ana", 6, 24],
      ["Dee", 4, 12],
      ["Cy", 3, 14],
      ["declan", 1, 2],
    ]);
    expect(firstBlood(R, { includeDefaultNames: true })).toHaveLength(7);
  });

  it("commander damage leaderboard", () => {
    expect(commanderLeaderboard(R).map((c) => [c.name, c.total, c.games])).toEqual([
      ["Ana", 42, 2],
      ["Cy", 21, 1],
      ["Ben", 10, 1],
    ]);
  });

  it("clock stats: slowest, fastest, responses, timeouts", () => {
    const c = clockInsights(R);
    expect(c.rows.map((r) => [r.name, r.avgTurnMs, r.timedTurns])).toEqual([
      ["Ana", Math.round(5_300_000 / 85), 85],
      ["Ben", Math.round(7_800_000 / 85), 85],
      ["Cy", 200_000, 5],
      ["Dee", 80_000, 5],
    ]);
    expect(c.slowest?.name).toBe("Cy");
    expect(c.fastest?.name).toBe("Ana");
    expect(c.responder).toMatchObject({ name: "Ben", responseMs: 40_000, responses: 2 });
    // Cy and Ben each timed out once; the first by name wins the tie.
    expect(c.timeouts).toMatchObject({ name: "Ben", timeouts: 1 });
    const none = clockInsights(R.filter((r) => r.timerMode === "off" && r.id !== "a4"));
    expect(none).toEqual({
      rows: [],
      slowest: null,
      fastest: null,
      responder: null,
      timeouts: null,
    });
  });

  it("playgroups", () => {
    expect(playgroups(R).map((g) => [g.games, g.names.join(",")])).toEqual([
      [12, "Ben,Cy,Dee,Ana"],
      [8, "Ben,Ana"],
      [4, "Ben,Player 3,Player 4,Ana"],
      [2, "Ben,Cy,declan"],
    ]);
  });

  it("helpers", () => {
    expect(pct(0, 0)).toBeNull();
    expect(pct(1, 3)).toBe(0.25);
    expect(weightedTurnMs([])).toBeNull();
  });
});

describe("filter (HIST-024)", () => {
  // @req HIST-024
  it("filters by every dimension", () => {
    const ids = (list: GameRecord[]) => list.map((r) => r.id);
    expect(applyFilter(R, {})).toHaveLength(26);
    expect(applyFilter(R, { presetIds: ["mtg.constructed"] })).toHaveLength(8);
    expect(applyFilter(R, { playerCounts: [3] }).map((r) => r.id)).toEqual(["d1", "d2"]);
    expect(applyFilter(R, { identities: ["n:declan"] })).toHaveLength(2);
    expect(applyFilter(R, { identities: [ANA, "n:dee"] })).toHaveLength(12);
    expect(applyFilter(R, { decks: ["d:d-tox"] })).toHaveLength(12);
    expect(applyFilter(R, { startValues: [20] })).toHaveLength(8);
    expect(applyFilter(R, { timer: "on" })).toHaveLength(9);
    expect(applyFilter(R, { timer: "off" })).toHaveLength(17);
    expect(applyFilter(R, { winnerOnly: true })).toHaveLength(23);
    // Days 1..3 (endedAt = base + day): from inclusive, to exclusive.
    expect(ids(applyFilter(R, { from: FIXTURE_BASE + DAY, to: FIXTURE_BASE + 4 * DAY }))).toEqual([
      "a1",
      "a2",
      "a3",
    ]);
  });

  it("chips, clearing and the free-tier date-only filter", () => {
    const f = {
      from: 1,
      to: 2,
      presetIds: ["x"],
      playerCounts: [4],
      identities: ["n:a"],
      decks: ["d:1"],
      startValues: [40],
      timer: "on" as const,
      winnerOnly: true,
      includeDefaultNames: true,
    };
    expect(activeFilterKeys(f)).toEqual([
      "date",
      "presetIds",
      "playerCounts",
      "identities",
      "decks",
      "startValues",
      "timer",
      "winnerOnly",
      "includeDefaultNames",
    ]);
    expect(activeFilterKeys({ presetIds: [] })).toEqual([]);
    expect(clearFilterKey(f, "date")).not.toHaveProperty("from");
    expect(clearFilterKey(f, "timer")).not.toHaveProperty("timer");
    expect(freeTierFilter(f)).toEqual({ from: 1, to: 2, includeDefaultNames: true });
    expect(freeTierFilter({ presetIds: ["x"] })).toEqual({});
  });

  it("lists filter options from the records", () => {
    expect(filterOptions(R)).toEqual({
      presets: [
        { id: "mtg.commander", name: "Commander" },
        { id: "mtg.constructed", name: "Constructed" },
      ],
      playerCounts: [2, 3, 4],
      startValues: [20, 40],
    });
  });
});

describe("edge cases", () => {
  const base = R[0]!;
  type P = Partial<GameRecord["players"][number]>;
  /** A record built from a1 with per-player overrides. */
  function rec(id: string, endedAt: number, players: P[]): GameRecord {
    return {
      ...base,
      id,
      endedAt,
      playerCount: players.length,
      players: players.map((o, i) => ({ ...base.players[i]!, ...o })),
      commanderDamage: [],
      eliminations: [],
    };
  }

  it("deck rows track the latest name, art and commanders", () => {
    const art = { kind: "gradient" as const, value: "sunset" };
    const list = [
      rec("x1", 1, [
        { deckId: "dz", deckName: "Zed", identity: "n:z", name: "Zoe", commanders: [] },
        { deckId: "da", deckName: "Alpha", identity: "n:a", name: "Al", art },
      ]),
      rec("x2", 2, [
        { deckId: "dz", deckName: "Zed", identity: "n:z", name: "Zoey", commanders: ["Z"], art },
        { deckId: "da", deckName: "Alpha", identity: "n:a", name: "Al" },
      ]),
    ];
    const rows = deckRows(list);
    const zed = rows.find((r) => r.deckName === "Zed")!;
    expect(zed.playerName).toBe("Zoey");
    expect(zed.commanders).toEqual(["Z"]);
    expect(zed.art).toEqual(art);
    expect(rows.find((r) => r.deckName === "Alpha")!.art).toEqual(art);
  });

  it("deck detail ignores self damage and unknown seats", () => {
    const r = rec("x3", 1, [
      { deckId: "dz", deckName: "Zed", identity: "n:z", place: undefined, turnPosition: undefined },
      { identity: "n:a" },
    ]);
    const me = r.players[0]!.seatId;
    const d = deckDetail(
      [
        {
          ...r,
          commanderDamage: [
            { from: me, to: me, amount: 5 },
            { from: "ghost", to: me, amount: 3 },
            { from: me, to: "ghost", amount: 4 },
          ],
        },
      ],
      "d:dz",
    )!;
    expect(d.avgPlace).toBeNull();
    expect(d.byPosition).toEqual([]);
    expect(d.damageTo).toEqual([]);
    expect(d.damageFrom).toEqual([]);
  });

  it("player rows keep the latest non-empty name and sort ties by name", () => {
    const list = [
      rec("y1", 5, [
        { identity: "n:b", name: "Bo", winner: false },
        { identity: "n:a", name: "Al" },
      ]),
      rec("y2", 1, [
        { identity: "n:b", name: "Old", winner: false },
        { identity: "n:a", name: "  " },
      ]),
    ].map((r) => ({ ...r, outcome: "none" as const }));
    const rows = playerRows(list);
    expect(rows.map((r) => r.name)).toEqual(["Al", "Bo"]);
    expect(rows[0]!.winPct).toBeNull();
  });

  it("preset leaders break ties by wins then name; clock picks skip missing data", () => {
    const list = [
      rec("z1", 1, [
        { identity: "n:b", name: "Bo", winner: true },
        { identity: "n:a", name: "Al", winner: false },
      ]),
      rec("z2", 2, [
        { identity: "n:b", name: "Bo", winner: false },
        { identity: "n:a", name: "Al", winner: true },
      ]),
    ].map((r) => ({ ...r, outcome: "win" as const }));
    expect(byPreset(list)[0]!.leader?.name).toBe("Al");
    const empty = {
      usedMs: 0,
      turns: 0,
      timedTurns: 0,
      avgTurnMs: null,
      timeouts: 0,
      responseMs: 0,
      responses: 0,
    };
    const clocks = clockInsights([rec("c1", 1, [{ identity: "n:a", clock: empty }, {}])]);
    expect(clocks.rows).toHaveLength(1);
    expect(clocks.slowest).toBeNull();
    expect(firstBlood(list)).toEqual([]);
  });
});
