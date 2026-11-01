// @vitest-environment node
import { describe, expect, it } from "vitest";
import { listBuiltInPresets } from "@/presets";
import {
  groupByGame,
  idList,
  normalize,
  pushRecent,
  resolveIds,
  searchPresets,
  slug,
  toggleFavorite,
} from "./model";

const all = listBuiltInPresets();
const ids = (ps: { id: string }[]) => ps.map((p) => p.id);

describe("preset picker model", () => {
  // @req PRE-003
  it("searches name, game, format and description, accent-insensitive", () => {
    expect(ids(searchPresets(all, "pokemon"))).toEqual(["pokemon.standard"]);
    expect(ids(searchPresets(all, "  POKÉMON "))).toEqual(["pokemon.standard"]);
    expect(ids(searchPresets(all, "speed duel"))).toEqual(["ygo.speed"]);
    expect(ids(searchPresets(all, "yu-gi-oh"))).toEqual(["ygo.advanced", "ygo.speed", "ygo.rush"]);
    expect(ids(searchPresets(all, "edh"))).toEqual(["mtg.commander"]);
    expect(searchPresets(all, "")).toHaveLength(all.length);
    expect(searchPresets(all, "zzz-nothing")).toEqual([]);
  });

  // @req PRE-003
  it("groups by game in registry order", () => {
    const groups = groupByGame(all);
    expect(groups.map((g) => g.game)).toEqual([
      "Magic: The Gathering",
      "Pokémon Trading Card Game",
      "Yu-Gi-Oh! Trading Card Game",
      "Yu-Gi-Oh! Rush Duel",
      "Final Fantasy Trading Card Game",
      "Disney Lorcana",
      "One Piece Card Game",
      "Star Wars: Unlimited",
      "Digimon Card Game",
      "Flesh and Blood",
      "Sorcery: Contested Realm",
      "Generic",
    ]);
    expect(groups[0]!.presets).toHaveLength(5);
  });

  // @req PRE-003
  it("keeps a deduplicated, capped recent list and toggles favorites", () => {
    expect(pushRecent([], "a")).toEqual(["a"]);
    expect(pushRecent(["a", "b", "c"], "c")).toEqual(["c", "a", "b"]);
    expect(pushRecent(["a", "b", "c", "d", "e"], "f")).toEqual(["f", "a", "b", "c", "d"]);
    expect(pushRecent(["a", "b"], "c", 2)).toEqual(["c", "a"]);
    expect(toggleFavorite(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleFavorite(["a", "b"], "a")).toEqual(["b"]);
  });

  it("resolves ids, parses stored lists and slugs", () => {
    expect(ids(resolveIds(["ygo.rush", "gone", "mtg.commander"], all))).toEqual([
      "ygo.rush",
      "mtg.commander",
    ]);
    expect(idList(["a", 3, "b"])).toEqual(["a", "b"]);
    expect(idList(undefined)).toEqual([]);
    expect(slug("Magic: The Gathering")).toBe("magic-the-gathering");
    expect(normalize("Star Wars: Unlimited")).toBe("star wars unlimited");
  });
});
