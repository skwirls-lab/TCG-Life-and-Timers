/**
 * Commander art for seats (PROF-010, ART-008): which background wins, and which seats should get
 * their commander's art automatically ("Set seat backgrounds to commanders").
 *
 * PRECEDENCE (strongest first) — a weaker source never replaces a stronger one:
 *   1. art set by hand in this game (seat menu art picker, colors, My images, "Use commander art")
 *   2. deck art        — the loaded deck's default background
 *   3. commander art   — automatic, only while the game's commander-art option is on
 *   4. profile art     — the loaded profile's default background
 *
 * The source is recorded on the seat's ArtRef as `origin` ("deck" | "commander" | "profile");
 * no origin means "by hand". Loading a profile/deck is itself an explicit choice, so it replaces
 * whatever the seat had (see selectionToSeatActions). Automatic commander art is applied when a
 * game starts and whenever a seat's commander changes, but only over "profile"/"commander" art or
 * no art at all. Partners use the first commander's art (split backgrounds are P2).
 *
 * Pure helpers only; the board-side runtime lives in src/features/profiles/CommanderArtLayer.tsx.
 */
import type { ArtFocal, ArtOrigin, ArtRef, Game, SeatId } from "@/engine";
import type { ScryfallCard, ScryfallClient } from "@/lib/scryfall";
import { normalizeFocal, roundFocal } from "./focal";
import { artRefFromOption, firstArtOption, lookupCommanderNames, usesCommanders } from "./picker";

/** Rank of a seat background source (higher wins). No art = -1, by hand = 3. */
export function artRank(art: ArtRef | undefined): number {
  if (!art) return -1;
  switch (art.origin) {
    case "profile":
      return 0;
    case "commander":
      return 1;
    case "deck":
      return 2;
    default:
      return 3;
  }
}

/** True when automatic art from `origin` may replace the seat's current art. */
export function canReplaceArt(current: ArtRef | undefined, origin: ArtOrigin): boolean {
  return artRank(current) <= artRank({ kind: "default", value: "", origin });
}

/** A copy of `art` tagged with an automatic origin. */
export function withOrigin(art: ArtRef, origin: ArtOrigin): ArtRef {
  return { ...art, origin };
}

/** The art to keep on a profile or deck (the seat-only `origin` tag is dropped). */
export function storedArt(art: ArtRef | undefined): ArtRef | undefined {
  if (!art) return undefined;
  const { origin: _o, ...rest } = art;
  return rest;
}

/** The game's "Set seat backgrounds to commanders" value (default on for commander presets). */
export function commanderArtEnabled(game: Pick<Game, "preset" | "enabledCounters" | "options">) {
  return usesCommanders(game) && game.options.commanderArt !== false;
}

/** Comparable commander name: trimmed, case-folded, front face of a "A // B" name. */
export function commanderKey(name: string): string {
  return (name.split(" // ")[0] ?? name).trim().toLocaleLowerCase();
}

/** Focal point for automatic commander art: centered, slightly high (faces sit up top). */
export const COMMANDER_FOCAL: ArtFocal = { x: 0.5, y: 0.4, zoom: 1 };

/** Default-print art of a commander card (ART-008), or undefined when it has no art crop. */
export function commanderArtFromCard(
  card: ScryfallCard,
  focal: ArtFocal = COMMANDER_FOCAL,
): ArtRef | undefined {
  const opt = firstArtOption(card);
  return opt ? artRefFromOption(opt, roundFocal(normalizeFocal(focal))) : undefined;
}

/** True when the seat already shows art for this commander. */
export function showsCommanderArt(art: ArtRef | undefined, name: string): boolean {
  return !!art?.cardName && commanderKey(art.cardName) === commanderKey(name);
}

export interface CommanderArtTarget {
  seatId: SeatId;
  /** first declared commander (partners: the first one) */
  name: string;
}

/**
 * Seats that should get their commander's art now: the option is on, the seat declares a real
 * commander (not a "Commander N" placeholder), its art is weaker than commander art, and it does
 * not already show that commander.
 */
export function seatsNeedingCommanderArt(
  game: Pick<Game, "preset" | "enabledCounters" | "options" | "seats">,
  placeholders: readonly string[] = [],
): CommanderArtTarget[] {
  if (!commanderArtEnabled(game)) return [];
  const out: CommanderArtTarget[] = [];
  for (const seat of game.seats) {
    const name = lookupCommanderNames(seat, [...placeholders])[0];
    if (!name) continue;
    if (!canReplaceArt(seat.art, "commander")) continue;
    if (seat.art?.origin === "commander" && showsCommanderArt(seat.art, name)) continue;
    out.push({ seatId: seat.id, name });
  }
  return out;
}

/** Re-check one seat right before applying resolved art (the game may have changed meanwhile). */
export function stillNeedsCommanderArt(
  game: Pick<Game, "preset" | "enabledCounters" | "options" | "seats">,
  target: CommanderArtTarget,
  placeholders: readonly string[] = [],
): boolean {
  return seatsNeedingCommanderArt(game, placeholders).some(
    (t) => t.seatId === target.seatId && commanderKey(t.name) === commanderKey(target.name),
  );
}

/**
 * ART-008 commander-art resolution shared by the one-tap "Use commander art" button, the deck
 * editor and the automatic commander backgrounds: the card's default print through the shared
 * Scryfall client (24 h response cache, stale copy when offline). Throws when it can't resolve.
 */
export async function resolveCommanderArt(
  name: string,
  client: Pick<ScryfallClient, "cardNamed">,
  opts: { signal?: AbortSignal; focal?: ArtFocal } = {},
): Promise<ArtRef> {
  const card = await client.cardNamed(name, opts.signal ? { signal: opts.signal } : {});
  const art = commanderArtFromCard(card, opts.focal);
  if (!art) throw new Error(`no art for ${name}`);
  return art;
}

/**
 * Deck editor (PROF-010): the deck's default background after its first commander is picked.
 * A deck without art gets the commander's default print (centered a little high, editable later);
 * art the user chose is kept. `autoFilled` = the current art was itself filled in from an earlier
 * commander pick in this edit (so picking another commander updates it).
 */
export function deckArtForCommander(
  current: ArtRef | undefined,
  autoFilled: boolean,
  card: ScryfallCard,
): ArtRef | undefined {
  if (current && !autoFilled) return current;
  return commanderArtFromCard(card) ?? current;
}
