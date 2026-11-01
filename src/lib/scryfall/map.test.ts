// @vitest-environment node
// @req ART-003 @req TOOL-011
import { describe, expect, it } from "vitest";
import { artOptionsFromCard, mapSymbology } from "./map";
import type { ScryfallCard, ScryfallCardSymbol } from "./types";

const base: ScryfallCard = {
  object: "card",
  id: "c1",
  name: "Fire // Ice",
  layout: "split",
  set: "mh2",
  set_name: "Modern Horizons 2",
  collector_number: "290",
  released_at: "2021-06-18",
};

describe("artOptionsFromCard", () => {
  it("uses top-level image_uris for split cards even when card_faces exist", () => {
    const card: ScryfallCard = {
      ...base,
      image_uris: { art_crop: "https://cards.scryfall.io/art_crop/front/c/1/c1.jpg" },
      card_faces: [
        { object: "card_face", name: "Fire", artist: "Face Artist" },
        { object: "card_face", name: "Ice" },
      ],
    };
    const [opt, ...rest] = artOptionsFromCard(card);
    expect(rest).toHaveLength(0);
    expect(opt).toMatchObject({ id: "c1:0", faceIndex: 0, artist: "Face Artist" });
    expect(opt!.faceName).toBeUndefined();
    expect(opt!.smallUrl).toBeUndefined();
  });

  it("falls back to the card artist for faces and skips faces without art_crop", () => {
    const card: ScryfallCard = {
      ...base,
      layout: "transform",
      artist: "Card Artist",
      illustration_id: "ill-card",
      card_faces: [
        { object: "card_face", name: "Front", image_uris: { art_crop: "a.jpg" } },
        { object: "card_face", name: "Back", image_uris: { small: "s.jpg" } },
      ],
    };
    const opts = artOptionsFromCard(card);
    expect(opts).toHaveLength(1);
    expect(opts[0]).toMatchObject({ artist: "Card Artist", illustrationId: "ill-card" });
  });

  it("returns [] for cards with no art at all and uses '' for unknown artists", () => {
    expect(artOptionsFromCard(base)).toEqual([]);
    const noArtist = { ...base, image_uris: { art_crop: "x.jpg" } };
    expect(artOptionsFromCard(noArtist)[0]!.artist).toBe("");
    const faceNoArtist: ScryfallCard = {
      ...base,
      card_faces: [{ object: "card_face", name: "F", image_uris: { art_crop: "f.jpg" } }],
    };
    expect(artOptionsFromCard(faceNoArtist)[0]!.artist).toBe("");
  });
});

describe("mapSymbology", () => {
  const sym = (symbol: string, extra: Partial<ScryfallCardSymbol> = {}): ScryfallCardSymbol => ({
    object: "card_symbol",
    symbol,
    svg_uri: `https://svgs.scryfall.io/card-symbols/${symbol}.svg`,
    english: symbol,
    ...extra,
  });

  it("orders WUBRGC first, keeps the rest in API order, drops funny and SVG-less symbols", () => {
    const out = mapSymbology([
      sym("{T}"),
      sym("{C}"),
      sym("{Q}", { svg_uri: undefined }),
      sym("{G}"),
      sym("{HR}", { funny: true }),
      sym("{X}"),
      sym("{W}"),
      sym("{E}", { svg_uri: "" }),
    ]);
    expect(out.map((s) => s.symbol)).toEqual(["{W}", "{G}", "{C}", "{T}", "{X}"]);
  });
});
