// @req TMR-060
/** Handicap / declare-blockers UI models: setup mapping, settings helpers, tile view, history. */
import { describe, expect, it } from "vitest";
import {
  createGame,
  defaultTimerConfig,
  reduce,
  remaining,
  seededRng,
  type Game,
  type GameAction,
} from "@/engine";
import { formatEventRow } from "@/features/history-current/format";
import { presetDefaultsFromDraft, draftFromGame } from "@/features/settings/draft";
import {
  moveSeat,
  setPlayers,
  setSeatClockExtra,
  setTimer,
  stateForPreset,
  toNewGameConfig,
} from "@/features/setup/setupModel";
import { getBuiltInPreset } from "@/presets";
import { presetDefaultsFromGame } from "@/state/presetDefaults";
import { MIN, SEC, isStructurePatch, parseTimerParams, seatTimerView } from "./model";
import {
  blockersSettings,
  compactExtra,
  extraFor,
  formatExtra,
  modeFamily,
  modePatch,
  seatTimeMs,
  seatTimeStep,
  seatTimesOn,
  seatTimesSummary,
} from "./seatTimes";

const commander = getBuiltInPreset("mtg.commander")!;
const pokemon = getBuiltInPreset("pokemon.standard")!;
const rng = seededRng(2);
const T0 = 1_700_000_000_000;

describe("seat times helpers", () => {
  it("families, steps, absolute ⇄ extra, summaries", () => {
    expect(modeFamily("bankDelay")).toBe("bank");
    expect(modeFamily("perTurnReserve")).toBe("turn");
    expect(modeFamily("countup")).toBeNull();
    expect(seatTimeStep("bank")).toBe(MIN);
    expect(seatTimeStep("perTurn")).toBe(15 * SEC);
    const cfg = defaultTimerConfig({ mode: "bank", bankMs: 20 * MIN });
    expect(seatTimesOn(cfg)).toBe(false);
    expect(seatTimeMs(cfg, 5 * MIN)).toBe(25 * MIN);
    expect(extraFor(cfg, 18 * MIN)).toBe(-2 * MIN);
    expect(compactExtra({ s1: 0, s2: MIN })).toEqual({ s2: MIN });
    expect(formatExtra(-MIN)).toBe("−1:00");
    expect(
      seatTimesSummary({ seatExtraMs: { s2: 5 * MIN } }, [
        { id: "s1", name: "Ana" },
        { id: "s2", name: "Ben" },
      ]),
    ).toBe("Ben +5:00");
    // A family change clears the extras; same family keeps them.
    const on = { ...cfg, seatExtraMs: { s1: MIN } };
    expect(modePatch(on, "perTurn")).toEqual({ mode: "perTurn", seatExtraMs: {} });
    expect(modePatch(on, "bankIncrement")).toEqual({ mode: "bankIncrement" });
    expect(modePatch(cfg, "perTurn")).toEqual({ mode: "perTurn" });
    expect(isStructurePatch({ seatExtraMs: {} })).toBe(true);
  });

  it("blockers settings defaults: on for MTG presets, off elsewhere; 30 s; wait", () => {
    expect(blockersSettings(commander.defaults.timer)).toEqual({
      on: true,
      seconds: 30,
      timeout: "wait",
    });
    expect(blockersSettings(pokemon.defaults.timer).on).toBe(false);
    expect(blockersSettings(defaultTimerConfig({ blockersMs: 45_000 })).seconds).toBe(45);
  });

  it("test URL params: blockers + seat extras", () => {
    const p = parseTimerParams(
      new URLSearchParams(
        "t.blockersWindow=1&t.blockersMs=20000&t.blockersTimeout=return&t.seatExtra=s2:300000,s3:-60000,bad",
      ),
    );
    expect(p).toMatchObject({
      blockersWindow: true,
      blockersMs: 20_000,
      blockersTimeout: "return",
      seatExtraMs: { s2: 300_000, s3: -60_000 },
    });
  });
});

describe("setup: different time per seat", () => {
  it("extras follow the seat through reorder and player-count changes; mapped to engine ids", () => {
    let s = stateForPreset(commander, undefined);
    s = setTimer(s, { mode: "bank", bankMs: 20 * MIN, seatExtraMs: {} });
    s = setSeatClockExtra(s, 2, 5 * MIN);
    s = moveSeat(s, 2, -1);
    expect(toNewGameConfig(s, commander).timer?.seatExtraMs).toEqual({ s2: 5 * MIN });
    s = setPlayers(s, commander, 2);
    expect(toNewGameConfig(s, commander).timer?.seatExtraMs).toEqual({ s2: 5 * MIN });
    const g = createGame(toNewGameConfig(s, commander), rng, T0);
    expect(remaining(g, "s1", T0)).toBe(20 * MIN);
    expect(remaining(g, "s2", T0)).toBe(25 * MIN);
    // 0 = the base time; the toggle off drops the map.
    s = setSeatClockExtra(s, 1, 0);
    expect(toNewGameConfig(s, commander).timer?.seatExtraMs).toEqual({});
    s = setSeatClockExtra(s, 1, MIN);
    s = setTimer(s, { seatExtraMs: undefined });
    expect(toNewGameConfig(s, commander).timer).not.toHaveProperty("seatExtraMs");
  });

  it("a mode family change clears the seats' extras", () => {
    let s = setTimer(stateForPreset(commander, undefined), { mode: "bank", seatExtraMs: {} });
    s = setSeatClockExtra(s, 0, MIN);
    s = setTimer(s, { mode: "bankIncrement" });
    expect(s.seats[0]!.clockExtraMs).toBe(MIN);
    s = setTimer(s, { mode: "perTurn" });
    expect(s.seats[0]!.clockExtraMs).toBeUndefined();
  });

  it("is never saved as a preset default", () => {
    let g = createGame(
      { preset: commander, players: 2, timer: { mode: "bank", seatExtraMs: { s1: MIN } } },
      rng,
      T0,
    );
    expect(presetDefaultsFromGame(g).timer).not.toHaveProperty("seatExtraMs");
    expect(presetDefaultsFromDraft(draftFromGame(g)).timer).not.toHaveProperty("seatExtraMs");
    const s = stateForPreset(commander, { timer: { seatExtraMs: { s1: MIN } } });
    expect(s.timer).not.toHaveProperty("seatExtraMs");
    g = reduce(g, { type: "RESET_GAME", now: T0 }, { rng });
    expect(remaining(g, "s1", T0)).toBe(commander.defaults.timer.bankMs + MIN);
  });
});

describe("tile view: declare blockers", () => {
  const play = (steps: Omit<GameAction, "now">[], timer = {}): Game => {
    let g = createGame(
      { preset: commander, players: 4, timer: { mode: "bank", ...timer } },
      rng,
      T0,
    );
    steps.forEach((a, i) => {
      g = reduce(g, { ...a, now: T0 + i * SEC } as GameAction, { rng });
    });
    return g;
  };

  it("Attack on the turn holder while running; Declared everywhere during the window", () => {
    const g = play([{ type: "START_GAME" }]);
    const a = g.turn.activeSeat;
    const other = g.seats.find((s) => s.id !== a)!.id;
    expect(seatTimerView(g, a)).toMatchObject({ canAttack: true, canPass: true });
    expect(seatTimerView(g, other)).toMatchObject({ canAttack: false, canDeclare: false });
    const w = reduce(g, { type: "TIMER_BLOCKERS_START", now: T0 + 5 * SEC }, { rng });
    expect(seatTimerView(w, a)).toMatchObject({
      canAttack: false,
      inWindow: true,
      canDeclare: true,
    });
    expect(seatTimerView(w, other)).toMatchObject({ canDeclare: true, canRespond: true });
    const r = reduce(w, { type: "TIMER_RESPOND", seatId: other, now: T0 + 6 * SEC }, { rng });
    expect(seatTimerView(r, a)).toMatchObject({ inWindow: true, canDeclare: false });
    // Off for presets/configs without the window; never while paused.
    expect(
      seatTimerView(play([{ type: "START_GAME" }], { blockersWindow: false }), a).canAttack,
    ).toBe(false);
    const p = reduce(g, { type: "TIMER_PAUSE", now: T0 + 5 * SEC }, { rng });
    expect(seatTimerView(p, a).canAttack).toBe(false);
  });

  it("history rows", () => {
    const g = play([{ type: "START_GAME" }]);
    const a = g.seats.find((s) => s.id === g.turn.activeSeat)!;
    const row = (meta: Record<string, string | number>) =>
      formatEventRow({ id: "e", at: T0, kind: "timer", seatId: a.id, meta }, g).label;
    expect(row({ action: "blockersStart", durationMs: 30_000 })).toBe(
      `⚔ ${a.name} attacked · 0:30 for blockers`,
    );
    expect(row({ action: "blockersEnd", reason: "declared", usedMs: 18_000 })).toBe(
      `${a.name} declared attackers · blockers 0:18`,
    );
    expect(row({ action: "blockersEnd", reason: "timeout", usedMs: 30_000 })).toBe(
      `Blockers time is up · clock back to ${a.name}`,
    );
    expect(row({ action: "blockersEnd", reason: "pass", usedMs: 4_000 })).toBe(
      "Blockers window closed · 0:04",
    );
    expect(row({ action: "blockersTimeUp" })).toBe("Blockers time is up");
  });
});
