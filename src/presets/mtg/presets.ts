/** Magic: The Gathering built-in presets (PRD §10.2). */
import { defaultTimerConfig, type Preset, type PresetCapability } from "../../engine";
import {
  citysBlessing,
  commanderDamage,
  commanderTax,
  dayNight,
  energy,
  experience,
  initiative,
  ko,
  life,
  monarch,
  oathbreakerTax,
  optionalMtgCounters,
  poison,
  rad,
  ring,
  signatureTax,
  speed,
  storm,
  treasure,
  undercity,
} from "./counters";

const MIN = 60_000;
const GAME = "Magic: The Gathering";
const RULES_URL = "https://magic.wizards.com/en/rules";
/** MTG "Starting life" chips (§13.1-A). */
const QUICK_START = [20, 25, 30, 40, 60];
const SHARED_CAPS: PresetCapability[] = ["dayNight", "monarch", "initiative", "perTurnFlags"];

export const commander: Preset = {
  id: "mtg.commander",
  version: 1,
  name: "Commander",
  game: GAME,
  format: "Commander (EDH)",
  description: "Multiplayer singleton format with a legendary commander. 40 life.",
  rulesSummary:
    "Lose at 0 life, 10 poison, or 21 combat damage from a single commander. Commander tax: +2 mana per previous cast from the command zone.",
  rulesUrl: RULES_URL,
  minPlayers: 2,
  maxPlayers: 8,
  defaultPlayers: 4,
  counters: [
    life(40),
    poison(),
    commanderDamage(),
    commanderTax(),
    monarch(),
    initiative(),
    undercity(),
    ...optionalMtgCounters(),
  ],
  quickStartValues: QUICK_START,
  capabilities: ["commanderDamage", "partners", "commanderTax", ...SHARED_CAPS],
  defaults: {
    // Casual default: clocks off. Suggested clock: 25 min bank + 15 s increment (⚠ product guess).
    timer: defaultTimerConfig({ mode: "off", bankMs: 25 * MIN, incrementMs: 15_000 }),
    firstPlayerRule: "random",
    options: { commanderDamageLifeLoss: true, partnersAllowed: true },
  },
  builtIn: true,
};

function sixtyCardCounters() {
  return [
    life(20),
    poison(),
    monarch({ enabledByDefault: false }),
    initiative({ enabledByDefault: false }),
    ...optionalMtgCounters(),
  ];
}

export const constructed: Preset = {
  id: "mtg.constructed",
  version: 1,
  name: "Constructed",
  game: GAME,
  format: "Standard / Modern / Pioneer / Legacy / Vintage / Pauper",
  description: "60-card constructed formats. 20 life.",
  rulesSummary: "Lose at 0 life or 10 poison counters.",
  rulesUrl: RULES_URL,
  minPlayers: 1,
  maxPlayers: 4,
  defaultPlayers: 2,
  counters: sixtyCardCounters(),
  quickStartValues: QUICK_START,
  capabilities: [...SHARED_CAPS],
  defaults: {
    // Suggested clock: 25 min each (best-of-1).
    timer: defaultTimerConfig({ mode: "off", bankMs: 25 * MIN }),
    firstPlayerRule: "random",
  },
  builtIn: true,
};

export const limited: Preset = {
  id: "mtg.limited",
  version: 1,
  name: "Limited",
  game: GAME,
  format: "Draft / Sealed",
  description: "40-card Draft and Sealed decks. 20 life.",
  rulesSummary: "Lose at 0 life or 10 poison counters.",
  rulesUrl: RULES_URL,
  minPlayers: 2,
  maxPlayers: 2,
  defaultPlayers: 2,
  counters: sixtyCardCounters(),
  quickStartValues: QUICK_START,
  capabilities: [...SHARED_CAPS],
  defaults: {
    timer: defaultTimerConfig({ mode: "off", bankMs: 25 * MIN }),
    firstPlayerRule: "random",
  },
  builtIn: true,
};

export const brawl: Preset = {
  id: "mtg.brawl",
  version: 1,
  name: "Brawl",
  game: GAME,
  format: "Brawl",
  description: "Commander-style singleton with a smaller deck. No commander damage.",
  rulesSummary:
    "Lose at 0 life or 10 poison. Commander tax applies; commander damage does not count. ⚠ Starting life 25 (verify for your group).",
  rulesUrl: RULES_URL,
  minPlayers: 2,
  maxPlayers: 6,
  defaultPlayers: 2,
  counters: [
    life(25, { verify: true }),
    poison({ enabledByDefault: false }),
    commanderTax(),
    monarch({ enabledByDefault: false }),
    initiative({ enabledByDefault: false }),
    ...optionalMtgCounters(),
  ],
  quickStartValues: QUICK_START,
  capabilities: ["partners", "commanderTax", ...SHARED_CAPS],
  defaults: {
    timer: defaultTimerConfig({ mode: "off", bankMs: 25 * MIN }),
    firstPlayerRule: "random",
  },
  builtIn: true,
};

export const oathbreaker: Preset = {
  id: "mtg.oathbreaker",
  version: 1,
  name: "Oathbreaker",
  game: GAME,
  format: "Oathbreaker",
  description: "A planeswalker Oathbreaker plus a Signature Spell. 20 life.",
  rulesSummary:
    "Lose at 0 life or 10 poison. Tax is tracked separately for the Oathbreaker and the Signature Spell (+2 per previous cast). No commander damage.",
  rulesUrl: RULES_URL,
  minPlayers: 2,
  maxPlayers: 6,
  defaultPlayers: 4,
  counters: [
    life(20),
    poison(),
    oathbreakerTax(),
    signatureTax(),
    monarch({ enabledByDefault: false }),
    initiative({ enabledByDefault: false }),
    ...optionalMtgCounters(),
  ],
  quickStartValues: QUICK_START,
  capabilities: ["commanderTax", ...SHARED_CAPS],
  defaults: {
    timer: defaultTimerConfig({ mode: "off", bankMs: 25 * MIN }),
    firstPlayerRule: "random",
  },
  builtIn: true,
};

/** P2 stub: needs team scope (shared life 30, poison 15). Hidden from pickers. */
export const twoHeadedGiant: Preset = {
  id: "mtg.2hg",
  version: 1,
  name: "Two-Headed Giant",
  game: GAME,
  format: "Two-Headed Giant",
  description: "Two teams of two with shared life totals. Coming later.",
  rulesSummary: "Each team loses at 0 shared life or 15 poison.",
  rulesUrl: RULES_URL,
  minPlayers: 4,
  maxPlayers: 4,
  defaultPlayers: 4,
  counters: [
    life(30),
    poison({ threshold: { comparator: ">=", value: 15, outcome: "lose" } }),
    energy(),
    experience(),
    treasure(),
    dayNight(),
    storm(),
  ],
  quickStartValues: QUICK_START,
  capabilities: ["dayNight", "perTurnFlags"],
  defaults: {
    timer: defaultTimerConfig({ mode: "off" }),
    firstPlayerRule: "random",
  },
  builtIn: true,
  hidden: true,
  deferred: "P2",
};

/** P2 stub: asymmetric start values (archenemy 40, others 20) via perSeatStart. Hidden. */
export const archenemy: Preset = {
  id: "mtg.archenemy",
  version: 1,
  name: "Archenemy",
  game: GAME,
  format: "Archenemy",
  description: "One archenemy with schemes against a team. Coming later.",
  rulesSummary: "Archenemy starts at 40 life, the others at 20. Lose at 0 life or 10 poison.",
  rulesUrl: RULES_URL,
  minPlayers: 3,
  maxPlayers: 5,
  defaultPlayers: 4,
  counters: [life(20), poison(), citysBlessing(), rad(), speed(), ring(), ko(), storm()],
  quickStartValues: QUICK_START,
  capabilities: ["perSeatStart", "perTurnFlags"],
  defaults: {
    timer: defaultTimerConfig({ mode: "off" }),
    firstPlayerRule: "random",
  },
  builtIn: true,
  hidden: true,
  deferred: "P2",
};

export const MTG_PRESETS: Preset[] = [
  commander,
  constructed,
  limited,
  brawl,
  oathbreaker,
  twoHeadedGiant,
  archenemy,
];
