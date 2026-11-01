// @vitest-environment node
// @req ART-005 @req LEG-003
import { describe, expect, it } from "vitest";
import {
  DEFAULT_ATTRIBUTION_TEXT,
  SCRYFALL_URL,
  artistCredit,
  collectArtCredits,
  scryfallAttribution,
} from "./attribution";

describe("attribution", () => {
  it("builds 'Art: {artist}' credits and hides blank artists", () => {
    expect(artistCredit("Mark Tedin")).toBe("Art: Mark Tedin");
    expect(artistCredit("  Volkan Baǵa ")).toBe("Art: Volkan Baǵa");
    expect(artistCredit("Rebecca Guay", "Illustration — {artist}")).toBe(
      "Illustration — Rebecca Guay",
    );
    expect(artistCredit("")).toBeUndefined();
    expect(artistCredit("   ")).toBeUndefined();
    expect(artistCredit(undefined)).toBeUndefined();
    expect(artistCredit(null)).toBeUndefined();
  });

  it("provides Scryfall attribution text and link", () => {
    expect(scryfallAttribution()).toEqual({
      text: DEFAULT_ATTRIBUTION_TEXT,
      linkLabel: "Scryfall",
      href: SCRYFALL_URL,
    });
    expect(DEFAULT_ATTRIBUTION_TEXT).toContain("Scryfall");
    expect(scryfallAttribution("Données : Scryfall").text).toBe("Données : Scryfall");
    expect(SCRYFALL_URL).toBe("https://scryfall.com");
  });

  it("groups art in use by artist, de-duplicated and sorted", () => {
    const credits = collectArtCredits([
      { artist: "Mark Tedin", cardName: "Sol Ring", setName: "Limited Edition Alpha" },
      {
        artist: "Matt Stewart",
        cardName: "Delver // Aberration",
        setName: "Innistrad",
        faceName: "Insectile Aberration",
      },
      { artist: "Mark Tedin", cardName: "Sol Ring", setName: "Limited Edition Alpha" },
      { artist: "Mark Tedin", cardName: "Armageddon", setName: "" },
      { artist: " ", cardName: "Ignored", setName: "X" },
    ]);
    expect(credits).toEqual([
      { artist: "Mark Tedin", works: ["Armageddon", "Sol Ring (Limited Edition Alpha)"] },
      { artist: "Matt Stewart", works: ["Insectile Aberration (Innistrad)"] },
    ]);
  });
});
