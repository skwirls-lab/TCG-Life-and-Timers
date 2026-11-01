/**
 * Pure mapping between profiles/decks and seats (PROF-001, PROF-002, PROF-010).
 * The caller dispatches the returned actions (sticky seat edits, except SEAT_SET_COMMANDERS).
 */
import type { Seat, SeatAction, SeatId } from "@/engine";
import type { DeckInput, ProfileInput, ProfileSelection } from "./types";

/**
 * Seat actions that apply a picked profile (+ optional deck): link + name, accent color,
 * contrast, background (deck art wins over profile art) and the deck's commanders.
 */
export function selectionToSeatActions(seatId: SeatId, sel: ProfileSelection): SeatAction[] {
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
  const art = deck?.art ?? profile.art;
  if (art) out.push({ type: "SEAT_SET_ART", seatId, art });
  if (deck && deck.commanders.length > 0)
    out.push({ type: "SEAT_SET_COMMANDERS", seatId, commanders: deck.commanders.slice(0, 2) });
  return out;
}

/** "Save as profile" from a seat: the profile part. */
export function seatToProfileInput(seat: Seat): ProfileInput {
  return {
    name: seat.name,
    color: seat.color,
    contrast: seat.contrast,
    ...(seat.art ? { art: seat.art } : {}),
  };
}

/**
 * "Save as profile" from a seat: the deck part, when the seat has commanders or a deck name.
 * The deck is named after the deck name, else the first commander.
 */
export function seatToDeckInput(
  seat: Seat,
  profileId: string,
  presetId?: string,
): DeckInput | null {
  const commanders = seat.commanders.filter((c) => c.trim());
  const name = seat.deckName?.trim() || commanders[0];
  if (!name) return null;
  return {
    profileId,
    name,
    commanders,
    ...(presetId ? { presetId } : {}),
  };
}
