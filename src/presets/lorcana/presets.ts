/** Disney Lorcana (PRD §10.6): race to 20 lore. */
import type { Preset } from "../../engine";
import { primary, tally, timer } from "../builders";

export const LORCANA = { lore: "lorcana.lore", ink: "lorcana.ink" } as const;

export const lorcana: Preset = {
  id: "lorcana.standard",
  version: 1,
  name: "Disney Lorcana",
  game: "Disney Lorcana",
  format: "Core Constructed",
  description: "Quest with your characters; the first to 20 lore wins.",
  rulesSummary: "Win at 20 lore. Lose if you must draw from an empty deck.",
  rulesUrl: "https://www.disneylorcana.com/en-US/resources",
  minPlayers: 2,
  maxPlayers: 4,
  defaultPlayers: 2,
  counters: [
    primary({ id: LORCANA.lore, name: "Lore", icon: "lore", category: "score" }, 0, "up", {
      holdStep: 1,
      verify: true,
      threshold: { comparator: ">=", value: 20, outcome: "win" },
    }),
    tally(
      { id: LORCANA.ink, name: "Ink", icon: "droplet", category: "resource" },
      { description: "Cards in your inkwell (optional helper)." },
    ),
  ],
  capabilities: [],
  defaults: { timer: timer(), firstPlayerRule: "random" },
  builtIn: true,
};

export const LORCANA_PRESETS: Preset[] = [lorcana];
