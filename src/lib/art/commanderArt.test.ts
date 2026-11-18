// @req PROF-010 @req ART-008
import { describe, expect, it, vi } from "vitest";
import {
  reduce,
  seededRng,
  type ArtRef,
  type Game,
  type GameAction,
  type SeatAction,
} from "@/engine";
import type { ScryfallCard } from "@/lib/scryfall";
import { ScryfallError } from "@/lib/scryfall";
import { selectionToSeatActions } from "@/lib/profiles/apply";
import { getBuiltInPreset } from "@/presets";
import { newGame } from "../../../tests/unit/helpers/engine";
import { COMMANDER_CARDS, commanderNamed } from "../../../tests/fixtures/scryfall/commanders";
import delver from "../../../tests/fixtures/scryfall/search-delver-transform.json";
import {
  COMMANDER_FOCAL,
  artRank,
  canReplaceArt,
  commanderArtEnabled,
  commanderArtFromCard,
  commanderKey,
  deckArtForCommander,
  resolveCommanderArt,
  seatsNeedingCommanderArt,
  showsCommanderArt,
  stillNeedsCommanderArt,
  storedArt,
  withOrigin,
} from "./commanderArt";
import { createCommanderArtRunner } from "./commanderArtRunner";

const commander = getBuiltInPreset("mtg.commander")!;
const constructed = getBuiltInPreset("mtg.constructed")!;
const card = (name: string) => commanderNamed(name) as unknown as ScryfallCard;
const atraxa = card("Atraxa, Praetors' Voice");
const kenrith = card("Kenrith, the Returned King");

const byHand: ArtRef = { kind: "gradient", value: "linear-gradient(red, blue)" };
const deckArt: ArtRef = { kind: "solid", value: "#123456", origin: "deck" };
const profileArt: ArtRef = { kind: "solid", value: "#654321", origin: "profile" };
const atraxaArt = withOrigin(commanderArtFromCard(atraxa)!, "commander");

function cmdGame(seats: { name: string; commanders?: string[]; art?: ArtRef }[], cfg = {}): Game {
  return newGame({
    preset: commander,
    seats: seats.map((s, i) => ({ id: `s${i + 1}`, ...s })),
    ...cfg,
  });
}

function apply(game: Game, actions: readonly (GameAction | SeatAction)[]): Game {
  let g = game;
  for (const a of actions) g = reduce(g, { ...a, now: 1 } as GameAction, { rng: seededRng(1) });
  return g;
}

describe("background precedence (PROF-010)", () => {
  // @req PROF-010
  it("ranks by hand > deck > commander > profile > none", () => {
    expect(artRank(byHand)).toBeGreaterThan(artRank(deckArt));
    expect(artRank(deckArt)).toBeGreaterThan(artRank(atraxaArt));
    expect(artRank(atraxaArt)).toBeGreaterThan(artRank(profileArt));
    expect(artRank(profileArt)).toBeGreaterThan(artRank(undefined));
  });

  it("lets automatic art replace only weaker (or equal) sources", () => {
    expect(canReplaceArt(undefined, "commander")).toBe(true);
    expect(canReplaceArt(profileArt, "commander")).toBe(true);
    expect(canReplaceArt(atraxaArt, "commander")).toBe(true);
    expect(canReplaceArt(deckArt, "commander")).toBe(false);
    expect(canReplaceArt(byHand, "commander")).toBe(false);
    expect(canReplaceArt(byHand, "deck")).toBe(false);
    expect(canReplaceArt(profileArt, "deck")).toBe(true);
    expect(canReplaceArt(deckArt, "profile")).toBe(false);
  });

  it("strips the seat-only origin for profiles/decks", () => {
    expect(storedArt(undefined)).toBeUndefined();
    expect(storedArt(deckArt)).toEqual({ kind: "solid", value: "#123456" });
    expect(storedArt(byHand)).toEqual(byHand);
  });

  // @req PROF-010
  it("loading a profile + deck tags deck art over profile art", () => {
    const profile = {
      id: "p",
      name: "JP",
      color: "#fff",
      contrast: false,
      art: storedArt(profileArt)!,
      updatedAt: 1,
    };
    const deck = {
      id: "d",
      profileId: "p",
      name: "Atraxa",
      commanders: ["Atraxa, Praetors' Voice"],
      art: storedArt(deckArt)!,
      updatedAt: 1,
    };
    const withDeck = apply(cmdGame([{ name: "A" }, { name: "B" }]), [
      ...selectionToSeatActions("s1", { profile, deck }),
    ]);
    expect(withDeck.seats[0]!.art).toEqual(deckArt);
    const profileOnly = apply(withDeck, selectionToSeatActions("s2", { profile }));
    expect(profileOnly.seats[1]!.art).toEqual(profileArt);
    // a new selection without art clears automatic art left by the previous one
    const noArt = { ...profile, art: undefined };
    expect(selectionToSeatActions("s1", { profile: noArt }, withDeck.seats[0])).toContainEqual({
      type: "SEAT_SET_ART",
      seatId: "s1",
    });
    expect(
      selectionToSeatActions("s1", { profile: noArt }, { art: byHand }).some(
        (a) => a.type === "SEAT_SET_ART",
      ),
    ).toBe(false);
  });
});

describe("commander art helpers (ART-008)", () => {
  it("is on for commander presets unless turned off, never for others", () => {
    const g = cmdGame([{ name: "A" }]);
    expect(commanderArtEnabled(g)).toBe(true);
    expect(commanderArtEnabled({ ...g, options: { ...g.options, commanderArt: false } })).toBe(
      false,
    );
    const c = newGame({ preset: constructed, seats: [{ name: "A" }, { name: "B" }] });
    expect(commanderArtEnabled({ ...c, options: { ...c.options, commanderArt: true } })).toBe(
      false,
    );
  });

  it("compares commander names by front face, case-insensitively", () => {
    expect(commanderKey(" Delver of Secrets // Insectile Aberration ")).toBe("delver of secrets");
    expect(showsCommanderArt(atraxaArt, "atraxa, praetors' voice")).toBe(true);
    expect(showsCommanderArt(atraxaArt, "Kenrith, the Returned King")).toBe(false);
    expect(showsCommanderArt(undefined, "x")).toBe(false);
  });

  it("builds the default-print art with the commander focal point", () => {
    const art = commanderArtFromCard(atraxa)!;
    expect(art).toMatchObject({
      kind: "scryfall",
      value: (atraxa.image_uris as { art_crop: string }).art_crop,
      cardName: "Atraxa, Praetors' Voice",
      artist: "Victor Adame Minguez",
      focal: COMMANDER_FOCAL,
    });
    // a multi-faced card uses its front face
    const front = commanderArtFromCard(delver.data[0] as unknown as ScryfallCard)!;
    expect(front.cardName).toBe("Delver of Secrets");
    expect(commanderArtFromCard({ ...atraxa, image_uris: {} })).toBeUndefined();
  });

  it("resolves a commander through the client and rejects cards without art", async () => {
    const cardNamed = vi.fn(async (name: string) => card(name));
    expect(await resolveCommanderArt("Kenrith, the Returned King", { cardNamed })).toMatchObject({
      cardName: "Kenrith, the Returned King",
    });
    const ctrl = new AbortController();
    await resolveCommanderArt("Atraxa, Praetors' Voice", { cardNamed }, { signal: ctrl.signal });
    expect(cardNamed).toHaveBeenLastCalledWith("Atraxa, Praetors' Voice", { signal: ctrl.signal });
    await expect(
      resolveCommanderArt("x", { cardNamed: async () => ({ ...atraxa, image_uris: {} }) }),
    ).rejects.toThrow();
  });

  // @req PROF-010
  it("defaults an art-less deck's background to its first commander", () => {
    const fromAtraxa = deckArtForCommander(undefined, false, atraxa);
    expect(fromAtraxa?.cardName).toBe("Atraxa, Praetors' Voice");
    expect(fromAtraxa?.origin).toBeUndefined();
    // re-picking replaces art that was itself filled in from a commander…
    expect(deckArtForCommander(fromAtraxa, true, kenrith)?.cardName).toBe(
      "Kenrith, the Returned King",
    );
    // …but never art the user chose
    expect(deckArtForCommander(byHand, false, kenrith)).toBe(byHand);
    expect(deckArtForCommander(byHand, true, { ...kenrith, image_uris: {} })).toBe(byHand);
  });
});

describe("seats needing commander art", () => {
  const placeholders = ["Commander 1", "Commander 2"];

  it("selects seats with a real commander and weaker art", () => {
    const g = cmdGame([
      { name: "none", commanders: ["Atraxa, Praetors' Voice"] },
      { name: "profile", commanders: ["Kenrith, the Returned King"], art: profileArt },
      { name: "deck", commanders: ["Edgar Markov"], art: deckArt },
      { name: "hand", commanders: ["Yuriko, the Tiger's Shadow"], art: byHand },
      { name: "done", commanders: ["Atraxa, Praetors' Voice"], art: atraxaArt },
      { name: "placeholder", commanders: ["Commander 1", "Tymna the Weaver"] },
      { name: "no commander" },
    ]);
    expect(seatsNeedingCommanderArt(g, placeholders)).toEqual([
      { seatId: "s1", name: "Atraxa, Praetors' Voice" },
      { seatId: "s2", name: "Kenrith, the Returned King" },
      { seatId: "s6", name: "Tymna the Weaver" },
    ]);
    const off = { ...g, options: { ...g.options, commanderArt: false } };
    expect(seatsNeedingCommanderArt(off, placeholders)).toEqual([]);
    expect(stillNeedsCommanderArt(g, { seatId: "s1", name: "atraxa, praetors' voice" })).toBe(true);
    expect(stillNeedsCommanderArt(g, { seatId: "s4", name: "Yuriko, the Tiger's Shadow" })).toBe(
      false,
    );
  });

  it("re-selects a seat whose commander changed after it got commander art", () => {
    const g = cmdGame([{ name: "A", commanders: ["Kenrith, the Returned King"], art: atraxaArt }]);
    expect(seatsNeedingCommanderArt(g)).toEqual([
      { seatId: "s1", name: "Kenrith, the Returned King" },
    ]);
  });
});

describe("automatic commander art runner (game start + mid-game)", () => {
  function harness(game: Game, resolve?: (name: string) => Promise<ArtRef>) {
    const state = { game };
    const applied: string[] = [];
    const runner = createCommanderArtRunner({
      getGame: () => state.game,
      apply: (seatId, art) => {
        applied.push(`${seatId}:${art.cardName}`);
        state.game = apply(state.game, [{ type: "SEAT_SET_ART", seatId, art }]);
      },
      resolve:
        resolve ??
        (async (name) => {
          const c = commanderNamed(name);
          if (!c) throw new ScryfallError({ status: 404, code: "not_found", details: name });
          return commanderArtFromCard(c as unknown as ScryfallCard)!;
        }),
      placeholders: ["Commander 1", "Commander 2"],
    });
    return { state, applied, runner };
  }

  // @req PROF-010 @req ART-008
  it("on game start gives every seat with a commander and no stronger art its commander art", async () => {
    const names = COMMANDER_CARDS.slice(2, 6).map((c) => c.name);
    const game = cmdGame([
      { name: "A", commanders: [names[0]!] },
      { name: "B", commanders: [names[1]!], art: profileArt },
      { name: "C", commanders: [names[2]!], art: deckArt },
      { name: "D", commanders: [names[3]!], art: byHand },
    ]);
    const h = harness(game);
    await h.runner.check();
    expect(h.applied).toEqual([`s1:${names[0]}`, `s2:${names[1]}`]);
    expect(h.state.game.seats.map((s) => s.art?.origin)).toEqual([
      "commander",
      "commander",
      "deck",
      undefined,
    ]);
    // idempotent: nothing more to do
    await h.runner.check();
    expect(h.applied).toHaveLength(2);
  });

  it("leaves seats alone when the option is off", async () => {
    const game = cmdGame([{ name: "A", commanders: ["Edgar Markov"], art: profileArt }]);
    const h = harness({ ...game, options: { ...game.options, commanderArt: false } });
    await h.runner.check();
    expect(h.applied).toEqual([]);
    expect(h.state.game.seats[0]!.art).toEqual(profileArt);
  });

  // @req PROF-010 @req ART-008
  it("mid-game: a new or changed commander brings its art; art picked by hand is kept", async () => {
    const h = harness(cmdGame([{ name: "A" }, { name: "B" }]));
    await h.runner.check();
    expect(h.applied).toEqual([]);

    h.state.game = apply(h.state.game, [
      { type: "SEAT_SET_COMMANDERS", seatId: "s1", commanders: ["Edgar Markov"] },
    ]);
    await h.runner.check();
    expect(h.state.game.seats[0]!.art?.cardName).toBe("Edgar Markov");

    h.state.game = apply(h.state.game, [
      { type: "SEAT_SET_COMMANDERS", seatId: "s1", commanders: ["Yuriko, the Tiger's Shadow"] },
    ]);
    await h.runner.check();
    expect(h.state.game.seats[0]!.art?.cardName).toBe("Yuriko, the Tiger's Shadow");

    h.state.game = apply(h.state.game, [
      { type: "SEAT_SET_ART", seatId: "s2", art: byHand },
      { type: "SEAT_SET_COMMANDERS", seatId: "s2", commanders: ["Tymna the Weaver"] },
    ]);
    await h.runner.check();
    expect(h.state.game.seats[1]!.art).toEqual(byHand);
  });

  it("drops a result when art was picked by hand meanwhile, or the game was replaced", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const h = harness(cmdGame([{ name: "A", commanders: ["Edgar Markov"] }]), async (name) => {
      await gate;
      return commanderArtFromCard(card(name))!;
    });
    const pending = h.runner.check();
    void h.runner.check(); // an in-flight lookup is not started twice
    h.state.game = apply(h.state.game, [{ type: "SEAT_SET_ART", seatId: "s1", art: byHand }]);
    release();
    await pending;
    expect(h.applied).toEqual([]);

    const h2 = harness(cmdGame([{ name: "A", commanders: ["Edgar Markov"] }]), async (name) => {
      h2.state.game = { ...h2.state.game, id: "another" };
      return commanderArtFromCard(card(name))!;
    });
    await h2.runner.check();
    expect(h2.applied).toEqual([]);
    const h3 = harness(cmdGame([{ name: "A" }]));
    (h3.state as { game: Game | null }).game = null;
    await h3.runner.check();
  });

  it("degrades quietly offline / for unknown names and retries when asked", async () => {
    let online = false;
    const h = harness(
      cmdGame([{ name: "A", commanders: ["Kenrith, the Returned King"] }]),
      async (n) => {
        if (!online) throw new ScryfallError({ status: 0, code: "network", details: "offline" });
        return commanderArtFromCard(card(n))!;
      },
    );
    await h.runner.check();
    expect(h.applied).toEqual([]);
    await h.runner.check(); // a failed lookup is not retried on every change…
    expect(h.state.game.seats[0]!.art).toBeUndefined();
    online = true;
    await h.runner.retryFailed(); // …only when the device comes back online
    expect(h.applied).toEqual(["s1:Kenrith, the Returned King"]);
  });
});
