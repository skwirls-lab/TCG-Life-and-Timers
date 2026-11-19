// Saved setups ("Presets"): snapshot from setup and from a running game, apply to a new game,
// missing profile/deck fallbacks, player limits. No PRD id of their own; nearest: PROF-010, SET-012.
// @req PROF-010 @req SET-012 @req TMR-060 @req PRE-013
import { describe, expect, it } from "vitest";
import { createGame, primaryCounter, seededRng, type Preset } from "@/engine";
import {
  applyProfile,
  setTimer,
  setSeatClockExtra,
  stateForPreset,
  toNewGameConfig,
  toggleCounter,
  updateSeat,
} from "@/features/setup/setupModel";
import type { Deck, PlayerProfile } from "@/lib/profiles/types";
import { SetupDraftSchema } from "@/lib/setups/types";
import { getBuiltInPreset } from "@/presets";
import {
  checkPlayers,
  configFromSetup,
  draftFromGame,
  draftFromSetupState,
  draftOf,
  draftsEqual,
  stateFromSetup,
  suggestSetupName,
  type SetupRefs,
} from "./model";
import { seatInitials } from "./initials";

const commander = getBuiltInPreset("mtg.commander")!;
const pokemon = getBuiltInPreset("pokemon.standard") ?? getBuiltInPreset("pokemon")!;

const NAMES = ["Ann Lee", "Ben", "Cid", "Dee"];
const profiles: PlayerProfile[] = NAMES.map((name, i) => ({
  id: `p${i}`,
  name,
  color: ["#f472b6", "#60a5fa", "#facc15", "#34d399"][i]!,
  contrast: false,
  ...(i === 1 ? { art: { kind: "solid" as const, value: "#111" } } : {}),
  updatedAt: 1,
}));
const decks: Deck[] = NAMES.map((name, i) => ({
  id: `d${i}`,
  profileId: `p${i}`,
  name: `${name}'s deck`,
  commanders: [`Commander ${i}`],
  ...(i === 0
    ? { art: { kind: "scryfall" as const, value: "https://cards.scryfall.io/a.jpg" } }
    : {}),
  updatedAt: 1,
}));
const refs = (ps = profiles, ds = decks): SetupRefs => ({
  profiles: new Map(ps.map((p) => [p.id, p])),
  decks: new Map(ds.map((d) => [d.id, d])),
});

/** The owner's pod: 4 players, 60 life, 21 poison, monarch on, bank + delay, per-seat time. */
function podState() {
  const primary = primaryCounter(commander);
  let s = stateForPreset(commander, {
    thresholdOverrides: { "mtg.poison": 21 },
    options: { autoKO: "prompt" },
  });
  s = { ...s, startValue: 60 };
  s = toggleCounter(s, "mtg.monarch", true);
  s = setTimer(s, { mode: "bankDelay", bankMs: 20 * 60_000, delayMs: 5000, seatExtraMs: {} });
  profiles.forEach((p, i) => {
    s = applyProfile(s, i, { profile: p, deck: decks[i] });
  });
  s = setSeatClockExtra(s, 2, 120_000);
  expect(primary.id).toBe("mtg.life");
  return s;
}

describe("snapshot from the setup wizard", () => {
  it("captures game type, house rules, clock, seats, profiles and decks; zod round trip", () => {
    const draft = draftFromSetupState(podState(), commander);
    expect(SetupDraftSchema.parse(JSON.parse(JSON.stringify(draft)))).toEqual(draft);
    expect(draft).toMatchObject({
      presetId: "mtg.commander",
      presetName: commander.name,
      firstPlayerRule: "random",
      commanderArt: true,
      config: {
        startOverrides: { "mtg.life": 60 },
        thresholdOverrides: { "mtg.poison": 21 },
        options: { autoKO: "prompt", turnTracking: true },
        timer: { mode: "bankDelay", bankMs: 1_200_000, delayMs: 5000, seatExtraMs: {} },
      },
    });
    expect(draft.config.enabledCounters).toContain("mtg.monarch");
    expect(draft.seats).toHaveLength(4);
    expect(draft.seats[0]).toEqual({
      name: "Ann Lee",
      color: "#f472b6",
      profileId: "p0",
      deckId: "d0",
      deckName: "Ann Lee's deck",
      commanders: ["Commander 0"],
    });
    // deck/profile art is re-derived at start, never stored
    expect(draft.seats[1]!.art).toBeUndefined();
    expect(draft.seats[2]!.clockExtraMs).toBe(120_000);
  });

  it("keeps art picked by hand and drops per-seat time when the clock has none", () => {
    let s = stateForPreset(commander, undefined);
    s = updateSeat(s, 0, { art: { kind: "solid", value: "#abc" }, clockExtraMs: 5000 });
    const draft = draftFromSetupState(s, commander);
    expect(draft.seats[0]!.art).toEqual({ kind: "solid", value: "#abc" });
    expect(draft.seats[0]!.clockExtraMs).toBeUndefined();
    expect(draft.config.timer?.seatExtraMs).toBeUndefined();
  });
});

describe("apply to a new game", () => {
  it("starts exactly the saved pod: seats, profiles, decks, per-seat time remap, rules, timers", () => {
    const draft = draftFromSetupState(podState(), commander);
    const cfg = configFromSetup(draft, commander, refs());
    const game = createGame(cfg, seededRng(1), 1);
    expect(game.seats.map((s) => s.name)).toEqual(NAMES);
    expect(game.seats.map((s) => s.deckId)).toEqual(["d0", "d1", "d2", "d3"]);
    expect(game.seats[0]!.art).toMatchObject({ origin: "deck" });
    expect(game.seats[1]!.art).toMatchObject({ origin: "profile", value: "#111" });
    expect(game.startOverrides).toEqual({ "mtg.life": 60 });
    expect(game.thresholdOverrides).toEqual({ "mtg.poison": 21 });
    expect(game.enabledCounters).toContain("mtg.monarch");
    expect(game.options.autoKO).toBe("prompt");
    expect(game.timer.config).toMatchObject({ mode: "bankDelay", delayMs: 5000 });
    expect(game.timer.config.seatExtraMs).toEqual({ s3: 120_000 });
  });

  it("re-keys per-seat values to the new seat ids after a seat is removed", () => {
    const draft = draftFromSetupState(podState(), commander);
    const three = { ...draft, seats: draft.seats.filter((_, i) => i !== 0) };
    const cfg = configFromSetup(three, commander, refs());
    expect(cfg.players).toBe(3);
    expect(cfg.timer?.seatExtraMs).toEqual({ s2: 120_000 });
  });

  it("the setup's config beats the game type's stored defaults (they're not consulted)", () => {
    const draft = draftFromSetupState(podState(), commander);
    const state = stateFromSetup(draft, commander, refs());
    expect(state.defaults?.thresholdOverrides).toEqual({ "mtg.poison": 21 });
    expect(state.defaults?.timer?.seatExtraMs).toBeUndefined();
    expect(state.timer.seatExtraMs).toEqual({});
    expect(toNewGameConfig(state, commander).options?.autoKO).toBe("prompt");
  });

  it("turning per-seat time off while editing sticks", () => {
    const draft = draftFromSetupState(podState(), commander);
    const state = setTimer(stateFromSetup(draft, commander, refs()), { seatExtraMs: undefined });
    expect(toNewGameConfig(state, commander).timer?.seatExtraMs).toBeUndefined();
  });

  it("commander art off and a first-player rule survive the round trip", () => {
    let s = stateForPreset(commander, undefined);
    s = { ...s, commanderArt: false, firstPlayerRule: "loser" };
    const cfg = configFromSetup(draftFromSetupState(s, commander), commander);
    expect(cfg.options).toMatchObject({ commanderArt: false, firstPlayerRule: "loser" });
  });

  it("opens at the requested wizard step", () => {
    const draft = draftFromSetupState(podState(), commander);
    expect(stateFromSetup(draft, commander, refs(), 2).step).toBe(2);
  });
});

describe("per-seat start and threshold (PRE-013)", () => {
  it("are stored on the seat and re-keyed at start", () => {
    const swu = getBuiltInPreset("swu.premier")!;
    const fab = getBuiltInPreset("fab.standard")!;
    let s = stateForPreset(swu, undefined);
    const limit = primaryCounter(swu).threshold!.value;
    s = updateSeat(s, 1, { threshold: limit + 5 });
    const draft = draftFromSetupState(s, swu);
    expect(draft.seats[1]!.threshold).toBe(limit + 5);
    const cfg = configFromSetup({ ...draft, seats: [draft.seats[1]!, draft.seats[0]!] }, swu);
    expect(cfg.perSeatThreshold).toEqual({ s1: { [primaryCounter(swu).id]: limit + 5 } });

    let f = stateForPreset(fab, undefined);
    const other = (fab.quickStartValues ?? []).find((v) => v !== primaryCounter(fab).start)!;
    f = updateSeat(f, 0, { start: other });
    const fd = draftFromSetupState(f, fab);
    expect(fd.seats[0]!.start).toBe(other);
    const game = createGame(configFromSetup(fd, fab), seededRng(6), 1);
    expect(game.perSeatStart).toEqual({ s1: { [primaryCounter(fab).id]: other } });
    expect(draftFromGame(game).seats[0]!.start).toBe(other);
  });
});

describe("missing references fall back to the stored seat", () => {
  const draft = () => draftFromSetupState(podState(), commander);

  it("a deleted profile keeps the stored name, colour and commanders", () => {
    const state = stateFromSetup(draft(), commander, refs(profiles.slice(1)));
    expect(state.seats[0]).toMatchObject({
      name: "Ann Lee",
      color: "#f472b6",
      commanders: ["Commander 0"],
    });
    expect(state.seats[0]!.profileId).toBeUndefined();
    expect(state.seats[0]!.deckId).toBeUndefined();
    expect(() => createGame(toNewGameConfig(state, commander), seededRng(5), 1)).not.toThrow();
  });

  it("a deleted deck keeps the profile and the stored commanders", () => {
    const state = stateFromSetup(draft(), commander, refs(profiles, decks.slice(1)));
    expect(state.seats[0]).toMatchObject({ profileId: "p0", commanders: ["Commander 0"] });
    expect(state.seats[0]!.deckId).toBeUndefined();
    expect(state.seats[0]!.deckName).toBeUndefined();
  });

  it("a renamed profile and an edited deck are picked up; the stored colour wins", () => {
    const renamed = profiles.map((p, i) => (i === 0 ? { ...p, name: "Annie", color: "#000" } : p));
    const edited = decks.map((d, i) => (i === 0 ? { ...d, commanders: ["Atraxa"] } : d));
    const state = stateFromSetup(draft(), commander, refs(renamed, edited));
    expect(state.seats[0]).toMatchObject({
      name: "Annie",
      color: "#f472b6",
      commanders: ["Atraxa"],
    });
  });

  it("a deck that now belongs to someone else is ignored", () => {
    const moved = decks.map((d, i) => (i === 0 ? { ...d, profileId: "p9" } : d));
    const state = stateFromSetup(draft(), commander, refs(profiles, moved));
    expect(state.seats[0]!.deckId).toBeUndefined();
  });

  it("name-only seats keep their names", () => {
    let s = stateForPreset(commander, undefined);
    s = updateSeat(s, 0, { name: "Guest" });
    const state = stateFromSetup(draftFromSetupState(s, commander), commander);
    expect(state.seats[0]!.name).toBe("Guest");
  });
});

describe("snapshot from a running game", () => {
  it("captures config and seats, and starts the same game again", () => {
    const cfg = configFromSetup(draftFromSetupState(podState(), commander), commander, refs());
    const game = createGame(cfg, seededRng(2), 1);
    const draft = draftFromGame(game);
    expect(draft.seats.map((s) => s.name)).toEqual(NAMES);
    expect(draft.seats[2]!.clockExtraMs).toBe(120_000);
    expect(draft.config.timer?.seatExtraMs).toEqual({});
    expect(draft.config).toMatchObject({
      startOverrides: { "mtg.life": 60 },
      thresholdOverrides: { "mtg.poison": 21 },
    });
    expect(draft.commanderArt).toBe(true);
    // deck art is derived, not stored
    expect(draft.seats[0]!.art).toBeUndefined();
    const again = createGame(configFromSetup(draft, game.preset, refs()), seededRng(3), 2);
    expect(again.timer.config.seatExtraMs).toEqual({ s3: 120_000 });
    expect(again.thresholdOverrides).toEqual({ "mtg.poison": 21 });
    expect(again.enabledCounters).toEqual(game.enabledCounters);
  });

  it("a non-commander game stores no commander-art option", () => {
    const game = createGame({ preset: pokemon, players: 2 }, seededRng(4), 1);
    const draft = draftFromGame(game);
    expect(draft.commanderArt).toBeUndefined();
    expect(draft.seats).toHaveLength(2);
  });
});

describe("helpers", () => {
  it("suggests '<first names> · <game type>' within 60 characters", () => {
    expect(suggestSetupName(["Ann Lee", "Ben", "", "Player 4"], "MTG Commander")).toBe(
      "Ann, Ben · MTG Commander",
    );
    expect(suggestSetupName(["", "Player 2"], "Pokémon")).toBe("Pokémon");
    const long = suggestSetupName(
      ["Alexandria", "Bartholomew", "Cornelius", "Dorothea", "Evangeline"],
      "MTG Commander",
    );
    expect(long.length).toBeLessThanOrEqual(60);
    expect(long.endsWith(" · MTG Commander")).toBe(true);
  });

  it("compares drafts and strips stored metadata", () => {
    const a = draftFromSetupState(podState(), commander);
    const b = draftFromSetupState(podState(), commander);
    expect(draftsEqual(a, b)).toBe(true);
    expect(draftsEqual(a, { ...a, seats: a.seats.slice(1) })).toBe(false);
    const stored = { ...a, id: "x", name: "n", order: 0, createdAt: 1, updatedAt: 1 };
    expect(draftOf(stored)).toEqual(a);
  });

  it("checks players against the game type and the Pro 7–8 rule", () => {
    const p: Preset = { ...commander, minPlayers: 2, maxPlayers: 8 };
    expect(checkPlayers(4, p, false)).toEqual({ ok: true });
    expect(checkPlayers(1, p, false)).toMatchObject({ ok: false, reason: "tooFew" });
    expect(checkPlayers(7, p, false)).toEqual({ ok: false, reason: "pro" });
    expect(checkPlayers(7, p, true)).toEqual({ ok: true });
    expect(checkPlayers(9, p, true)).toMatchObject({ ok: false, reason: "tooMany" });
  });

  it("makes seat initials", () => {
    expect(seatInitials("Jean-Paul Sartre", 0)).toBe("JS");
    expect(seatInitials("ann", 1)).toBe("A");
    expect(seatInitials("  ", 2)).toBe("3");
  });
});
