/**
 * Credit helpers for the seat menu and About/credits screen (ART-005, LEG-003, TOOL-011).
 * English defaults are provided; UI callers pass i18n templates via `t(...)` output, using
 * `{artist}` as the placeholder.
 */
import type { ArtOption } from "./types";

export const SCRYFALL_URL = "https://scryfall.com";

/** Default English attribution copy. */
export const DEFAULT_ATTRIBUTION_TEXT =
  "Card images, card data and mana symbols are provided by Scryfall. " +
  "This app is not produced by or endorsed by Scryfall or Wizards of the Coast.";

export const DEFAULT_ARTIST_TEMPLATE = "Art: {artist}";

export interface ScryfallAttribution {
  text: string;
  linkLabel: string;
  href: string;
}

/** Scryfall attribution text + link for the About screen (LEG-003). */
export function scryfallAttribution(text: string = DEFAULT_ATTRIBUTION_TEXT): ScryfallAttribution {
  return { text, linkLabel: "Scryfall", href: SCRYFALL_URL };
}

/**
 * "Art: {artist}" credit (ART-005). Returns `undefined` for a missing/blank artist so the UI
 * never shows an empty credit.
 */
export function artistCredit(
  artist: string | undefined | null,
  template: string = DEFAULT_ARTIST_TEMPLATE,
): string | undefined {
  const name = artist?.trim();
  if (!name) return undefined;
  return template.replaceAll("{artist}", name);
}

export interface ArtCredit {
  artist: string;
  /** Distinct "Card name (Set name)" entries using this artist's art. */
  works: string[];
}

/**
 * Group the artworks currently in use by artist, for the About/credits list (T5.6).
 * Artists and works are de-duplicated and sorted for a stable display.
 */
export function collectArtCredits(
  arts: readonly Pick<ArtOption, "artist" | "cardName" | "setName" | "faceName">[],
): ArtCredit[] {
  const byArtist = new Map<string, Set<string>>();
  for (const a of arts) {
    const artist = a.artist?.trim();
    if (!artist) continue;
    const title = a.faceName ?? a.cardName;
    const work = a.setName ? `${title} (${a.setName})` : title;
    const set = byArtist.get(artist) ?? new Set<string>();
    set.add(work);
    byArtist.set(artist, set);
  }
  return [...byArtist.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([artist, works]) => ({ artist, works: [...works].sort((x, y) => x.localeCompare(y)) }));
}
