/** Final Fantasy TCG (PRD §10.5): damage counts up and the 7th point loses; shown as pips. */
import type { Preset } from "../../engine";
import { MIN, primary, tally, timer } from "../builders";

export const FFTCG = { damage: "fftcg.damage", cp: "fftcg.cp" } as const;

export const fftcg: Preset = {
  id: "fftcg.standard",
  version: 1,
  name: "Final Fantasy TCG",
  game: "Final Fantasy Trading Card Game",
  format: "Standard",
  description: "Damage fills seven slots; the seventh point of damage loses.",
  rulesSummary: "Lose when you receive your 7th point of damage or must draw from an empty deck.",
  rulesUrl: "https://fftcg.square-enix-games.com/en/rules",
  minPlayers: 2,
  maxPlayers: 2,
  defaultPlayers: 2,
  counters: [
    primary({ id: FFTCG.damage, name: "Damage", icon: "damage", category: "damage" }, 0, "up", {
      max: 7,
      holdStep: 1,
      display: "pips",
      verify: true,
      threshold: { comparator: ">=", value: 7, outcome: "lose" },
      description: "Cards in your Damage Zone. Check for EX Bursts as damage is dealt.",
    }),
    tally(
      { id: FFTCG.cp, name: "CP", icon: "gem", category: "resource" },
      { resetOnTurnPass: true, description: "Crystal Points helper; clears when the turn passes." },
    ),
  ],
  capabilities: ["perTurnFlags"],
  defaults: {
    // Product suggestion: chess clock, 20 min each.
    timer: timer({ mode: "bank", bankMs: 20 * MIN }),
    firstPlayerRule: "random",
  },
  builtIn: true,
};

export const FFTCG_PRESETS: Preset[] = [fftcg];
