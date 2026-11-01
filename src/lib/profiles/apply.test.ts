// @req PROF-002 @req PROF-010 @req PROF-001
import { describe, expect, it } from "vitest";
import type { Seat } from "@/engine";
import { selectionToSeatActions, seatToDeckInput, seatToProfileInput } from "./apply";
import type { Deck, PlayerProfile } from "./types";

const profile: PlayerProfile = {
  id: "p1",
  name: "JP",
  color: "#34d399",
  contrast: true,
  art: { kind: "gradient", value: "linear-gradient(red, blue)" },
  updatedAt: 1,
};
const deck: Deck = {
  id: "d1",
  profileId: "p1",
  name: "Toxrill",
  commanders: ["Toxrill, the Corrosive"],
  updatedAt: 1,
};
const seat: Seat = {
  id: "s1",
  name: "JP",
  commanders: ["A", "B"],
  color: "#f472b6",
  eliminated: false,
  contrast: false,
};

describe("selectionToSeatActions", () => {
  // @req PROF-002
  it("applies name, color, contrast and profile art without a deck", () => {
    expect(selectionToSeatActions("s1", { profile })).toEqual([
      { type: "SEAT_SET_PROFILE", seatId: "s1", profileId: "p1", name: "JP" },
      { type: "SEAT_SET_COLOR", seatId: "s1", color: "#34d399" },
      { type: "SEAT_SET_CONTRAST", seatId: "s1", contrast: true },
      { type: "SEAT_SET_ART", seatId: "s1", art: profile.art },
    ]);
  });

  // @req PROF-010
  it("links the deck, prefers deck art and sets commanders", () => {
    const deckArt = { kind: "solid" as const, value: "#000" };
    const actions = selectionToSeatActions("s1", {
      profile: { ...profile, art: undefined },
      deck: { ...deck, art: deckArt },
    });
    expect(actions[0]).toEqual({
      type: "SEAT_SET_PROFILE",
      seatId: "s1",
      profileId: "p1",
      name: "JP",
      deckId: "d1",
      deckName: "Toxrill",
    });
    expect(actions).toContainEqual({ type: "SEAT_SET_ART", seatId: "s1", art: deckArt });
    expect(actions).toContainEqual({
      type: "SEAT_SET_COMMANDERS",
      seatId: "s1",
      commanders: ["Toxrill, the Corrosive"],
    });
  });

  it("does not touch art or commanders when there are none", () => {
    const actions = selectionToSeatActions("s1", {
      profile: { ...profile, art: undefined },
      deck: { ...deck, commanders: [] },
    });
    expect(actions.map((a) => a.type)).toEqual([
      "SEAT_SET_PROFILE",
      "SEAT_SET_COLOR",
      "SEAT_SET_CONTRAST",
    ]);
  });
});

describe("save as profile", () => {
  // @req PROF-001
  it("maps a seat to profile and deck inputs", () => {
    expect(seatToProfileInput(seat)).toEqual({ name: "JP", color: "#f472b6", contrast: false });
    expect(seatToProfileInput({ ...seat, art: profile.art }).art).toEqual(profile.art);
    expect(seatToDeckInput(seat, "p1", "mtg.commander")).toEqual({
      profileId: "p1",
      name: "A",
      commanders: ["A", "B"],
      presetId: "mtg.commander",
    });
    expect(seatToDeckInput({ ...seat, deckName: "Partners" }, "p1")?.name).toBe("Partners");
    expect(seatToDeckInput({ ...seat, commanders: [] }, "p1")).toBeNull();
  });
});
