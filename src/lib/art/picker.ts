/**
 * Pure helpers for the seat art picker (T5.2: ART-001..005, ART-008, PROF-010) and the
 * About/credits screen (T5.6: ART-005, LEG-003).
 */
import type { ArtFocal, ArtRef, Game, Seat } from "@/engine";
import type { Deck, DeckInput } from "@/lib/profiles/types";
import {
  artOptionsFromCard,
  collectArtCredits,
  type ArtCredit,
  type ArtOption,
  type ScryfallCard,
} from "@/lib/scryfall";
import { DEFAULT_FOCAL, normalizeFocal, roundFocal } from "./focal";

/** Autocomplete input rules (ART-001). */
export const SEARCH_DEBOUNCE_MS = 300;
export const SEARCH_MIN_CHARS = 2;

/** True when the query is long enough to ask Scryfall for suggestions. */
export function shouldSuggest(q: string): boolean {
  return q.trim().length >= SEARCH_MIN_CHARS;
}

/** Commander-type presets: some enabled counter is commander-indexed (data-driven, ARCH-003). */
export function usesCommanders(game: Pick<Game, "preset" | "enabledCounters">): boolean {
  return game.preset.counters.some(
    (d) =>
      game.enabledCounters.includes(d.id) && (d.scope === "playerVsOpponent" || d.perCommander),
  );
}

/** Card name shown for an option (the face name for multi-faced cards). */
export function optionTitle(opt: ArtOption): string {
  return opt.faceName ?? opt.cardName;
}

/** The name to use as a commander: the front face of a multi-faced card, else the card name. */
export function commanderNameFor(opt: ArtOption): string {
  if (!opt.faceName) return opt.cardName;
  return opt.cardName.split(" // ")[0]?.trim() || opt.cardName;
}

/** Seat ArtRef for a chosen print (ART-003 art_crop, ART-004 focal, ART-005 artist). */
export function artRefFromOption(opt: ArtOption, focal: ArtFocal = DEFAULT_FOCAL): ArtRef {
  const ref: ArtRef = {
    kind: "scryfall",
    value: opt.artCropUrl,
    focal: roundFocal(normalizeFocal(focal)),
    cardName: optionTitle(opt),
  };
  const artist = opt.artist?.trim();
  if (artist) ref.artist = artist;
  return ref;
}

/** Seat ArtRef for an uploaded image (`value` = art table id). */
export function uploadArtRef(id: string, focal: ArtFocal = DEFAULT_FOCAL): ArtRef {
  return { kind: "upload", value: id, focal: roundFocal(normalizeFocal(focal)) };
}

/** First artwork of a card (commander auto-art, ART-008). */
export function firstArtOption(card: ScryfallCard): ArtOption | undefined {
  return artOptionsFromCard(card)[0];
}

/** Commander names declared on a seat that can be looked up (ignores "Commander N" fallbacks). */
export function lookupCommanderNames(
  seat: Pick<Seat, "commanders">,
  fallbacks: string[],
): string[] {
  return seat.commanders.map((c) => c.trim()).filter((c) => c && !fallbacks.includes(c));
}

/**
 * PROF-010 "Save to deck": update the seat's deck with this commander + art, or create a deck
 * named after the commander for the seat's profile. Null when the seat has no profile.
 */
export function deckWithCommander(
  seat: Pick<Seat, "profileId" | "deckId" | "commanders">,
  existing: Deck | undefined,
  commander: string,
  art: ArtRef,
  presetId: string,
): DeckInput | null {
  if (!seat.profileId) return null;
  if (existing && existing.profileId === seat.profileId) {
    const partner = existing.commanders.length >= 2 ? existing.commanders.slice(1, 2) : [];
    const { updatedAt: _updatedAt, ...rest } = existing;
    return { ...rest, commanders: [commander, ...partner], art };
  }
  return { profileId: seat.profileId, name: commander, commanders: [commander], art, presetId };
}

/** Seat commanders after "Use as commander": keep a partner when there is one. */
export function commandersWith(current: readonly string[], commander: string): string[] {
  return current.length >= 2 ? [commander, current[1]!] : [commander];
}

// ---------------------------------------------------------------------------------------------
// Credits (T5.6)
// ---------------------------------------------------------------------------------------------

/** Artist credits of the Scryfall art in use (active game + saved profiles/decks), grouped. */
export function creditsFromArt(refs: readonly (ArtRef | undefined)[]): ArtCredit[] {
  return collectArtCredits(
    refs
      .filter((r): r is ArtRef => !!r && r.kind === "scryfall" && !!r.artist)
      .map((r) => ({ artist: r.artist!, cardName: r.cardName ?? "", setName: "" })),
  );
}
