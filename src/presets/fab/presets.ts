/**
 * Flesh and Blood (PRD §10.6, PRE-011). Life comes from the hero (e.g. 20 young / 40 adult heroes),
 * set per seat (PRE-013). Action points and floating resources clear when the turn passes (CUS-008).
 */
import type { Preset } from "../../engine";
import { primary, tally, timer } from "../builders";

export const FAB = { life: "fab.life", ap: "fab.ap", resources: "fab.resources" } as const;

export const fleshAndBlood: Preset = {
  id: "fab.standard",
  version: 1,
  name: "Flesh and Blood",
  game: "Flesh and Blood",
  format: "Classic Constructed / Blitz",
  description: "Hero life set per seat, with per-turn action points and resources.",
  rulesSummary:
    "Lose at 0 life. Starting life is printed on your hero (often 40 adult / 20 young), so set it per seat.",
  rulesUrl: "https://fabtcg.com/en/resources/rules-and-policy-center/",
  minPlayers: 2,
  maxPlayers: 4,
  defaultPlayers: 2,
  counters: [
    primary({ id: FAB.life, name: "Life", icon: "heart", category: "life" }, 40, "down", {
      verify: true,
      threshold: { comparator: "<=", value: 0, outcome: "lose" },
      description: "Hero life total. Each seat can start at its hero's life.",
    }),
    tally(
      { id: FAB.ap, name: "Action points", icon: "bolt", category: "resource" },
      {
        shortName: "AP",
        start: 1,
        holdStep: 1,
        enabledByDefault: true,
        resetOnTurnPass: true,
        verify: true,
        description: "Back to 1 when your turn ends.",
      },
    ),
    tally(
      { id: FAB.resources, name: "Resources", icon: "gem", category: "resource" },
      {
        shortName: "Res",
        enabledByDefault: true,
        resetOnTurnPass: true,
        description: "Floating resource points; lost when the turn ends.",
      },
    ),
  ],
  quickStartValues: [20, 40],
  capabilities: ["perSeatStart", "perTurnFlags"],
  defaults: {
    timer: timer(),
    firstPlayerRule: "random",
    options: { turnTracking: true, resetPerTurnFlags: true },
  },
  builtIn: true,
};

export const FAB_PRESETS: Preset[] = [fleshAndBlood];
