/**
 * Yu-Gi-Oh! (PRD §10.4): high Life Point totals with step 100 / hold 1000 and the LP calculator
 * (INP-007, TOOL-006) opened by tapping the number. Rush Duel is a separate game, grouped apart.
 */
import type { CounterDefinition, Preset } from "../../engine";
import { MIN, primary, tally, timer } from "../builders";

const GAME = "Yu-Gi-Oh! Trading Card Game";
const RUSH_GAME = "Yu-Gi-Oh! Rush Duel";
const RULES_URL = "https://www.yugioh-card.com/en/rulebook/";
const SPEED_RULES_URL = "https://www.yugioh-card.com/en/speed_duel/";
const RUSH_RULES_URL = "https://www.yugioh-card.com/en/rushduel/";

export const YGO = { lp: "ygo.lp", counters: "ygo.counters" } as const;

export function lifePoints(start: number, o: Partial<CounterDefinition> = {}): CounterDefinition {
  return primary(
    { id: YGO.lp, name: "Life Points", icon: "heart", category: "life" },
    start,
    "down",
    {
      shortName: "LP",
      step: 100,
      holdStep: 1000,
      threshold: { comparator: "<=", value: 0, outcome: "lose" },
      description: "Tap the number for the calculator: −1500, +800, ½ (rounds up), =4000.",
      ...o,
    },
  );
}

const spellCounters = () =>
  tally(
    { id: YGO.counters, name: "Spell counters", icon: "book", category: "resource" },
    { shortName: "Ctr", description: "Generic counters placed on cards." },
  );

/** Shared shape of the three Yu-Gi-Oh! presets. */
function ygoPreset(
  p: Pick<
    Preset,
    | "id"
    | "name"
    | "game"
    | "format"
    | "description"
    | "rulesSummary"
    | "rulesUrl"
    | "counters"
    | "defaults"
  >,
): Preset {
  return {
    version: 1,
    minPlayers: 2,
    maxPlayers: 2,
    defaultPlayers: 2,
    quickStartValues: [4000, 8000],
    capabilities: ["calculator"],
    builtIn: true,
    ...p,
  };
}

const CALC_OPTIONS = { tapForCalculator: true } as const;

export const yugioh = ygoPreset({
  id: "ygo.advanced",
  name: "Yu-Gi-Oh! TCG",
  game: GAME,
  format: "Advanced / Traditional",
  description: "8000 Life Points with a calculator that keeps the arithmetic.",
  rulesSummary:
    "Lose at 0 LP, when you must draw from an empty Deck, or by a card's win condition.",
  rulesUrl: RULES_URL,
  counters: [lifePoints(8000), spellCounters()],
  defaults: {
    // Official matches: 40 min (⚠ VERIFY), then the End of Match procedure (⚠ VERIFY extra turns).
    timer: timer({ match: { totalMs: 40 * MIN, extraTurns: 2 } }),
    firstPlayerRule: "random",
    options: CALC_OPTIONS,
  },
});

export const speedDuel = ygoPreset({
  id: "ygo.speed",
  name: "Speed Duel",
  game: GAME,
  format: "Speed Duel",
  description: "Faster Yu-Gi-Oh! with 4000 Life Points and a smaller field.",
  rulesSummary: "Lose at 0 LP (4000 to start) or when you must draw from an empty Deck.",
  rulesUrl: SPEED_RULES_URL,
  counters: [lifePoints(4000, { verify: true }), spellCounters()],
  defaults: { timer: timer(), firstPlayerRule: "random", options: CALC_OPTIONS },
});

export const rushDuel = ygoPreset({
  id: "ygo.rush",
  name: "Rush Duel",
  game: RUSH_GAME,
  format: "Rush Duel",
  description: "Separate game with its own rules. 8000 Life Points.",
  rulesSummary: "Lose at 0 LP or when you must draw from an empty Deck.",
  rulesUrl: RUSH_RULES_URL,
  counters: [lifePoints(8000), spellCounters()],
  defaults: { timer: timer(), firstPlayerRule: "random", options: CALC_OPTIONS },
});

export const YUGIOH_PRESETS: Preset[] = [yugioh, speedDuel, rushDuel];
