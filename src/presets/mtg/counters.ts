/**
 * Shared Magic: The Gathering counter library (PRD §10.2). Each preset enables a subset by
 * default; the rest stay available as optional counters.
 */
import type { CounterDefinition } from "../../engine";

type Overrides = Partial<CounterDefinition>;

export const MTG = {
  life: "mtg.life",
  poison: "mtg.poison",
  cmdDamage: "mtg.cmdDamage",
  tax: "mtg.tax",
  taxOathbreaker: "mtg.taxOathbreaker",
  taxSignature: "mtg.taxSignature",
  energy: "mtg.energy",
  exp: "mtg.exp",
  treasure: "mtg.treasure",
  rad: "mtg.rad",
  monarch: "mtg.monarch",
  initiative: "mtg.initiative",
  undercity: "mtg.undercity",
  dayNight: "mtg.dayNight",
  citysBlessing: "mtg.citysBlessing",
  speed: "mtg.speed",
  ring: "mtg.ring",
  storm: "mtg.storm",
  ko: "mtg.ko",
} as const;

export function life(start: number, o: Overrides = {}): CounterDefinition {
  return {
    id: MTG.life,
    name: "Life",
    icon: "heart",
    kind: "number",
    scope: "player",
    category: "life",
    isPrimary: true,
    start,
    min: null,
    max: null,
    step: 1,
    holdStep: 10,
    direction: "down",
    threshold: { comparator: "<=", value: 0, outcome: "lose" },
    visibility: "board",
    enabledByDefault: true,
    ...o,
  };
}

export function poison(o: Overrides = {}): CounterDefinition {
  return {
    id: MTG.poison,
    name: "Poison",
    icon: "poison",
    kind: "number",
    scope: "player",
    category: "poison",
    start: 0,
    min: 0,
    max: null,
    step: 1,
    holdStep: 1,
    direction: "up",
    threshold: { comparator: ">=", value: 10, outcome: "lose" },
    visibility: "badge",
    enabledByDefault: true,
    ...o,
  };
}

/** CMD-001..005: per target × source × commander, ≥ 21 from one commander loses, links to life. */
export function commanderDamage(o: Overrides = {}): CounterDefinition {
  return {
    id: MTG.cmdDamage,
    name: "Commander damage",
    shortName: "Cmd",
    icon: "commander",
    kind: "number",
    scope: "playerVsOpponent",
    category: "commander",
    start: 0,
    min: 0,
    max: null,
    step: 1,
    holdStep: 5,
    direction: "up",
    sourcesPerOpponent: 1,
    linkedTo: { counterId: MTG.life, factor: -1, optional: true },
    threshold: { comparator: ">=", value: 21, outcome: "lose", perSource: true },
    visibility: "board",
    enabledByDefault: true,
    description: "Damage received from each commander. 21 from a single commander loses.",
    ...o,
  };
}

function taxCounter(id: string, name: string, shortName: string, o: Overrides): CounterDefinition {
  return {
    id,
    name,
    shortName,
    icon: "tax",
    kind: "number",
    scope: "player",
    category: "tax",
    start: 0,
    min: 0,
    max: null,
    step: 1,
    direction: "up",
    visibility: "badge",
    enabledByDefault: true,
    taxMultiplier: 2,
    description: "Each tap adds one cast; the badge shows the tax (casts × 2).",
    ...o,
  };
}

/** CMD-010: one counter per commander (×2 for partners). */
export const commanderTax = (o: Overrides = {}) =>
  taxCounter(MTG.tax, "Commander tax", "C.Tax", { perCommander: true, ...o });

/** CMD-011: Oathbreaker tracks the Oathbreaker and the Signature Spell separately. */
export const oathbreakerTax = (o: Overrides = {}) =>
  taxCounter(MTG.taxOathbreaker, "Oathbreaker tax", "O.Tax", o);
export const signatureTax = (o: Overrides = {}) =>
  taxCounter(MTG.taxSignature, "Signature spell tax", "S.Tax", o);

function tally(
  id: string,
  name: string,
  icon: CounterDefinition["icon"],
  category: CounterDefinition["category"],
  o: Overrides,
): CounterDefinition {
  return {
    id,
    name,
    icon,
    kind: "number",
    scope: "player",
    category,
    start: 0,
    min: 0,
    max: null,
    step: 1,
    holdStep: 5,
    direction: "up",
    visibility: "badge",
    enabledByDefault: false,
    ...o,
  };
}

export const energy = (o: Overrides = {}) => tally(MTG.energy, "Energy", "energy", "resource", o);
export const experience = (o: Overrides = {}) =>
  tally(MTG.exp, "Experience", "exp", "resource", { shortName: "Exp", ...o });
export const treasure = (o: Overrides = {}) =>
  tally(MTG.treasure, "Treasure", "treasure", "resource", {
    description: "Convenience tracker for Treasure tokens.",
    ...o,
  });
export const rad = (o: Overrides = {}) => tally(MTG.rad, "Rad", "rad", "status", o);
export const ko = (o: Overrides = {}) =>
  tally(MTG.ko, "K.O.", "ko", "score", { description: "Generic tally.", ...o });

/** "Start your engines!" (Aetherdrift). ⚠ VERIFY max value. */
export const speed = (o: Overrides = {}) =>
  tally(MTG.speed, "Speed", "speed", "status", { max: 4, holdStep: 1, verify: true, ...o });

/** The Ring tempts you (LotR): ring-bearer level, capped at 4. ⚠ VERIFY. */
export const ring = (o: Overrides = {}) =>
  tally(MTG.ring, "The Ring tempts you", "ring", "status", {
    shortName: "Ring",
    max: 4,
    holdStep: 1,
    verify: true,
    ...o,
  });

/** Global storm count; resets when the turn passes (TOOL-011 page shows it). */
export function storm(o: Overrides = {}): CounterDefinition {
  return {
    id: MTG.storm,
    name: "Storm count",
    shortName: "Storm",
    icon: "storm",
    kind: "number",
    scope: "global",
    category: "other",
    start: 0,
    min: 0,
    max: null,
    step: 1,
    holdStep: 5,
    direction: "up",
    visibility: "panel",
    enabledByDefault: false,
    resetOnTurnPass: true,
    ...o,
  };
}

function token(
  id: string,
  name: string,
  icon: CounterDefinition["icon"],
  o: Overrides,
): CounterDefinition {
  return {
    id,
    name,
    icon,
    kind: "token",
    scope: "token",
    category: "status",
    start: 0,
    step: 1,
    direction: "up",
    visibility: "badge",
    enabledByDefault: true,
    ...o,
  };
}

/** TOK-001 */
export const monarch = (o: Overrides = {}) => token(MTG.monarch, "Monarch", "crown", o);
export const initiative = (o: Overrides = {}) =>
  token(MTG.initiative, "Initiative", "initiative", o);

/** TOK-002 (P1): Undercity room progress for the initiative holder. Optional, panel only. */
export function undercity(o: Overrides = {}): CounterDefinition {
  return {
    id: MTG.undercity,
    name: "Undercity",
    icon: "initiative",
    kind: "enum",
    scope: "player",
    category: "status",
    start: 0,
    step: 1,
    direction: "up",
    enumValues: [
      "Not entered",
      "Secret Entrance",
      "Forge / Lost Well",
      "Trap! / Arena / Stash",
      "Archives / Catacombs",
      "Throne of the Dead Three",
    ],
    enumCycleFrom: 1,
    visibility: "panel",
    enabledByDefault: false,
    ...o,
  };
}

/** TOK-003: Neither → Day → Night → Day … (never back to Neither except reset/explicit set). */
export function dayNight(o: Overrides = {}): CounterDefinition {
  return {
    id: MTG.dayNight,
    name: "Day / Night",
    icon: "daynight",
    kind: "enum",
    scope: "global",
    category: "status",
    start: 0,
    step: 1,
    direction: "up",
    enumValues: ["neither", "day", "night"],
    enumCycleFrom: 1,
    visibility: "board",
    enabledByDefault: false,
    ...o,
  };
}

/** TOK-004: permanent once gained (manual undo via the hold menu). */
export function citysBlessing(o: Overrides = {}): CounterDefinition {
  return {
    id: MTG.citysBlessing,
    name: "City's Blessing",
    icon: "ascend",
    kind: "boolean",
    scope: "player",
    category: "status",
    start: 0,
    min: 0,
    max: 1,
    step: 1,
    direction: "up",
    visibility: "badge",
    enabledByDefault: false,
    ...o,
  };
}

/** Optional counters shared by every MTG format (all off by default). */
export function optionalMtgCounters(): CounterDefinition[] {
  return [
    energy(),
    experience(),
    treasure(),
    rad(),
    dayNight(),
    citysBlessing(),
    speed(),
    ring(),
    storm(),
    ko(),
  ];
}
