import type { ArtOption, ManaSymbol, ScryfallCard, ScryfallCardSymbol } from "./types";

/**
 * Map a Scryfall Card into selectable artworks (ART-002, ART-003).
 * - Cards with top-level `image_uris` (normal, split, flip, adventure…) → one option.
 * - Multi-faced cards whose faces carry `image_uris` (transform, modal_dfc, reversible…) →
 *   one option per face, with that face's name, artist and illustration.
 * Faces/cards without an `art_crop` are skipped.
 */
export function artOptionsFromCard(card: ScryfallCard): ArtOption[] {
  const base = {
    cardId: card.id,
    cardName: card.name,
    setName: card.set_name,
    setCode: card.set,
    collectorNumber: card.collector_number,
    releasedAt: card.released_at,
  };
  if (card.image_uris?.art_crop) {
    return [
      {
        ...base,
        id: `${card.id}:0`,
        faceIndex: 0,
        artCropUrl: card.image_uris.art_crop,
        smallUrl: card.image_uris.small,
        artist: card.artist ?? card.card_faces?.[0]?.artist ?? "",
        illustrationId: card.illustration_id,
      },
    ];
  }
  const out: ArtOption[] = [];
  (card.card_faces ?? []).forEach((face, faceIndex) => {
    const art = face.image_uris?.art_crop;
    if (!art) return;
    out.push({
      ...base,
      id: `${card.id}:${faceIndex}`,
      faceIndex,
      faceName: face.name,
      artCropUrl: art,
      smallUrl: face.image_uris?.small,
      artist: face.artist ?? card.artist ?? "",
      illustrationId: face.illustration_id ?? card.illustration_id,
    });
  });
  return out;
}

/** The five colors plus colorless, in WUBRG order (TOOL-011). */
export const MANA_POOL_SYMBOLS = ["{W}", "{U}", "{B}", "{R}", "{G}", "{C}"] as const;

/**
 * Map `/symbology` Card Symbols to {symbol, svgUri, english}: drops "funny" (Un-set) symbols
 * and symbols without an SVG, and puts W U B R G C first, then the rest in API order.
 */
export function mapSymbology(symbols: readonly ScryfallCardSymbol[]): ManaSymbol[] {
  const mapped: ManaSymbol[] = symbols
    .filter((s) => !s.funny && typeof s.svg_uri === "string" && s.svg_uri.length > 0)
    .map((s) => ({ symbol: s.symbol, svgUri: s.svg_uri!, english: s.english }));
  const rank = (sym: string) => {
    const i = (MANA_POOL_SYMBOLS as readonly string[]).indexOf(sym);
    return i === -1 ? MANA_POOL_SYMBOLS.length : i;
  };
  return mapped
    .map((s, i) => ({ s, i }))
    .sort((a, b) => rank(a.s.symbol) - rank(b.s.symbol) || a.i - b.i)
    .map(({ s }) => s);
}
