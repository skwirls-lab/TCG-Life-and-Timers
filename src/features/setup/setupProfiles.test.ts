// @req PROF-002 @req PROF-010 @req ART-008 @req SET-012
import { afterEach, describe, expect, it } from "vitest";
import { getBuiltInPreset } from "@/presets";
import { getPresetDefaults, rememberPresetOption } from "@/state/presetDefaults";
import type { Deck, PlayerProfile } from "@/lib/profiles/types";
import { closeArtDbs, freshArtDb } from "../../../tests/unit/helpers/art";
import {
  applyProfile,
  commanderArtDefault,
  stateForPreset,
  toNewGameConfig,
  updateSeat,
} from "./setupModel";

const commander = getBuiltInPreset("mtg.commander")!;
const constructed = getBuiltInPreset("mtg.constructed")!;

const profile: PlayerProfile = {
  id: "p1",
  name: "JP",
  color: "#34d399",
  contrast: true,
  art: { kind: "solid", value: "#123" },
  updatedAt: 1,
};
const deck: Deck = {
  id: "d1",
  profileId: "p1",
  name: "Atraxa",
  commanders: ["Atraxa, Praetors' Voice"],
  art: { kind: "scryfall", value: "https://cards.scryfall.io/art_crop/a.jpg", cardName: "Atraxa" },
  updatedAt: 1,
};

afterEach(closeArtDbs);

describe("setup: loading profiles (same path as the seat menu)", () => {
  // @req PROF-002 @req PROF-010
  it("applies name, color, contrast, commanders and tagged deck > profile art", () => {
    const s = stateForPreset(commander, undefined);
    const withDeck = applyProfile(s, 0, { profile, deck });
    expect(withDeck.seats[0]).toMatchObject({
      name: "JP",
      color: "#34d399",
      contrast: true,
      profileId: "p1",
      deckId: "d1",
      deckName: "Atraxa",
      commanders: ["Atraxa, Praetors' Voice"],
      art: { ...deck.art, origin: "deck" },
    });
    // switching to the profile alone keeps no deck and uses the profile's art
    const profileOnly = applyProfile(withDeck, 0, { profile });
    expect(profileOnly.seats[0]).toMatchObject({
      commanders: [],
      art: { kind: "solid", value: "#123", origin: "profile" },
    });
    expect(profileOnly.seats[0]!.deckId).toBeUndefined();
    // a profile without art clears automatic art, but never art set on the seat by hand
    const bare = { ...profile, art: undefined };
    expect(applyProfile(profileOnly, 0, { profile: bare }).seats[0]!.art).toBeUndefined();
    const byHand = updateSeat(s, 1, { art: { kind: "gradient", value: "g" } });
    expect(applyProfile(byHand, 1, { profile: bare }).seats[1]!.art).toEqual({
      kind: "gradient",
      value: "g",
    });
    // the engine config carries the tagged art
    expect(toNewGameConfig(withDeck, commander).seats?.[0]?.art?.origin).toBe("deck");
  });
});

describe('setup: "Set seat backgrounds to commanders"', () => {
  // @req PROF-010 @req ART-008
  it("defaults on for commander presets, off elsewhere, and follows stored defaults", () => {
    expect(commanderArtDefault(commander, undefined)).toBe(true);
    expect(commanderArtDefault(constructed, undefined)).toBe(false);
    expect(commanderArtDefault(commander, { options: { commanderArt: false } })).toBe(false);
    expect(stateForPreset(commander, undefined).commanderArt).toBe(true);
  });

  it("writes the option to the new game only when it isn't the default", () => {
    const on = stateForPreset(commander, undefined);
    expect(toNewGameConfig(on, commander).options?.commanderArt).toBeUndefined();
    const off = { ...on, commanderArt: false };
    expect(toNewGameConfig(off, commander).options?.commanderArt).toBe(false);
    // turning it back on over a stored "off" default must win
    const stored = stateForPreset(commander, { options: { commanderArt: false } });
    expect(
      toNewGameConfig({ ...stored, commanderArt: true }, commander).options?.commanderArt,
    ).toBe(true);
    expect(toNewGameConfig(stored, commander).options?.commanderArt).toBe(false);
    // never for presets without commanders
    const c = stateForPreset(constructed, undefined);
    expect(toNewGameConfig({ ...c, commanderArt: false }, constructed).options).not.toHaveProperty(
      "commanderArt",
    );
  });

  // @req SET-012
  it("is remembered as a preset default without touching the other stored defaults", async () => {
    const db = freshArtDb();
    await rememberPresetOption("mtg.commander", "commanderArt", false, db);
    expect(await getPresetDefaults("mtg.commander", db)).toEqual({
      options: { commanderArt: false },
    });
    await rememberPresetOption("mtg.commander", "partnersAllowed", false, db);
    await rememberPresetOption("mtg.commander", "commanderArt", true, db);
    expect((await getPresetDefaults("mtg.commander", db))?.options).toEqual({
      commanderArt: true,
      partnersAllowed: false,
    });
  });
});
