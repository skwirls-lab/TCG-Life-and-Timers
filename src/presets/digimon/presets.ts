/**
 * Digimon Card Game (PRD §10.6). Security cards count down; the memory gauge is ONE shared global
 * counter from −10 to +10 shown as a center track (display 'track'). Positive values are on the
 * active player's side; each seat reads the gauge from its own orientation.
 */
import type { Preset } from "../../engine";
import { primary, timer } from "../builders";

export const DIGIMON = { security: "digimon.security", memory: "digimon.memory" } as const;

export const digimon: Preset = {
  id: "digimon.standard",
  version: 1,
  name: "Digimon Card Game",
  game: "Digimon Card Game",
  format: "Standard",
  description: "Security stack per player and a shared memory gauge.",
  rulesSummary:
    "Lose when you are attacked with no Security cards left, or must draw from an empty deck. Memory passing to the opponent's side ends your turn.",
  rulesUrl: "https://world.digimoncard.com/rule/",
  minPlayers: 2,
  maxPlayers: 2,
  defaultPlayers: 2,
  counters: [
    primary(
      { id: DIGIMON.security, name: "Security", icon: "shield", category: "life" },
      5,
      "down",
      {
        holdStep: 1,
        verify: true,
        threshold: { comparator: "<=", value: 0, outcome: "lose" },
        description: "Security cards remaining.",
      },
    ),
    {
      id: DIGIMON.memory,
      name: "Memory",
      icon: "memory",
      kind: "number",
      scope: "global",
      category: "resource",
      start: 0,
      min: -10,
      max: 10,
      step: 1,
      holdStep: 3,
      direction: "up",
      display: "track",
      visibility: "board",
      enabledByDefault: true,
      description: "Shared memory gauge from −10 to +10.",
    },
  ],
  capabilities: [],
  defaults: { timer: timer(), firstPlayerRule: "random" },
  builtIn: true,
};

export const DIGIMON_PRESETS: Preset[] = [digimon];
