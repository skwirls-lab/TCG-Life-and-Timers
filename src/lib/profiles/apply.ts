/**
 * Pure mapping between profiles/decks and seats (PROF-001, PROF-002, PROF-010).
 * The caller dispatches the returned actions (sticky seat edits, except SEAT_SET_COMMANDERS).
 */
import type { ArtRef, Seat, SeatAction, SeatId } from "@/engine";
import { storedArt, withOrigin } from "@/lib/art/commanderArt";
import type { Deck, DeckInput, PlayerProfile, ProfileInput, ProfileSelection } from "./types";

/**
 * The background a selection gives a seat, tagged with its origin: deck art wins over profile art
 * (precedence: by hand > deck > commander > profile, see src/lib/art/commanderArt.ts).
 */
export function selectionArt(sel: ProfileSelection): ArtRef | undefined {
  const deckArt = storedArt(sel.deck?.art);
  if (deckArt) return withOrigin(deckArt, "deck");
  const profileArt = storedArt(sel.profile.art);
  return profileArt ? withOrigin(profileArt, "profile") : undefined;
}

/**
 * Seat actions that apply a picked profile (+ optional deck): link + name, accent color,
 * contrast, background (deck art wins over profile art) and the deck's commanders. Every place
 * that loads a profile onto a seat goes through this (seat menu; setup via applyProfile).
 * With `current`, automatic art left by an earlier load is cleared when the selection has none.
 */
export function selectionToSeatActions(
  seatId: SeatId,
  sel: ProfileSelection,
  current?: Pick<Seat, "art">,
): SeatAction[] {
  const { profile, deck } = sel;
  const out: SeatAction[] = [
    {
      type: "SEAT_SET_PROFILE",
      seatId,
      profileId: profile.id,
      name: profile.name,
      ...(deck ? { deckId: deck.id, deckName: deck.name } : {}),
    },
    { type: "SEAT_SET_COLOR", seatId, color: profile.color },
    { type: "SEAT_SET_CONTRAST", seatId, contrast: profile.contrast },
  ];
  const art = selectionArt(sel);
  if (art) out.push({ type: "SEAT_SET_ART", seatId, art });
  else if (current?.art?.origin) out.push({ type: "SEAT_SET_ART", seatId });
  if (deck && deck.commanders.length > 0)
    out.push({ type: "SEAT_SET_COMMANDERS", seatId, commanders: deck.commanders.slice(0, 2) });
  return out;
}

/**
 * "Save as profile" from a seat: the profile part. Art picked by hand (or the profile's own art)
 * becomes the profile's background; deck/commander art belongs to the deck, so the profile keeps
 * the art it already has (`existing`).
 */
export function seatToProfileInput(seat: Seat, existing?: PlayerProfile): ProfileInput {
  const own = !seat.art?.origin || seat.art.origin === "profile";
  const art = own ? storedArt(seat.art) : storedArt(existing?.art);
  return {
    name: seat.name,
    color: seat.color,
    contrast: seat.contrast,
    ...(art ? { art } : {}),
  };
}

/**
 * "Save as profile" from a seat: the deck part, when the seat has commanders or a deck name.
 * The deck is named after the deck name, else the first commander. Updating the seat's deck
 * (`existing`) keeps its other fields; deck or commander art on the seat becomes the deck's art.
 */
export function seatToDeckInput(
  seat: Seat,
  profileId: string,
  presetId?: string,
  existing?: Deck,
): DeckInput | null {
  const commanders = seat.commanders.filter((c) => c.trim());
  const name = seat.deckName?.trim() || commanders[0];
  if (!name) return null;
  const seatArt =
    seat.art?.origin === "deck" || seat.art?.origin === "commander"
      ? storedArt(seat.art)
      : undefined;
  const art = seatArt ?? storedArt(existing?.art);
  const { updatedAt: _u, art: _a, ...kept } = existing ?? ({} as Partial<Deck>);
  return {
    ...kept,
    ...(existing ? { id: existing.id } : {}),
    profileId,
    name,
    commanders,
    ...(presetId ? { presetId } : {}),
    ...(art ? { art } : {}),
  };
}
