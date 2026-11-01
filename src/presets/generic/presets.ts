/** Generic life counter (PRD §10.6) for any game. */
import type { Preset } from "../../engine";
import { primary, tally, timer } from "../builders";

export const GENERIC = { life: "generic.life", tally: "generic.tally" } as const;

export const genericLife: Preset = {
  id: "generic.life",
  version: 1,
  name: "Life counter",
  game: "Generic",
  description: "A plain life total for any game.",
  rulesSummary: "Lose at 0 life. Change the starting life to suit your game.",
  minPlayers: 1,
  maxPlayers: 8,
  defaultPlayers: 2,
  counters: [
    primary({ id: GENERIC.life, name: "Life", icon: "heart", category: "life" }, 20, "down", {
      min: null,
      holdStep: 10,
      threshold: { comparator: "<=", value: 0, outcome: "lose" },
    }),
    tally({ id: GENERIC.tally, name: "Counter", icon: "plus", category: "other" }),
  ],
  quickStartValues: [10, 20, 30, 40],
  capabilities: [],
  defaults: { timer: timer(), firstPlayerRule: "random" },
  builtIn: true,
};

export const GENERIC_PRESETS: Preset[] = [genericLife];
