/**
 * Pokémon Trading Card Game (PRD §10.3). No life total: the primary counter is Prizes remaining,
 * counting down, and taking the last prize wins. Per-turn reminders reset on PASS_TURN (CUS-008).
 */
import type { CounterDefinition, Preset } from "../../engine";
import { flag, MIN, primary, tally, timer } from "../builders";

const GAME = "Pokémon Trading Card Game";
const RULES_URL = "https://www.pokemon.com/us/pokemon-tcg/rules";

export const PKM = {
  prizes: "pkm.prizes",
  activeDamage: "pkm.activeDamage",
  asleep: "pkm.asleep",
  confused: "pkm.confused",
  paralyzed: "pkm.paralyzed",
  burned: "pkm.burned",
  poisoned: "pkm.poisoned",
  vstar: "pkm.vstar",
  gx: "pkm.gx",
  supporter: "pkm.supporter",
  energy: "pkm.energy",
  retreated: "pkm.retreated",
  stadium: "pkm.stadium",
  points: "pkm.points",
} as const;

/** Asleep / Confused / Paralyzed replace each other (rotation conditions). */
export const ROTATION_GROUP = "pkm.rotation";

const benchDamage = (n: number): CounterDefinition =>
  tally(
    { id: `pkm.bench${n}`, name: `Bench ${n} damage`, icon: "damage", category: "damage" },
    {
      shortName: `B${n}`,
      step: 10,
      holdStep: 50,
      visibility: "panel",
      description: "Damage on a Benched Pokémon (damage board panel).",
    },
  );

const condition = (
  id: string,
  name: string,
  icon: CounterDefinition["icon"],
  group?: string,
): CounterDefinition =>
  flag(
    { id, name, icon, category: "status" },
    {
      ...(group ? { exclusiveGroup: group } : {}),
      description: group
        ? "Special Condition on the Active Pokémon. Asleep, Confused and Paralyzed replace each other."
        : "Special Condition on the Active Pokémon. Can stack with the others.",
    },
  );

const perTurn = (id: string, name: string, icon: CounterDefinition["icon"]): CounterDefinition =>
  flag(
    { id, name, icon, category: "status" },
    { resetOnTurnPass: true, description: "Once-per-turn reminder; clears when the turn passes." },
  );

export const pokemonCounters = (): CounterDefinition[] => [
  primary({ id: PKM.prizes, name: "Prizes", icon: "prize", category: "score" }, 6, "down", {
    max: 6,
    holdStep: 1,
    threshold: { comparator: "<=", value: 0, outcome: "win" },
    description: "Prize cards left. Tap − when you take a prize; taking the last one wins.",
  }),
  tally(
    { id: PKM.activeDamage, name: "Active damage", icon: "damage", category: "damage" },
    {
      shortName: "Dmg",
      step: 10,
      holdStep: 50,
      enabledByDefault: true,
      description:
        "HP damage on the Active Pokémon (damage counters of 10). Reset when it is KO'd.",
    },
  ),
  benchDamage(1),
  benchDamage(2),
  benchDamage(3),
  benchDamage(4),
  benchDamage(5),
  condition(PKM.asleep, "Asleep", "moon", ROTATION_GROUP),
  condition(PKM.confused, "Confused", "star", ROTATION_GROUP),
  condition(PKM.paralyzed, "Paralyzed", "bolt", ROTATION_GROUP),
  condition(PKM.burned, "Burned", "flame"),
  condition(PKM.poisoned, "Poisoned", "poison"),
  flag(
    { id: PKM.vstar, name: "VSTAR Power used", icon: "star", category: "status" },
    { shortName: "VSTAR", description: "Once per game." },
  ),
  flag(
    { id: PKM.gx, name: "GX attack used", icon: "gem", category: "status" },
    { shortName: "GX", enabledByDefault: false, description: "Once per game (legacy formats)." },
  ),
  perTurn(PKM.supporter, "Supporter played", "book"),
  perTurn(PKM.energy, "Energy attached", "energy"),
  perTurn(PKM.retreated, "Retreated", "flag"),
  perTurn(PKM.stadium, "Stadium played", "ascend"),
];

export const pokemon: Preset = {
  id: "pokemon.standard",
  version: 1,
  name: "Pokémon TCG",
  game: GAME,
  format: "Standard",
  description: "Take all six of your Prize cards to win. Coin flips are one tap away.",
  rulesSummary:
    "Win by taking your last Prize card, when your opponent has no Pokémon in play, or when they can't draw at the start of their turn.",
  rulesUrl: RULES_URL,
  minPlayers: 2,
  maxPlayers: 2,
  defaultPlayers: 2,
  counters: pokemonCounters(),
  quickStartValues: [4, 6],
  capabilities: ["coinFlipProminent", "perTurnFlags", "firstTurnReminder"],
  defaults: {
    // Play! Pokémon best-of-three: 50 min + 3 turns (⚠ VERIFY). Per-seat clocks off.
    timer: timer({ bankMs: 15 * MIN, match: { totalMs: 50 * MIN, extraTurns: 3 } }),
    firstPlayerRule: "random",
    options: { turnTracking: true, resetPerTurnFlags: true, firstTurnReminder: true },
  },
  builtIn: true,
};

/** P2 stub: TCG Pocket-style points race (KO = 1 point, ex = 2). Hidden from pickers. */
export const pokemonPocket: Preset = {
  id: "pokemon.pocket",
  version: 1,
  name: "Pokémon TCG Pocket-style",
  game: GAME,
  format: "Pocket-style",
  description: "First to 3 points wins. Coming later.",
  rulesSummary: "A Knock Out scores 1 point (2 for an ex Pokémon). First to 3 points wins.",
  rulesUrl: RULES_URL,
  minPlayers: 2,
  maxPlayers: 2,
  defaultPlayers: 2,
  counters: [
    primary({ id: PKM.points, name: "Points", icon: "prize", category: "score" }, 0, "up", {
      holdStep: 1,
      threshold: { comparator: ">=", value: 3, outcome: "win" },
    }),
    tally(
      { id: PKM.activeDamage, name: "Active damage", icon: "damage", category: "damage" },
      { shortName: "Dmg", step: 10, holdStep: 50, enabledByDefault: true },
    ),
  ],
  capabilities: ["coinFlipProminent"],
  defaults: { timer: timer(), firstPlayerRule: "random" },
  builtIn: true,
  hidden: true,
  deferred: "P2",
};

export const POKEMON_PRESETS: Preset[] = [pokemon, pokemonPocket];
