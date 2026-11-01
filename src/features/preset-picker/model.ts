/** Preset picker logic (PRE-003, PRE-012): search, grouping, recent and favorites lists. */
import type { Preset } from "@/engine";

export const RECENT_KEY = "presets.recent";
export const FAVORITES_KEY = "presets.favorites";
export const MAX_RECENT = 5;

/** Lower-case, accents stripped ("Pokémon" matches "pokemon"), punctuation collapsed. */
export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function haystack(p: Preset): string {
  return normalize([p.name, p.game, p.format ?? "", p.description, p.id].join(" "));
}

/** Presets whose name, game, format, description or id contain every word of the query. */
export function searchPresets(presets: readonly Preset[], query: string): Preset[] {
  const words = normalize(query).split(" ").filter(Boolean);
  if (!words.length) return [...presets];
  return presets.filter((p) => {
    const h = haystack(p);
    return words.every((w) => h.includes(w));
  });
}

export interface PresetGroup {
  game: string;
  presets: Preset[];
}

/** Group by game, keeping the registry order of first appearance. */
export function groupByGame(presets: readonly Preset[]): PresetGroup[] {
  const groups: PresetGroup[] = [];
  const byGame = new Map<string, PresetGroup>();
  for (const p of presets) {
    let g = byGame.get(p.game);
    if (!g) {
      g = { game: p.game, presets: [] };
      byGame.set(p.game, g);
      groups.push(g);
    }
    g.presets.push(p);
  }
  return groups;
}

/** Move `id` to the front of the recent list (deduplicated, capped). */
export function pushRecent(list: readonly string[], id: string, max = MAX_RECENT): string[] {
  return [id, ...list.filter((x) => x !== id)].slice(0, max);
}

export function toggleFavorite(list: readonly string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

/** Ids → presets (unknown or filtered-out ids are skipped). */
export function resolveIds(ids: readonly string[], presets: readonly Preset[]): Preset[] {
  const out: Preset[] = [];
  for (const id of ids) {
    const p = presets.find((x) => x.id === id);
    if (p) out.push(p);
  }
  return out;
}

/** Slug for test ids: "Magic: The Gathering" → "magic-the-gathering". */
export function slug(s: string): string {
  return normalize(s).replaceAll(" ", "-");
}

/** Parse a stored id list (kv values are unknown). */
export function idList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}
