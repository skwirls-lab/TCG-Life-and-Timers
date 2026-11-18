/**
 * Answers the commander picker's Scryfall queries from search-commanders.json (PROF-010), for the
 * MSW unit tests and the Playwright routes. Hand-authored like the other fixtures: card names are
 * real, ids / image URLs / artists are illustrative (scripts/record-scryfall-fixtures.ts).
 *
 * Mimics `/cards/search?q=<words> is:commander` (Backgrounds only with `t:background`) and
 * `/cards/named?exact=<name>` for those cards.
 */
import searchCommanders from "./search-commanders.json";

export interface FixtureCard {
  name: string;
  type_line: string;
  [k: string]: unknown;
}

export const COMMANDER_CARDS = searchCommanders.data as FixtureCard[];

const isBackground = (c: FixtureCard) => /\bBackground\b/.test(c.type_line);

/** The fixture list for a commander search query, or null (= Scryfall's 404) when none match. */
export function commanderSearch(
  q: string,
): { object: "list"; has_more: false; data: FixtureCard[] } | null {
  if (!/\bis:commander\b/.test(q)) return null;
  const backgrounds = /t:background/.test(q);
  const words = q
    .replace(/\(is:commander OR t:background\)|is:commander/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const data = COMMANDER_CARDS.filter(
    (c) =>
      (backgrounds || !isBackground(c)) && words.every((w) => c.name.toLowerCase().includes(w)),
  );
  return data.length ? { object: "list", has_more: false, data } : null;
}

/** The fixture card with this exact name (case-insensitive), as `/cards/named?exact=` answers. */
export function commanderNamed(exact: string): FixtureCard | undefined {
  const want = exact.trim().toLowerCase();
  return COMMANDER_CARDS.find((c) => c.name.toLowerCase() === want);
}
