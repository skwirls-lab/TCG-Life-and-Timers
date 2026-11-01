import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { seededRng, type Game, type Preset } from "@/engine";
import { draftFromDefaults, draftFromGame, draftWithTimer } from "@/features/settings/draft";
import { visibleSettings, getSetting, type SettingsContext } from "@/features/settings/registry";
import { getBuiltInPreset } from "@/presets";
import { configureGameStore, resetGameStore, useGameStore } from "@/state/gameStore";
import { defaultAppSettings } from "@/state/settingsStore";
import { passTurn, restartClocks } from "./actions";
import { applyTimerPatch } from "./timerSettings";
import { useTimerSettingsUi } from "./timerSettingsUi";
import { presetWarnings } from "./warnings";

const commander = getBuiltInPreset("mtg.commander")!;
let now = 1_700_000_000_000;

function ctx(game: Game | null, pro = true, preset: Preset = commander): SettingsContext {
  return {
    preset,
    game,
    draft: game ? draftFromGame(game) : draftFromDefaults(preset, undefined),
    app: defaultAppSettings(),
    env: { haptics: true, fullscreen: true, standalone: false },
    can: () => pro,
    version: "0",
  };
}

const game = () => useGameStore.getState().session!.game;
const timerIds = (c: SettingsContext) =>
  visibleSettings("C", c)
    .map((r) => r.id)
    .filter((id) => id.startsWith("timer."));

beforeEach(() => {
  resetGameStore();
  configureGameStore({ now: () => now, rng: seededRng(5), autosaveMs: 1_000_000 });
  useGameStore.getState().newGame({ preset: commander, players: 4 });
  useTimerSettingsUi.getState().close();
});
afterEach(() => resetGameStore());

describe("settings section C (§13.1-C)", () => {
  // @req SET-010
  it("clocks off shows the mode row and the round timer (A-3), then rows by mode", () => {
    expect(timerIds(ctx(null))).toEqual(["timer.mode", "timer.match"]);
    expect(getSetting("timer.mode")!.disabledIf).toBeUndefined();
    expect(timerIds(ctx(game()))).toEqual(["timer.mode", "timer.match"]);
    // TMR-032: a match timer with per-seat clocks Off still shows/edits its extra turns.
    applyTimerPatch({ match: { totalMs: 50 * 60_000, extraTurns: 3 } });
    expect(timerIds(ctx(game()))).toEqual(["timer.mode", "timer.match", "timer.extraTurns"]);
    applyTimerPatch({ match: undefined });
    applyTimerPatch({ mode: "bankIncrement" });
    const ids = timerIds(ctx(game()));
    expect(ids).toEqual(
      expect.arrayContaining(["timer.bank", "timer.step", "timer.timeoutAction", "timer.grace"]),
    );
    expect(ids).not.toContain("timer.perTurn");
    expect(ids).not.toContain("timer.extraTurns");
    applyTimerPatch({ mode: "countup" });
    const cu = timerIds(ctx(game()));
    expect(cu).not.toContain("timer.timeoutAction");
    expect(cu).not.toContain("timer.warnings");
    expect(cu).toContain("timer.responses");
  });

  // @req SET-010
  it("rows read and write the game's timer config", () => {
    const set = (id: string, v: string | number | boolean) => {
      const def = getSetting(id)!;
      const change = def.set!(ctx(game()), v);
      if (change.kind !== "timer") throw new Error("timer change expected");
      applyTimerPatch(change.patch);
    };
    set("timer.mode", "perTurnReserve");
    expect(game().timer.config.mode).toBe("perTurnReserve");
    set("timer.bank", 15);
    expect(game().timer.config.reserveMs).toBe(15 * 60_000);
    expect(getSetting("timer.bank")!.get!(ctx(game()))).toBe(15);
    set("timer.perTurn", 120_000);
    expect(game().timer.config.perTurnMs).toBe(120_000);
    set("timer.mode", "bankDelay");
    set("timer.step", 5);
    expect(game().timer.config.delayMs).toBe(5000);
    set("timer.match", 40);
    set("timer.extraTurns", 4);
    expect(game().timer.config.match).toEqual({ totalMs: 40 * 60_000, extraTurns: 4 });
    expect(timerIds(ctx(game()))).toContain("timer.extraTurns");
    set("timer.match", 0);
    expect(game().timer.config.match).toBeUndefined();
    set("timer.timeoutAction", "grace");
    set("timer.grace", 30_000);
    expect(game().timer.config.graceMs).toBe(30_000);
    applyTimerPatch(presetWarnings([]));
    expect(getSetting("timer.warnings")!.control).toEqual({ kind: "subpage", page: "warnings" });
    expect(game().timer.config.warningsMs).toEqual([]);
    set("timer.showTenths", false);
    set("timer.autoPauseBackground", false);
    expect(game().timer.config).toMatchObject({ showTenths: false, autoPauseBackground: false });
    // Custom values open the keypad instead of patching.
    set("timer.bank", "custom");
    expect(useTimerSettingsUi.getState().custom).toBe("bankMs");
    expect(getSetting("timer.bank")!.get!(ctx(game()))).toBe(25); // commander preset default
  });

  // @req SET-010
  it("advanced modes are locked without timerAdvancedModes", () => {
    const def = getSetting("timer.mode")!;
    if (def.control.kind !== "select") throw new Error("select expected");
    const opts = def.control.options(ctx(game(), false));
    expect(opts.find((o) => o.value === "bankIncrement")).toMatchObject({ locked: true });
    expect(opts.find((o) => o.value === "bank")?.locked).toBe(false);
    expect(def.control.options(ctx(game(), true)).some((o) => o.locked)).toBe(false);
  });

  // @req TMR-022
  it("structure changes after START ask to restart the clocks; restart resets to idle", () => {
    applyTimerPatch({ mode: "bank", bankMs: 600_000 });
    useGameStore.getState().dispatch({ type: "START_GAME" });
    now += 10_000;
    applyTimerPatch({ passMode: "hold" });
    expect(game().timer.config.passMode).toBe("hold");
    applyTimerPatch({ mode: "perTurn" });
    expect(game().timer.config.mode).toBe("bank");
    expect(useTimerSettingsUi.getState().restart).toEqual({ mode: "perTurn" });
    restartClocks({ mode: "perTurn" });
    expect(game().timer).toMatchObject({ status: "idle", mode: "perTurn" });
    expect(game().options.turnTracking).toBe(true);
  });
});

describe("next-game timer defaults (no active game)", () => {
  // @req SET-012 @req SET-010
  it("rows edit the next game's draft timer and show rows by its mode", () => {
    const base = ctx(null);
    const change = getSetting("timer.mode")!.set!(base, "bank");
    expect(change).toEqual({ kind: "timer", patch: { mode: "bank" } });
    const draft = draftWithTimer(base.draft, { mode: "bank" });
    expect(draft.options.turnTracking).toBe(true);
    const next: SettingsContext = { ...base, draft };
    expect(timerIds(next)).toEqual(expect.arrayContaining(["timer.bank", "timer.timeoutAction"]));
    expect(getSetting("timer.bank")!.set!(next, 20)).toEqual({
      kind: "timer",
      patch: { bankMs: 20 * 60_000 },
    });
    // The custom keypad: no patch from the row itself.
    expect(getSetting("timer.bank")!.set!(next, "custom")).toEqual({ kind: "timer", patch: {} });
    // Turning the match timer off drops the key.
    const withMatch = draftWithTimer(draft, { match: { totalMs: 50 * 60_000, extraTurns: 3 } });
    expect(withMatch.timer.match).toEqual({ totalMs: 50 * 60_000, extraTurns: 3 });
    expect("match" in draftWithTimer(withMatch, { match: undefined }).timer).toBe(false);
    // Mode off keeps turn tracking as it was.
    expect(draftWithTimer(base.draft, { mode: "off" }).options).toBe(base.draft.options);
  });
});

describe("passTurn", () => {
  // @req TMR-003 @req TMR-004
  it("passes and undoes back to the exact pre-pass state", () => {
    applyTimerPatch({ mode: "bank", bankMs: 600_000 });
    useGameStore.getState().dispatch({ type: "START_GAME" });
    const first = game().turn.activeSeat;
    now += 5000;
    const r = passTurn()!;
    expect(game().turn.activeSeat).not.toBe(first);
    expect(r.nextName).toBe(game().seats.find((s) => s.id === game().turn.activeSeat)!.name);
    now += 1000;
    useGameStore.getState().dispatch({ type: "TIMER_RESPOND", seatId: first });
    r.undo();
    expect(game().turn.activeSeat).toBe(first);
    expect(game().timer.holder).toBe(first);
    expect(game().timer.responseStack).toEqual([]);
  });

  it("returns null when nothing happens", () => {
    useGameStore.setState({ session: null });
    expect(passTurn()).toBeNull();
  });
});
