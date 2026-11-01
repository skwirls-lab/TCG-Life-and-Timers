// @req HIST-001 @req HIST-002 @req HIST-010 @req HIST-011 @req HIST-012 @req HIST-013
import { describe, expect, it } from "vitest";
import {
  createGame,
  createSession,
  reduceSession,
  seededRng,
  type Game,
  type GameAction,
  type GameSession,
} from "@/engine";
import { commander } from "@/presets/mtg/presets";
import type { ActionInput } from "@/state/gameStore";
import {
  categoryTone,
  eventSeats,
  eventsFrom,
  filterGroups,
  formatDelta,
  formatDuration,
  formatEventRow,
  formatRelativeStart,
  groupEvents,
  headerView,
  lifeChartData,
  niceTicks,
  seatName,
  shortGameId,
  stepPath,
  undoneEvents,
} from "./format";

const T0 = Date.UTC(2026, 10, 1, 15, 0, 0);
const rng = seededRng(7);
const LIFE = "mtg.life";
const CMD = "mtg.cmdDamage";

function pod(options: Partial<Game["options"]> = {}): GameSession {
  const seats = ["Conner", "Josh", "JP", "Bethany"].map((name) => ({
    id: name.toLowerCase(),
    name,
    commanders: name === "Conner" ? ["Atraxa"] : [],
  }));
  return createSession(createGame({ preset: commander, seats, options }, seededRng(1), T0));
}

let clock = T0;
function play(s: GameSession, ...actions: ActionInput[]): GameSession {
  return actions.reduce((acc, a) => {
    clock += 5000;
    return reduceSession(acc, { ...a, now: clock } as GameAction, { rng });
  }, s);
}

const byKind = (g: Game, kind: string) => g.log.filter((e) => e.kind === kind);

describe("formatEventRow", () => {
  it("life loss: seat name, heart icon, red chip, → value", () => {
    const s = play(pod(), { type: "COUNTER_ADD", counterId: LIFE, seatId: "josh", delta: -3 });
    const ev = byKind(s.game, "counter")[0]!;
    const row = formatEventRow(ev, s.game);
    expect(row).toMatchObject({
      label: "Josh",
      icon: "heart",
      chip: { text: "−3", tone: "loss" },
      value: "→ 37",
      seatId: "josh",
      variant: "counter",
    });
    expect(row.color).toMatch(/^#/);
  });

  it("commander damage reads Source → Target with an orange chip; linked life row grouped", () => {
    const s = play(pod(), {
      type: "CMD_DAMAGE_ADD",
      targetSeatId: "jp",
      sourceSeatId: "conner",
      sourceIndex: 0,
      delta: 5,
    });
    const groups = groupEvents(s.game.log);
    const g = groups.find((x) => x.event.counterId === CMD)!;
    expect(g.linked).toHaveLength(1);
    const main = formatEventRow(g.event, s.game);
    const life = formatEventRow(g.linked[0]!, s.game);
    expect(main).toMatchObject({ label: "Conner → JP", icon: "commander", value: "→ 5" });
    expect(main.chip).toEqual({ text: "+5", tone: "commander" });
    expect(life).toMatchObject({ label: "JP", chip: { text: "−5", tone: "loss" }, value: "→ 35" });
    expect(groups.some((x) => x.event.id === g.linked[0]!.id)).toBe(false);
  });

  it("life gain is green, poison purple, other counters neutral", () => {
    expect(categoryTone("life", 2)).toBe("gain");
    expect(categoryTone("life", -2)).toBe("loss");
    expect(categoryTone("poison", 1)).toBe("poison");
    expect(categoryTone("commander", 1)).toBe("commander");
    expect(categoryTone("resource", 1)).toBe("neutral");
    expect(categoryTone(undefined, 1)).toBe("neutral");
    const s = play(pod(), { type: "COUNTER_ADD", counterId: "mtg.poison", seatId: "jp", delta: 2 });
    const row = formatEventRow(byKind(s.game, "counter")[0]!, s.game);
    expect(row.chip).toEqual({ text: "+2", tone: "poison" });
    expect(row.icon).toBe("poison");
  });

  it("inline events: dice, coin, random, note, turn, elimination with cause", () => {
    let s = play(
      pod({ turnTracking: true }),
      { type: "LOG_NOTE", kind: "dice", meta: { sides: 20, count: 1, values: "14", total: 14 } },
      { type: "LOG_NOTE", kind: "dice", meta: { sides: 6, count: 3, values: "2,5,6", total: 13 } },
      { type: "LOG_NOTE", kind: "coin", meta: { mode: "flip", flips: "H", heads: 1 } },
      { type: "LOG_NOTE", kind: "coin", meta: { mode: "flip", flips: "HTT", heads: 1 } },
      { type: "LOG_NOTE", kind: "coin", meta: { mode: "untilTails", flips: "HHT", heads: 2 } },
      {
        type: "LOG_NOTE",
        kind: "random",
        seatId: "jp",
        meta: { mode: "opponent", chooserSeatId: "jp", resultSeatId: "josh" },
      },
      {
        type: "LOG_NOTE",
        kind: "random",
        seatId: "josh",
        meta: { mode: "player", resultSeatId: "josh" },
      },
      { type: "LOG_NOTE", kind: "note", text: "hello" },
      { type: "START_GAME" },
      { type: "PASS_TURN" },
      { type: "COUNTER_ADD", counterId: LIFE, seatId: "josh", delta: -40 },
    );
    const rows = s.game.log.map((e) => formatEventRow(e, s.game));
    const labels = rows.map((r) => r.label);
    expect(labels).toContain("Rolled d20: 14");
    expect(labels).toContain("Rolled 3d6: 2 + 5 + 6 = 13");
    expect(labels).toContain("Coin: heads");
    expect(labels).toContain("Flipped 3 coins: 1 heads");
    expect(labels).toContain("Flip until tails: 2 heads");
    expect(labels).toContain("JP's random opponent: Josh");
    expect(labels).toContain("Random player: Josh");
    expect(labels).toContain("Note: hello");
    expect(labels.some((l) => /^Turn 2 → /.test(l))).toBe(true);
    expect(labels).toContain("Josh eliminated · 0 Life");
    const turnRow = rows.find((r) => r.kind === "turn")!;
    expect(turnRow.tone).toBe("timer");
    expect(rows.find((r) => r.kind === "random" && r.label.startsWith("JP"))!.seatId).toBe("josh");
    s = play(s, { type: "REVIVE", seatId: "josh" });
    expect(formatEventRow(s.game.log.at(-1)!, s.game).label).toBe("Josh revived");
  });

  it("commander-damage elimination names the source and commander; concede; game end", () => {
    let s = play(pod(), {
      type: "CMD_DAMAGE_ADD",
      targetSeatId: "jp",
      sourceSeatId: "conner",
      sourceIndex: 0,
      delta: 21,
    });
    const elim = byKind(s.game, "eliminate")[0]!;
    expect(formatEventRow(elim, s.game).label).toBe(
      "JP eliminated · 21 Commander damage from Conner (Atraxa)",
    );
    s = play(s, { type: "CONCEDE", seatId: "josh" }, { type: "CONCEDE", seatId: "bethany" });
    const labels = s.game.log.map((e) => formatEventRow(e, s.game).label);
    expect(labels).toContain("Josh conceded · Conceded");
    expect(labels).toContain("Game over · Conner won");
  });

  it("tokens, enum and boolean counters", () => {
    const s = play(
      pod(),
      { type: "COUNTER_ENABLE", counterId: "mtg.monarch", enabled: true },
      { type: "TOKEN_GIVE", counterId: "mtg.monarch", seatId: "jp" },
      { type: "TOKEN_CLEAR", counterId: "mtg.monarch" },
      { type: "ENUM_NEXT", counterId: "mtg.dayNight" },
    );
    const labels = s.game.log.map((e) => formatEventRow(e, s.game));
    expect(labels.find((r) => r.kind === "token" && r.seatId)?.label).toMatch(/→ JP$/);
    expect(labels.find((r) => r.kind === "token" && !r.seatId)?.label).toMatch(/cleared$/);
    const dn = labels.find((r) => r.kind === "counter" && r.icon === "daynight");
    if (dn) expect(dn.value).toMatch(/^→ /);
  });

  it("unknown seats and events degrade gracefully", () => {
    const s = pod();
    expect(seatName(s.game, "ghost")).toBe("Removed player");
    expect(seatName(s.game, undefined)).toBe("Removed player");
    const row = formatEventRow(
      { id: "x", at: T0, kind: "timer", meta: { action: "pause" } },
      s.game,
    );
    expect(row).toMatchObject({ label: "Clocks paused", tone: "timer", variant: "event" });
    const seatEv = formatEventRow(
      { id: "y", at: T0, kind: "seatRemove", seatId: "ghost", meta: { name: "Zed" } },
      s.game,
    );
    expect(seatEv.label).toBe("Zed left the table");
  });
});

describe("grouping, filters, undo", () => {
  it("groups newest first and filters by seat (source or target)", () => {
    const s = play(
      pod(),
      { type: "COUNTER_ADD", counterId: LIFE, seatId: "josh", delta: -3 },
      {
        type: "CMD_DAMAGE_ADD",
        targetSeatId: "jp",
        sourceSeatId: "conner",
        sourceIndex: 0,
        delta: 5,
      },
    );
    const groups = groupEvents(s.game.log);
    expect(groups[0]!.event.counterId).toBe(CMD);
    expect(filterGroups(groups, "conner").map((g) => g.event.counterId)).toContain(CMD);
    expect(filterGroups(groups, "josh").some((g) => g.event.counterId === CMD)).toBe(false);
    expect(filterGroups(groups, null)).toHaveLength(groups.length);
    expect(
      eventSeats({ id: "a", at: 0, kind: "token", meta: { from: "a", to: "b" } }).sort(),
    ).toEqual(["a", "b"]);
  });

  it("undone events come from session.future (D-027) and eventsFrom counts later events", () => {
    let s = play(
      pod(),
      { type: "COUNTER_ADD", counterId: LIFE, seatId: "josh", delta: -3 },
      { type: "COUNTER_ADD", counterId: LIFE, seatId: "jp", delta: -2 },
    );
    expect(undoneEvents(s)).toEqual([]);
    const first = byKind(s.game, "counter")[0]!;
    expect(eventsFrom(s.game, first.id)).toBe(2);
    expect(eventsFrom(s.game, "nope")).toBe(0);
    s = play(s, { type: "UNDO_TO", eventId: first.id });
    expect(byKind(s.game, "counter")).toHaveLength(0);
    expect(undoneEvents(s).map((e) => e.seatId)).toEqual(["jp", "josh"]);
  });
});

describe("header and time formatting", () => {
  it("header card fields", () => {
    const s = pod();
    const h = headerView(s.game);
    expect(h.title).toMatch(/^Game [A-Z0-9]{1,4}$/);
    expect(h.players).toBe("4 players");
    expect(h.startValue).toBe("Starting Life 40");
    expect(h.presetName).toBe(commander.name);
    expect(h.startedAt).toBe(T0);
    expect(shortGameId("abc-def12")).toBe("EF12");
  });
  it("durations and relative dates", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(61_000)).toBe("1:01");
    expect(formatDuration(3_723_000)).toBe("1:02:03");
    expect(formatDuration(-5)).toBe("0:00");
    const now = new Date(2026, 10, 2, 12, 0).getTime();
    expect(formatRelativeStart(new Date(2026, 10, 2, 10, 5).getTime(), now)).toMatch(
      /^Today at 10:05/,
    );
    expect(formatRelativeStart(new Date(2026, 10, 1, 10, 5).getTime(), now)).toMatch(
      /^Yesterday at 10:05/,
    );
    expect(formatRelativeStart(new Date(2026, 9, 20, 10, 5).getTime(), now)).toMatch(/Oct 20/);
    expect(formatDelta(-4)).toBe("−4");
    expect(formatDelta(0)).toBe("+0");
  });
});

describe("life chart", () => {
  it("one series per seat with steps and an elimination marker (time axis)", () => {
    const s = play(
      pod(),
      { type: "COUNTER_ADD", counterId: LIFE, seatId: "josh", delta: -3 },
      { type: "COUNTER_ADD", counterId: LIFE, seatId: "josh", delta: -37 },
    );
    const d = lifeChartData(s.game, clock + 60_000);
    expect(d.axis).toBe("time");
    expect(d.series).toHaveLength(4);
    const josh = d.series.find((x) => x.seatId === "josh")!;
    expect(josh.points[0]).toEqual({ x: 0, y: 40 });
    expect(josh.points.at(-1)!.y).toBe(0);
    expect(josh.eliminatedAt).toBeDefined();
    expect(d.yMin).toBe(0);
    expect(d.yMax).toBe(40);
    const jp = d.series.find((x) => x.seatId === "jp")!;
    expect(jp.points).toHaveLength(2);
    expect(jp.points[1]!.x).toBeCloseTo(d.xMax);
  });

  it("uses turns as x when turn tracking is on", () => {
    const s = play(
      pod({ turnTracking: true }),
      { type: "START_GAME" },
      { type: "PASS_TURN" },
      { type: "COUNTER_ADD", counterId: LIFE, seatId: "jp", delta: -4 },
      { type: "PASS_TURN" },
    );
    const d = lifeChartData(s.game, clock);
    expect(d.axis).toBe("turn");
    expect(d.xMin).toBe(1);
    expect(d.xMax).toBe(3);
    const jp = d.series.find((x) => x.seatId === "jp")!;
    expect(jp.points).toContainEqual({ x: 2, y: 36 });
  });

  it("stepPath and niceTicks", () => {
    const p = stepPath(
      [
        { x: 0, y: 40 },
        { x: 1, y: 30 },
      ],
      (x) => x * 10,
      (y) => 100 - y,
    );
    expect(p).toBe("M0,60 H10 V70");
    expect(
      stepPath(
        [],
        (x) => x,
        (y) => y,
      ),
    ).toBe("");
    expect(niceTicks(0, 40)).toEqual([0, 10, 20, 30, 40]);
    expect(niceTicks(5, 5)).toEqual([5]);
    expect(niceTicks(0, 1, 4)).toEqual([0, 0.5, 1]);
  });
});
