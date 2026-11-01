// @req ART-001 @req ART-003 @req ART-005 @req ART-008 @req PROF-010 @req ART-009
import { describe, expect, it } from "vitest";
import { getBuiltInPreset } from "@/presets";
import { ScryfallError, type ArtOption, type ScryfallCard } from "@/lib/scryfall";
import { newGame } from "../../../tests/unit/helpers/engine";
import delver from "../../../tests/fixtures/scryfall/search-delver-transform.json";
import solRing from "../../../tests/fixtures/scryfall/named-sol-ring.json";
import {
  artRefFromOption,
  commanderNameFor,
  commandersWith,
  creditsFromArt,
  deckWithCommander,
  firstArtOption,
  lookupCommanderNames,
  optionTitle,
  shouldSuggest,
  uploadArtRef,
  usesCommanders,
} from "./picker";
import { getScryfall, isOfflineError, navigatorOnline, setScryfallForTests } from "./scryfall";

const delverCard = delver.data[0] as unknown as ScryfallCard;

const opt = (o: Partial<ArtOption> = {}): ArtOption => ({
  id: "c:0",
  cardId: "c",
  cardName: "Sol Ring",
  faceIndex: 0,
  artCropUrl: "https://cards.scryfall.io/art_crop/x.jpg",
  artist: "Mark Tedin",
  setName: "Limited Edition Alpha",
  setCode: "lea",
  collectorNumber: "1",
  releasedAt: "1993-08-05",
  ...o,
});

describe("art picker model", () => {
  // @req ART-001
  it("suggests from 2 characters", () => {
    expect(shouldSuggest("s")).toBe(false);
    expect(shouldSuggest(" so ")).toBe(true);
  });

  it("detects commander-type presets from data", () => {
    const cmd = getBuiltInPreset("mtg.commander")!;
    const std = getBuiltInPreset("mtg.constructed")!;
    expect(usesCommanders(newGame({ preset: cmd }))).toBe(true);
    expect(usesCommanders(newGame({ preset: std, seats: [{ name: "A" }, { name: "B" }] }))).toBe(
      false,
    );
  });

  // @req ART-003 @req ART-005
  it("builds a scryfall ArtRef with art_crop, focal, artist and the face name", () => {
    const [front, back] = [
      firstArtOption(delverCard)!,
      { ...firstArtOption(delverCard)!, faceIndex: 1 },
    ];
    expect(front.faceName).toBe("Delver of Secrets");
    expect(optionTitle(front)).toBe("Delver of Secrets");
    expect(commanderNameFor({ ...back, faceName: "Insectile Aberration" })).toBe(
      "Delver of Secrets",
    );
    expect(commanderNameFor(opt())).toBe("Sol Ring");
    expect(artRefFromOption(opt(), { x: 0.12345, y: 2, zoom: 1.5 })).toEqual({
      kind: "scryfall",
      value: "https://cards.scryfall.io/art_crop/x.jpg",
      focal: { x: 0.123, y: 1, zoom: 1.5 },
      cardName: "Sol Ring",
      artist: "Mark Tedin",
    });
    expect(artRefFromOption(opt({ artist: " " })).artist).toBeUndefined();
    expect(uploadArtRef("abc")).toEqual({
      kind: "upload",
      value: "abc",
      focal: { x: 0.5, y: 0.5, zoom: 1 },
    });
  });

  // @req ART-008
  it("commander auto-art: first art of the named card; skips fallback names", () => {
    expect(firstArtOption(solRing as unknown as ScryfallCard)?.artist).toBe("Mark Tedin");
    expect(
      lookupCommanderNames({ commanders: ["Toxrill, the Corrosive", "Commander 2", " "] }, [
        "Commander 1",
        "Commander 2",
      ]),
    ).toEqual(["Toxrill, the Corrosive"]);
    expect(commandersWith([], "A")).toEqual(["A"]);
    expect(commandersWith(["X", "Partner"], "A")).toEqual(["A", "Partner"]);
  });

  // @req PROF-010
  it("save to deck: updates the seat's deck or creates one named after the commander", () => {
    const art = artRefFromOption(opt());
    expect(deckWithCommander({ commanders: [] }, undefined, "Sol Ring", art, "mtg.commander")).toBe(
      null,
    );
    expect(
      deckWithCommander(
        { profileId: "p", commanders: [] },
        undefined,
        "Toxrill",
        art,
        "mtg.commander",
      ),
    ).toEqual({
      profileId: "p",
      name: "Toxrill",
      commanders: ["Toxrill"],
      art,
      presetId: "mtg.commander",
    });
    const deck = {
      id: "d",
      profileId: "p",
      name: "UB Slime",
      commanders: ["Old", "Partner"],
      updatedAt: 5,
    };
    expect(
      deckWithCommander({ profileId: "p", deckId: "d", commanders: [] }, deck, "New", art, "x"),
    ).toEqual({ id: "d", profileId: "p", name: "UB Slime", commanders: ["New", "Partner"], art });
    // a deck of another profile is not overwritten
    expect(
      deckWithCommander({ profileId: "q", commanders: [] }, deck, "New", art, "x")?.profileId,
    ).toBe("q");
    expect(
      deckWithCommander(
        { profileId: "p", commanders: [] },
        { ...deck, commanders: ["Solo"] },
        "N",
        art,
        "x",
      )?.commanders,
    ).toEqual(["N"]);
  });

  // @req ART-005
  it("credits group the Scryfall art in use by artist", () => {
    expect(
      creditsFromArt([
        undefined,
        { kind: "gradient", value: "x" },
        { kind: "scryfall", value: "u1", artist: "Mark Tedin", cardName: "Sol Ring" },
        { kind: "scryfall", value: "u2", artist: "Mark Tedin", cardName: "Sol Ring" },
        { kind: "scryfall", value: "u3", artist: "Alayna Danner", cardName: "Toxrill" },
        { kind: "scryfall", value: "u4" },
        { kind: "upload", value: "id", artist: "Me" },
      ]),
    ).toEqual([
      { artist: "Alayna Danner", works: ["Toxrill"] },
      { artist: "Mark Tedin", works: ["Sol Ring"] },
    ]);
  });
});

describe("shared Scryfall client", () => {
  it("is a singleton that tests can replace", () => {
    const a = getScryfall();
    expect(getScryfall()).toBe(a);
    setScryfallForTests(null);
    expect(getScryfall()).not.toBe(a);
  });

  // @req ART-009
  it("classifies offline errors", () => {
    const net = new ScryfallError({ status: 0, code: "network", details: "x" });
    const nf = new ScryfallError({ status: 404, code: "not_found", details: "x" });
    expect(isOfflineError(net, true)).toBe(true);
    expect(isOfflineError(nf, true)).toBe(false);
    expect(isOfflineError(nf, false)).toBe(true);
    expect(isOfflineError(new Error("x"))).toBe(!navigatorOnline());
    expect(typeof navigatorOnline()).toBe("boolean");
  });
});
